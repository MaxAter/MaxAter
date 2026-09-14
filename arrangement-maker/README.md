# Arrangement Maker

Standalone desktop app that generates a modern-pop arrangement from attested chart practice: structure, BPM, time signature, section lengths, energy map, instruments, and production notes.

**It never generates or suggests a song key.**

Data lives in `data/catalog.json` and is sourced in `data/SOURCES.md`. Only patterns with a citation are encoded.

## Run (web preview)

From this folder:

```bash
python3 -m http.server 4173 --directory .
```

Open http://localhost:4173/app/

## Run (Electron)

```bash
npm install
npm start
```

## Mac Dock build

Requires macOS for a signed/notarized app, but the darwin targets and a real Dock icon are already wired.

1. Put `Arrangement Maker.app` on the Dock after install.
2. Icon files: `build/icon.png` (1024) and `build/icon.icns`.
3. Rebuild the icon (any OS): `npm run build:icon`
4. Build the Mac app (on a Mac):

```bash
npm install
npm run build:mac
```

Outputs DMG/ZIP under `dist/` via electron-builder (`mac.icon` = `build/icon.icns`, category `public.app-category.music`, arm64 + x64).

Directory-only unpack for testing:

```bash
npm run build:mac:dir
```

## Tests

```bash
npm test
```

Checks that 80 generates across all lanes omit key fields, stay complete, and keep a single sub occupant.
