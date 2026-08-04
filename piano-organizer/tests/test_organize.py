"""Tests for piano sample organizer using synthetic tones."""

from __future__ import annotations

import math
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from organize_samples import (  # noqa: E402
    analyze_file,
    hz_to_midi,
    midi_to_hz,
    midi_to_note_name,
    organize,
    register_for_midi,
    velocity_from_levels,
    yin_pitch,
)


def synth_note(midi: int, seconds: float = 0.6, sr: int = 22050, amp: float = 0.4) -> np.ndarray:
    """Simple decaying harmonic tone that behaves enough like a piano note for YIN."""
    freq = midi_to_hz(midi)
    t = np.linspace(0, seconds, int(sr * seconds), endpoint=False)
    # Harmonic series with exponential decay
    wave = np.zeros_like(t)
    for h, w in ((1, 1.0), (2, 0.45), (3, 0.2), (4, 0.1)):
        wave += w * np.sin(2 * math.pi * freq * h * t)
    env = np.exp(-2.5 * t)
    attack = np.minimum(1.0, t / 0.01)
    return (amp * attack * env * wave / np.max(np.abs(wave))).astype(np.float64)


class PitchTests(unittest.TestCase):
    def test_note_names(self):
        self.assertEqual(midi_to_note_name(60), "C4")
        self.assertEqual(midi_to_note_name(69), "A4")
        self.assertEqual(midi_to_note_name(21), "A0")

    def test_register(self):
        self.assertEqual(register_for_midi(36), "bass")
        self.assertEqual(register_for_midi(60), "mid")
        self.assertEqual(register_for_midi(84), "treble")

    def test_yin_detects_common_notes(self):
        sr = 22050
        for midi in (36, 48, 60, 64, 72, 84):
            audio = synth_note(midi, sr=sr, amp=0.5)
            freq = yin_pitch(audio, sr)
            self.assertIsNotNone(freq, msg=f"no pitch for MIDI {midi}")
            detected = hz_to_midi(freq)
            self.assertEqual(detected, midi, msg=f"expected {midi}, got {detected} ({freq:.1f} Hz)")


class OrganizeTests(unittest.TestCase):
    def test_velocity_layers_per_pitch(self):
        samples = [
            {"midi": 60, "peak_db": -20.0, "rms_db": -25.0},
            {"midi": 60, "peak_db": -12.0, "rms_db": -18.0},
            {"midi": 60, "peak_db": -6.0, "rms_db": -12.0},
            {"midi": 60, "peak_db": -1.0, "rms_db": -6.0},
        ]
        out = velocity_from_levels(samples, layers=4, mode="peak")
        layers = sorted(s["velocity_layer"] for s in out)
        self.assertEqual(layers, [1, 2, 3, 4])

    def test_end_to_end_rename(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            raw = tmp / "raw"
            out = tmp / "organized"
            raw.mkdir()

            # Three pitches × three velocities, messy source names
            plan = [
                ("take_a.wav", 48, 0.15),
                ("take_b.wav", 48, 0.35),
                ("take_c.wav", 48, 0.7),
                ("misc_01.wav", 60, 0.2),
                ("misc_02.wav", 60, 0.55),
                ("misc_03.wav", 60, 0.85),
                ("high_soft.wav", 72, 0.18),
                ("high_hard.wav", 72, 0.75),
            ]
            for name, midi, amp in plan:
                audio = synth_note(midi, amp=amp)
                sf.write(str(raw / name), audio, 22050)

            results = organize(
                inputs=list(raw.glob("*.wav")),
                out_dir=out,
                instrument="Upright",
                layers=3,
                label_style="numeric",
                folder_layout="by_register",
                dry_run=False,
                write_sfz=True,
                write_manifest=True,
            )
            self.assertEqual(len(results), 8)
            # Files landed in register folders
            self.assertTrue((out / "bass").exists() or (out / "mid").exists())
            names = {r.dest_name for r in results}
            self.assertTrue(any(n.startswith("Upright_C3_") for n in names))
            self.assertTrue(any(n.startswith("Upright_C4_") for n in names))
            self.assertTrue(any(n.startswith("Upright_C5_") for n in names))
            self.assertTrue((out / "manifest.csv").exists())
            self.assertTrue((out / "Upright.sfz").exists())
            sfz = (out / "Upright.sfz").read_text()
            self.assertIn("<region>", sfz)
            self.assertIn("pitch_keycenter=", sfz)

            # Spot-check analyze_file on one output
            sample = next(out.rglob("Upright_C4_*.wav"))
            info = analyze_file(sample)
            self.assertEqual(info["midi"], 60)


if __name__ == "__main__":
    unittest.main()
