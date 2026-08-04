#!/usr/bin/env python3
"""
Organize upright-piano (or any pitched) note samples by pitch, velocity, and register.

Typical workflow:
  1. Record one note at a time at several dynamics (soft → hard).
  2. Drop the WAVs into a folder (any names are fine).
  3. Run this tool — it detects pitch + loudness, renames files, and
     can emit an SFZ map you can load in Decent Sampler, Sforzando, etc.

Examples:
  python organize_samples.py ./raw --dry-run
  python organize_samples.py ./raw -o ./organized --instrument Upright --layers 4 --sfz
  python organize_samples.py ./raw -o ./organized --move --manifest
"""

from __future__ import annotations

import argparse
import csv
import math
import re
import shutil
import sys
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable

import numpy as np
import soundfile as sf

AUDIO_EXTS = {".wav", ".aiff", ".aif", ".flac", ".ogg"}

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Piano-ish register bands (MIDI note numbers)
REGISTER_BANDS = (
    ("bass", 21, 47),    # A0 – B2
    ("mid", 48, 71),     # C3 – B4
    ("treble", 72, 108), # C5 – C8
)


@dataclass
class SampleInfo:
    source: str
    midi: int
    note: str
    frequency_hz: float
    peak_db: float
    rms_db: float
    velocity: int          # 1–127 estimated
    velocity_layer: int    # 1–N
    velocity_label: str    # e.g. v03 or mf
    register: str
    round_robin: int
    dest_name: str
    dest_path: str


def midi_to_note_name(midi: int) -> str:
    octave = (midi // 12) - 1
    return f"{NOTE_NAMES[midi % 12]}{octave}"


def hz_to_midi(hz: float) -> int:
    if hz <= 0:
        raise ValueError("frequency must be positive")
    return int(round(69 + 12 * math.log2(hz / 440.0)))


def midi_to_hz(midi: int) -> float:
    return 440.0 * (2.0 ** ((midi - 69) / 12.0))


def register_for_midi(midi: int) -> str:
    for name, lo, hi in REGISTER_BANDS:
        if lo <= midi <= hi:
            return name
    if midi < REGISTER_BANDS[0][1]:
        return "bass"
    return "treble"


def load_mono(path: Path) -> tuple[np.ndarray, int]:
    data, sr = sf.read(str(path), always_2d=True)
    mono = data.mean(axis=1).astype(np.float64)
    return mono, int(sr)


def trim_silence(audio: np.ndarray, sr: int, thresh_db: float = -40.0) -> np.ndarray:
    if len(audio) == 0:
        return audio
    frame = max(1, int(0.01 * sr))
    n = len(audio) // frame
    if n == 0:
        return audio
    frames = audio[: n * frame].reshape(n, frame)
    rms = np.sqrt(np.mean(frames ** 2, axis=1) + 1e-20)
    db = 20 * np.log10(rms + 1e-20)
    active = np.where(db > thresh_db)[0]
    if len(active) == 0:
        return audio
    start = max(0, active[0] * frame - frame)
    end = min(len(audio), (active[-1] + 1) * frame + frame)
    return audio[start:end]


def yin_pitch(audio: np.ndarray, sr: int, fmin: float = 27.5, fmax: float = 4200.0) -> float | None:
    """
    Lightweight YIN-style pitch estimate.
    Returns fundamental frequency in Hz, or None if unreliable.
    """
    if len(audio) < sr // 10:
        return None

    # Use a stable window after the attack (piano attack can confuse pitch)
    start = min(len(audio) - 1, int(0.05 * sr))
    win_len = min(len(audio) - start, int(0.35 * sr))
    if win_len < int(0.05 * sr):
        win = audio
    else:
        win = audio[start : start + win_len]

    # Remove DC and light window
    win = win - np.mean(win)
    if np.max(np.abs(win)) < 1e-8:
        return None
    win = win * np.hanning(len(win))

    tau_min = max(2, int(sr / fmax))
    tau_max = min(len(win) // 2, int(sr / fmin))
    if tau_max <= tau_min + 2:
        return None

    # Difference function
    w = win
    n = len(w)
    # Autocorrelation via FFT for speed
    nfft = 1 << (2 * n - 1).bit_length()
    W = np.fft.rfft(w, nfft)
    acf = np.fft.irfft(W * np.conj(W), nfft)[:n]
    # d(tau) ≈ energy of residual between signal and delayed copy
    d = np.empty(tau_max + 1, dtype=np.float64)
    d[0] = 0.0
    for tau in range(1, tau_max + 1):
        e0 = np.sum(w[: n - tau] ** 2)
        e1 = np.sum(w[tau:] ** 2)
        d[tau] = e0 + e1 - 2.0 * acf[tau]

    # Cumulative mean normalized difference
    cmnd = np.ones_like(d)
    running = 0.0
    for tau in range(1, tau_max + 1):
        running += d[tau]
        cmnd[tau] = d[tau] / (running / tau) if running > 0 else 1.0

    # Absolute threshold
    threshold = 0.15
    tau_est = None
    for tau in range(tau_min, tau_max):
        if cmnd[tau] < threshold:
            # local minimum
            while tau + 1 < tau_max and cmnd[tau + 1] < cmnd[tau]:
                tau += 1
            tau_est = tau
            break

    if tau_est is None:
        # fall back to global min in range
        region = cmnd[tau_min:tau_max]
        if len(region) == 0 or np.min(region) > 0.45:
            return None
        tau_est = int(np.argmin(region) + tau_min)

    # Parabolic interpolation
    if 1 <= tau_est < len(cmnd) - 1:
        y0, y1, y2 = cmnd[tau_est - 1], cmnd[tau_est], cmnd[tau_est + 1]
        denom = y0 - 2 * y1 + y2
        if abs(denom) > 1e-12:
            tau_est = tau_est + (y0 - y2) / (2 * denom)

    freq = sr / float(tau_est)
    if not (fmin <= freq <= fmax):
        return None
    return float(freq)


def measure_levels(audio: np.ndarray) -> tuple[float, float]:
    peak = float(np.max(np.abs(audio)) + 1e-20)
    rms = float(np.sqrt(np.mean(audio ** 2) + 1e-20))
    peak_db = 20 * math.log10(peak)
    rms_db = 20 * math.log10(rms)
    return peak_db, rms_db


def analyze_file(path: Path) -> dict:
    audio, sr = load_mono(path)
    audio = trim_silence(audio, sr)
    freq = yin_pitch(audio, sr)
    if freq is None:
        raise RuntimeError(f"could not detect pitch in {path.name}")
    midi = hz_to_midi(freq)
    # Clamp to piano range with a little slack
    midi = max(21, min(108, midi))
    peak_db, rms_db = measure_levels(audio)
    return {
        "path": path,
        "midi": midi,
        "note": midi_to_note_name(midi),
        "frequency_hz": freq,
        "peak_db": peak_db,
        "rms_db": rms_db,
        "register": register_for_midi(midi),
    }


def velocity_from_levels(
    samples: list[dict],
    layers: int,
    mode: str = "peak",
) -> list[dict]:
    """
    Map amplitude to MIDI velocity 1–127 and discrete layers 1..N.

    By default, levels are ranked *within each pitch* so soft/loud takes of
    the same note land in different layers even if absolute gain drifts.
    If a pitch has only one take, fall back to global ranking across the batch.
    """
    key = "peak_db" if mode == "peak" else "rms_db"
    global_vals = np.array([s[key] for s in samples], dtype=np.float64)
    g_lo, g_hi = float(np.min(global_vals)), float(np.max(global_vals))
    g_span = max(1e-6, g_hi - g_lo)

    by_midi: dict[int, list[dict]] = {}
    for s in samples:
        by_midi.setdefault(s["midi"], []).append(s)

    out: list[dict] = []
    for midi, group in by_midi.items():
        vals = np.array([g[key] for g in group], dtype=np.float64)
        if len(group) == 1:
            lo, hi, span = g_lo, g_hi, g_span
        else:
            lo, hi = float(np.min(vals)), float(np.max(vals))
            span = max(1e-6, hi - lo)
        # Sort soft→loud for stable layer assignment when tied
        ranked = sorted(enumerate(group), key=lambda iv: iv[1][key])
        for order, (idx, s) in enumerate(ranked):
            v = s[key]
            # Continuous MIDI velocity
            norm = (v - lo) / span
            vel = int(round(1 + norm * 126))
            vel = max(1, min(127, vel))
            # Discrete layers: prefer rank when few takes, else amplitude bins
            if len(group) <= layers:
                layer = order + 1
                # stretch across requested layer count if fewer takes
                if len(group) > 1:
                    layer = 1 + int(round(order * (layers - 1) / (len(group) - 1)))
                else:
                    layer = 1 + int(round(norm * (layers - 1)))
            else:
                layer = 1 + int(min(layers - 1, math.floor(norm * layers)))
            layer = max(1, min(layers, layer))
            s2 = dict(s)
            s2["velocity"] = vel
            s2["velocity_layer"] = layer
            out.append(s2)
    return out


LAYER_WORDS = {
    1: ["pp"],
    2: ["p", "f"],
    3: ["p", "mf", "f"],
    4: ["pp", "mp", "mf", "ff"],
    5: ["pp", "p", "mp", "mf", "ff"],
    6: ["pp", "p", "mp", "mf", "f", "ff"],
}


def layer_label(layer: int, layers: int, style: str) -> str:
    if style == "words" and layers in LAYER_WORDS and 1 <= layer <= layers:
        return LAYER_WORDS[layers][layer - 1]
    width = max(2, len(str(layers)))
    return f"v{layer:0{width}d}"


def assign_round_robins(samples: list[dict]) -> list[dict]:
    """Identical pitch+velocity-layer gets rr01, rr02, …"""
    counts: dict[tuple[int, int], int] = {}
    out = []
    # Stable order by source name
    for s in sorted(samples, key=lambda x: x["path"].name.lower()):
        key = (s["midi"], s["velocity_layer"])
        counts[key] = counts.get(key, 0) + 1
        s2 = dict(s)
        s2["round_robin"] = counts[key]
        out.append(s2)
    return out


def safe_stem(s: str) -> str:
    s = re.sub(r"[^\w\-]+", "_", s.strip())
    return s.strip("_") or "Sample"


def build_dest_name(
    s: dict,
    instrument: str,
    layers: int,
    label_style: str,
    include_register: bool,
    include_rr: bool,
) -> str:
    inst = safe_stem(instrument)
    note = s["note"].replace("#", "s")  # C#3 → Cs3 (filesystem-friendly)
    vel = layer_label(s["velocity_layer"], layers, label_style)
    parts = [inst, note, vel]
    if include_register:
        parts.append(s["register"])
    if include_rr and s.get("round_robin", 1) > 1:
        parts.append(f"rr{s['round_robin']:02d}")
    elif include_rr:
        # Always include rr when any duplicates exist for this key — handled by caller flag
        parts.append(f"rr{s['round_robin']:02d}")
    return "_".join(parts) + s["path"].suffix.lower()


def needs_rr(samples: list[dict]) -> bool:
    seen: dict[tuple[int, int], int] = {}
    for s in samples:
        key = (s["midi"], s["velocity_layer"])
        seen[key] = seen.get(key, 0) + 1
        if seen[key] > 1:
            return True
    return False


def organize(
    inputs: Iterable[Path],
    out_dir: Path,
    instrument: str = "Upright",
    layers: int = 4,
    level_mode: str = "peak",
    label_style: str = "numeric",
    folder_layout: str = "flat",  # flat | by_register | by_note
    dry_run: bool = False,
    move: bool = False,
    write_sfz: bool = False,
    write_manifest: bool = False,
) -> list[SampleInfo]:
    files = sorted(
        [p for p in inputs if p.is_file() and p.suffix.lower() in AUDIO_EXTS],
        key=lambda p: p.name.lower(),
    )
    if not files:
        raise SystemExit("No audio files found (.wav/.aiff/.flac/.ogg).")

    analyzed: list[dict] = []
    errors: list[str] = []
    for path in files:
        try:
            analyzed.append(analyze_file(path))
            print(f"  detected  {path.name:40s}  →  {analyzed[-1]['note']:4s}  "
                  f"{analyzed[-1]['peak_db']:6.1f} dB peak  [{analyzed[-1]['register']}]")
        except Exception as e:
            errors.append(f"{path.name}: {e}")
            print(f"  SKIP      {path.name}: {e}", file=sys.stderr)

    if not analyzed:
        raise SystemExit("No samples could be analyzed.")

    analyzed = velocity_from_levels(analyzed, layers=layers, mode=level_mode)
    analyzed = assign_round_robins(analyzed)
    use_rr = needs_rr(analyzed)

    # Ensure unique destination names
    used_names: set[str] = set()
    results: list[SampleInfo] = []

    if not dry_run:
        out_dir.mkdir(parents=True, exist_ok=True)

    for s in analyzed:
        dest_name = build_dest_name(
            s, instrument, layers, label_style,
            include_register=True,
            include_rr=use_rr,
        )
        # Collision guard
        base = Path(dest_name)
        n = 2
        while dest_name.lower() in used_names:
            dest_name = f"{base.stem}_{n}{base.suffix}"
            n += 1
        used_names.add(dest_name.lower())

        if folder_layout == "by_register":
            dest_path = out_dir / s["register"] / dest_name
        elif folder_layout == "by_note":
            dest_path = out_dir / s["note"].replace("#", "s") / dest_name
        else:
            dest_path = out_dir / dest_name

        info = SampleInfo(
            source=str(s["path"]),
            midi=s["midi"],
            note=s["note"],
            frequency_hz=round(s["frequency_hz"], 3),
            peak_db=round(s["peak_db"], 2),
            rms_db=round(s["rms_db"], 2),
            velocity=s["velocity"],
            velocity_layer=s["velocity_layer"],
            velocity_label=layer_label(s["velocity_layer"], layers, label_style),
            register=s["register"],
            round_robin=s["round_robin"],
            dest_name=dest_name,
            dest_path=str(dest_path),
        )
        results.append(info)

        action = "MOVE" if move else "COPY"
        print(f"  {action:4s}     {Path(info.source).name:40s}  →  {Path(info.dest_path).relative_to(out_dir) if out_dir in Path(info.dest_path).parents or Path(info.dest_path).parent == out_dir else info.dest_name}")

        if not dry_run:
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            if move:
                shutil.move(str(s["path"]), str(dest_path))
            else:
                shutil.copy2(str(s["path"]), str(dest_path))

    results.sort(key=lambda r: (r.midi, r.velocity_layer, r.round_robin))

    if write_manifest and not dry_run:
        man = out_dir / "manifest.csv"
        with man.open("w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(asdict(results[0]).keys()))
            w.writeheader()
            for r in results:
                w.writerow(asdict(r))
        print(f"\nWrote {man}")

    if write_sfz and not dry_run:
        sfz_path = out_dir / f"{safe_stem(instrument)}.sfz"
        write_sfz_file(sfz_path, results, layers=layers, instrument=instrument)
        print(f"Wrote {sfz_path}")

    if errors:
        print(f"\n{len(errors)} file(s) skipped.", file=sys.stderr)

    print(f"\nDone: {len(results)} sample(s) organized"
          + (" (dry run — nothing written)" if dry_run else f" → {out_dir}"))
    return results


def write_sfz_file(path: Path, samples: list[SampleInfo], layers: int, instrument: str) -> None:
    """
    Emit a basic SFZ that maps each sample to its MIDI note and velocity layer.
    Round-robins of the same note+layer are alternated with seq_position.
    """
    # Group by midi + velocity_layer
    groups: dict[tuple[int, int], list[SampleInfo]] = {}
    for s in samples:
        groups.setdefault((s.midi, s.velocity_layer), []).append(s)

    # Velocity ranges split evenly across layers
    def vel_range(layer: int) -> tuple[int, int]:
        lo = int(round((layer - 1) * 127 / layers))
        hi = int(round(layer * 127 / layers)) - 1
        if layer == layers:
            hi = 127
        if layer == 1:
            lo = 0
        return max(0, lo), min(127, hi)

    lines = [
        f"// {instrument} — auto-generated by organize_samples.py",
        "// Import into Decent Sampler / Sforzando / any SFZ host",
        "",
        "<control>",
        f"label_cc7=Volume",
        "",
        "<global>",
        "ampeg_attack=0.001",
        "ampeg_release=0.4",
        "",
    ]

    for (midi, layer), group in sorted(groups.items()):
        lovel, hivel = vel_range(layer)
        # Pitch keycenter = detected note; key range ±0 (exact) by default —
        # stretch one semitone either side so sparse mappings still play.
        lokey = max(0, midi)
        hikey = min(127, midi)
        rr_count = len(group)
        for i, s in enumerate(sorted(group, key=lambda x: x.round_robin), start=1):
            # Relative path from SFZ location
            sample_rel = Path(s.dest_path).name
            parent = Path(s.dest_path).parent
            if parent != path.parent:
                sample_rel = str(Path(s.dest_path).relative_to(path.parent))
            lines.append("<region>")
            lines.append(f"sample={sample_rel}")
            lines.append(f"pitch_keycenter={midi}")
            lines.append(f"lokey={lokey} hikey={hikey}")
            lines.append(f"lovel={lovel} hivel={hivel}")
            if rr_count > 1:
                lines.append(f"seq_length={rr_count}")
                lines.append(f"seq_position={i}")
            lines.append("")

    path.write_text("\n".join(lines), encoding="utf-8")


def collect_inputs(paths: list[Path], recursive: bool) -> list[Path]:
    files: list[Path] = []
    for p in paths:
        if p.is_file():
            files.append(p)
        elif p.is_dir():
            pattern = "**/*" if recursive else "*"
            for child in sorted(p.glob(pattern)):
                if child.is_file() and child.suffix.lower() in AUDIO_EXTS:
                    files.append(child)
        else:
            print(f"Warning: not found: {p}", file=sys.stderr)
    # de-dupe preserving order
    seen = set()
    unique = []
    for f in files:
        rp = f.resolve()
        if rp not in seen:
            seen.add(rp)
            unique.append(f)
    return unique


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Organize piano note samples by pitch, velocity, and register.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument("inputs", nargs="+", type=Path, help="Input files or folders of recordings")
    p.add_argument("-o", "--output", type=Path, default=Path("./organized"),
                   help="Output folder (default: ./organized)")
    p.add_argument("--instrument", default="Upright", help="Name prefix for files / SFZ")
    p.add_argument("--layers", type=int, default=4, choices=range(1, 9),
                   metavar="N", help="Velocity layer count 1–8 (default: 4)")
    p.add_argument("--level", choices=["peak", "rms"], default="peak",
                   help="Amplitude metric for velocity (default: peak)")
    p.add_argument("--labels", choices=["numeric", "words"], default="numeric",
                   help="Velocity label style: v01.. or pp/mp/mf/ff")
    p.add_argument("--layout", choices=["flat", "by_register", "by_note"], default="flat",
                   help="Folder layout for organized samples")
    p.add_argument("-r", "--recursive", action="store_true", help="Scan folders recursively")
    p.add_argument("--move", action="store_true", help="Move files instead of copying")
    p.add_argument("--sfz", action="store_true", help="Write an SFZ instrument map")
    p.add_argument("--manifest", action="store_true", help="Write manifest.csv")
    p.add_argument("--dry-run", action="store_true", help="Analyze and show renames without writing")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    files = collect_inputs(args.inputs, recursive=args.recursive)
    print(f"Analyzing {len(files)} file(s)…\n")
    organize(
        inputs=files,
        out_dir=args.output,
        instrument=args.instrument,
        layers=args.layers,
        level_mode=args.level,
        label_style=args.labels,
        folder_layout=args.layout,
        dry_run=args.dry_run,
        move=args.move,
        write_sfz=args.sfz,
        write_manifest=args.manifest,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
