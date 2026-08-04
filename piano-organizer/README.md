# Piano sample organizer

Record your upright note-by-note at different dynamics, drop the files in a folder, and this tool will:

1. Detect **pitch** (MIDI note / note name)
2. Estimate **velocity** from loudness and bin it into layers
3. Tag **register** (bass / mid / treble)
4. **Rename** files into a sampler-friendly scheme
5. Optionally write an **SFZ** map + CSV manifest for import

Works with any sampler that can load WAV + SFZ (Decent Sampler, Sforzando, Kontakt via conversion, Logic Sampler, etc.).

## Setup

```bash
cd piano-organizer
python3 -m pip install -r requirements.txt
```

## Record tips

- One note per file (this tool does not split multi-note takes).
- Same mic gain for the whole session; vary how hard you play.
- Capture soft → hard for each note you care about (every key, or every 2–3 semitones).
- WAV/AIFF/FLAC/OGG are fine; stereo is mixed to mono for analysis only (files keep their channels when copied).

## Usage

Preview renames without writing anything:

```bash
python3 organize_samples.py /path/to/raw-takes --dry-run
```

Organize into a folder, with 4 velocity layers, SFZ + manifest:

```bash
python3 organize_samples.py /path/to/raw-takes \
  -o /path/to/organized \
  --instrument Upright \
  --layers 4 \
  --layout by_register \
  --sfz \
  --manifest
```

### Useful flags

| Flag | Meaning |
|------|---------|
| `--layers N` | Velocity layers 1–8 (default 4) |
| `--labels words` | Use `pp/mp/mf/ff` instead of `v01`… |
| `--layout flat\|by_register\|by_note` | Output folder structure |
| `--level peak\|rms` | Loudness metric for velocity |
| `--move` | Move files instead of copy |
| `--sfz` | Write `Upright.sfz` (or your instrument name) |
| `--manifest` | Write `manifest.csv` |
| `-r` | Scan input folders recursively |

### Output naming

```
Upright_C3_v01_bass.wav
Upright_C3_v02_bass.wav
Upright_Cs4_v03_mid.wav
Upright_A5_v04_treble.wav
```

Sharps are written as `s` (`C#4` → `Cs4`) so paths stay portable. Round-robin duplicates of the same note + layer get `_rr01`, `_rr02`, …

### Registers

| Register | MIDI | Approx. range |
|----------|------|---------------|
| bass | 21–47 | A0–B2 |
| mid | 48–71 | C3–B4 |
| treble | 72–108 | C5–C8 |

### Velocity

Within each pitch, softer takes map to lower layers and harder takes to higher ones. If you only recorded one dynamic for a note, it is placed using overall session loudness.

The SFZ splits MIDI velocity 0–127 evenly across your chosen layer count.

## Import

- **Decent Sampler / Sforzando / SFZ hosts:** open the generated `.sfz`.
- **Other samplers:** drag the renamed WAVs (or use `manifest.csv` to build a map). Filenames already encode note + velocity + register.

## Tests

```bash
python3 -m unittest discover -s tests -v
```
