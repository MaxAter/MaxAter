# Cursor Mini

Floating satellite for big-picture Pro Tools automations. The chrome is built to sit next to Avid’s dark UI: metal panel, recessed LCD, latching keys, orange execute.

## Run on your Mac (now)

Pro Tools open, session loaded, then in Terminal:

```bash
cd /path/to/MaxAter
git fetch origin cursor/cursor-mini-avid-eefc
git checkout cursor/cursor-mini-avid-eefc
cd cursor-mini
./start.sh
```

That installs Node deps, installs `py-ptsl`, and opens the always-on-top palette. If Pro Tools is open, the LCD should say **LIVE**. If it says **DEMO**, the UI still works; markers will not hit the session until PTSL connects (`localhost:31416`).

Need Node? `brew install node`

## What it does

The palette stays on top of other windows. When Pro Tools is frontmost it attaches to the edit window. Each key arms a session-level move; **Execute** runs it.

| Key | Automation |
| --- | --- |
| **POP FORM** | Drops the 3:20 radio-pop map (Intro → Outro, 100 bars) as memory locations |
| **RADIO EDIT** | Tighter hit form, chorus on by bar 17 |
| **SESSION SKELETON** | 20-track pop template: drums, band, vox, stem auxes, MIX |
| **COLOR ROLES** | Groups tracks by role; colors them when PTSL supports it |
| **PREP MIX** | Clears mute/solo and saves the next session version |
| **SNAPSHOT** | Reads session name, tracks, and markers into the scribble |

Locate keys jump to those markers after a form is laid down. Tempo on the panel is used when writing marker times.

## Run on the Mac mini

```bash
cd cursor-mini
npm install
python3 -m pip install -r host/requirements.txt
npm start
```

Pro Tools must be open, with a session loaded, for **LIVE** mode. Cursor Mini talks to PTSL on `localhost:31416` through `host/protools_bridge.py` (`py-ptsl`). If Pro Tools is closed, the panel still works in **DEMO** so you can learn the surface.

`ON TOP` keeps the palette above other apps. `ATTACH` parks it against the Pro Tools window.

## Preview the UI without Electron

```bash
cd cursor-mini/ui
python3 -m http.server 4173
```

Open `http://localhost:4173`. **PT HOST** simulates walking away from Pro Tools.
