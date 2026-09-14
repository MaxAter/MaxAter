# Cursor Mini

Floating satellite for big-picture Pro Tools automations. The chrome is built to sit next to Avid’s dark UI: metal panel, recessed LCD, latching keys, orange execute.

## Start on the Mac mini (one paste)

Open **Terminal** on the Mac mini. Pro Tools can be open with a session. Paste this whole block:

```bash
DIR="$HOME/CursorMini"
if [ ! -d "$DIR/.git" ]; then
  git clone -b cursor/start-cursor-mini-84a8 https://github.com/MaxAter/MaxAter.git "$DIR"
else
  git -C "$DIR" fetch origin cursor/start-cursor-mini-84a8
  git -C "$DIR" checkout cursor/start-cursor-mini-84a8
fi
cd "$DIR/cursor-mini" && ./start.sh
```

Or, after this branch is on GitHub:

```bash
curl -fsSL https://raw.githubusercontent.com/MaxAter/MaxAter/cursor/start-cursor-mini-84a8/cursor-mini/bootstrap.sh | bash
```

That clones into **`~/CursorMini`** (it will not change `~/MaxAter`), installs Node deps, and opens the always-on-top palette.

Need Node? The launcher runs `brew install node` when it can. Otherwise: `brew install node`

If Pro Tools is open, the LCD should say **LIVE**. If it says **DEMO**, the UI still works; markers will not hit the session until PTSL connects (`localhost:31416`).

After the first clone you can also double-click `Start Cursor Mini.command` in `~/CursorMini/cursor-mini`.

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

`ON TOP` keeps the palette above other apps. `ATTACH` parks it against the Pro Tools window.

## Preview the UI without Electron

```bash
cd cursor-mini/ui
python3 -m http.server 4173
```

Open `http://localhost:4173`. **PT HOST** simulates walking away from Pro Tools.
