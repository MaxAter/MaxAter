#!/usr/bin/env python3
"""Cursor Mini → Pro Tools PTSL bridge.

Reads one JSON command from argv or stdin and prints one JSON result.
Falls back to demo mode when py-ptsl is missing or Pro Tools is closed.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path


COMPANY = "Cursor Mini"
APP = "Cursor Mini"


def bars_to_minsec(bar: int, bpm: float) -> str:
    seconds = (bar - 1) * (4.0 * 60.0 / bpm)
    minutes = int(seconds // 60)
    rem = seconds - minutes * 60
    return f"{minutes}:{rem:06.3f}"


def bar_token(bar: int) -> str:
    return f"{bar}|1|000"


POP_FORM = [
    {"name": "Intro", "bar": 1, "bars": 8, "color": 14, "job": "Plant the hook"},
    {"name": "Verse 1", "bar": 9, "bars": 16, "color": 4, "job": "Story, sparse"},
    {"name": "Pre-Chorus 1", "bar": 25, "bars": 8, "color": 8, "job": "Lift into the title"},
    {"name": "Chorus 1", "bar": 33, "bars": 8, "color": 13, "job": "First payoff"},
    {"name": "Verse 2", "bar": 41, "bars": 16, "color": 4, "job": "New lyric, more band"},
    {"name": "Pre-Chorus 2", "bar": 57, "bars": 8, "color": 8, "job": "Bigger lift"},
    {"name": "Chorus 2", "bar": 65, "bars": 8, "color": 13, "job": "Hook plus ad-libs"},
    {"name": "Bridge", "bar": 73, "bars": 8, "color": 11, "job": "Contrast, then pickup"},
    {"name": "Final Chorus", "bar": 81, "bars": 16, "color": 15, "job": "Peak double chorus"},
    {"name": "Outro", "bar": 97, "bars": 4, "color": 2, "job": "Title tag, hard stop"},
]

RADIO_EDIT = [
    {"name": "Intro", "bar": 1, "bars": 4, "color": 14, "job": "Hook in fast"},
    {"name": "Verse 1", "bar": 5, "bars": 8, "color": 4, "job": "Tight story"},
    {"name": "Pre-Chorus 1", "bar": 13, "bars": 4, "color": 8, "job": "Lift"},
    {"name": "Chorus 1", "bar": 17, "bars": 8, "color": 13, "job": "Chorus by 0:40"},
    {"name": "Verse 2", "bar": 25, "bars": 8, "color": 4, "job": "Second verse"},
    {"name": "Pre-Chorus 2", "bar": 33, "bars": 4, "color": 8, "job": "Lift"},
    {"name": "Chorus 2", "bar": 37, "bars": 8, "color": 13, "job": "Second chorus"},
    {"name": "Bridge", "bar": 45, "bars": 8, "color": 11, "job": "Breakdown"},
    {"name": "Final Chorus", "bar": 53, "bars": 16, "color": 15, "job": "Double chorus"},
    {"name": "Outro", "bar": 69, "bars": 4, "color": 2, "job": "Hard stop"},
]

SKELETON_TRACKS = [
    ("Kick", "audio", "mono"),
    ("Snare", "audio", "mono"),
    ("Hats", "audio", "mono"),
    ("Perc", "audio", "stereo"),
    ("Loop", "audio", "stereo"),
    ("Bass", "audio", "mono"),
    ("Gtr L", "audio", "mono"),
    ("Gtr R", "audio", "mono"),
    ("Keys", "audio", "stereo"),
    ("Pad", "audio", "stereo"),
    ("Lead", "audio", "stereo"),
    ("BGV L", "audio", "mono"),
    ("BGV R", "audio", "mono"),
    ("Lead Vox", "audio", "mono"),
    ("FX", "audio", "stereo"),
    ("DRUMS", "aux", "stereo"),
    ("MUSIC", "aux", "stereo"),
    ("VOX", "aux", "stereo"),
    ("FX BUS", "aux", "stereo"),
    ("MIX", "master", "stereo"),
]

ROLE_MATCH = [
    ("drums", ("kick", "snare", "hat", "perc", "loop", "drum")),
    ("bass", ("bass",)),
    ("gtr", ("gtr", "guitar")),
    ("keys", ("key", "pad", "lead", "synth")),
    ("vox", ("vox", "vocal", "bgv", "lead vox")),
    ("fx", ("fx",)),
    ("bus", ("drums", "music", "vox", "fx bus", "mix")),
]


def form_plan(form: list[dict], bpm: float) -> list[dict]:
    planned = []
    for item in form:
        planned.append(
            {
                **item,
                "start": bar_token(item["bar"]),
                "minsec": bars_to_minsec(item["bar"], bpm),
                "comment": f"{item['bars']} bars · {item['job']} · {bpm:g} BPM",
            }
        )
    return planned


def try_open_engine():
    try:
        from ptsl import open_engine
    except ImportError:
        return None, "py-ptsl is not installed"

    try:
        engine = open_engine(company_name=COMPANY, application_name=APP)
        engine.host_ready_check()
        return engine, None
    except Exception as exc:  # noqa: BLE001
        return None, str(exc)


def track_enums(pt, kind: str, width: str):
    type_map = {
        "audio": pt.TT_Audio,
        "aux": getattr(pt, "TT_Aux", getattr(pt, "TT_Auxiliary", pt.TT_Audio)),
        "master": getattr(pt, "TT_Master", getattr(pt, "TT_MasterFader", pt.TT_Audio)),
    }
    fmt = pt.TF_Stereo if width == "stereo" else pt.TF_Mono
    timebase = getattr(pt, "TTB_Ticks", pt.TTB_Samples)
    return type_map.get(kind, pt.TT_Audio), fmt, timebase


def create_marker(engine, pt, marker: dict) -> None:
    kwargs = dict(
        start_time=marker["start"],
        end_time=marker["start"],
        name=marker["name"],
        comments=marker["comment"],
        color_index=marker["color"],
        time_properties=pt.TP_Marker,
        reference=pt.MLR_FollowTrackTimebase,
        location="MLC_MainRuler",
    )
    try:
        engine.create_memory_location(**kwargs)
        return
    except Exception:
        kwargs["start_time"] = marker["minsec"]
        kwargs["end_time"] = marker["minsec"]
        engine.create_memory_location(**kwargs)


def loc_field(loc, *names):
    for name in names:
        if hasattr(loc, name):
            value = getattr(loc, name)
            if value not in (None, ""):
                return value
    return None


def run_pop_form(engine, bpm: float, form: list[dict]) -> dict:
    import ptsl.PTSL_pb2 as pt

    planned = form_plan(form, bpm)
    created = []
    for marker in planned:
        create_marker(engine, pt, marker)
        created.append(marker["name"])
    return {"created": created, "count": len(created), "bpm": bpm}


def run_skeleton(engine) -> dict:
    import ptsl.PTSL_pb2 as pt

    created = []
    for name, kind, width in SKELETON_TRACKS:
        track_type, fmt, timebase = track_enums(pt, kind, width)
        engine.create_new_tracks(
            number_of_tracks=1,
            track_name=name,
            track_format=fmt,
            track_type=track_type,
            track_timebase=timebase,
        )
        created.append({"name": name, "kind": kind, "width": width})
    return {"created": created, "count": len(created)}


def classify_track(name: str) -> str | None:
    lowered = name.lower()
    for role, needles in ROLE_MATCH:
        if any(needle in lowered for needle in needles):
            return role
    return None


def run_color_roles(engine) -> dict:
    from ptsl import ops

    tracks = engine.track_list()
    grouped: dict[str, list[str]] = {}
    for track in tracks:
        name = loc_field(track, "name") or ""
        role = classify_track(name)
        if not role:
            continue
        grouped.setdefault(role, []).append(name)

    colored = False
    if hasattr(ops, "CId_SetTrackColor"):
        colored = True
        for role, names in grouped.items():
            if names:
                engine.select_tracks_by_name(names)

    return {
        "grouped": grouped,
        "colored": colored,
        "note": (
            "Track colors applied."
            if colored
            else "This PTSL build cannot set track color. Groups are classified for the Color Palette."
        ),
    }


def next_version_name(name: str) -> str:
    match = re.search(r"(.*?)(?:_v)(\d+)$", name)
    if match:
        return f"{match.group(1)}_v{int(match.group(2)) + 1:02d}"
    return f"{name}_v02"


def run_save_version(engine) -> dict:
    name = engine.session_name()
    path = engine.session_path()
    new_name = next_version_name(name)
    parent = str(Path(path).expanduser().parent) if path else ""
    engine.save_session()
    if parent:
        engine.save_session_as(parent, new_name)
    return {"from": name, "to": new_name, "path": parent}


def run_prep_mix(engine) -> dict:
    tracks = engine.track_list()
    names = [loc_field(t, "name") for t in tracks]
    names = [n for n in names if n]
    if names:
        try:
            engine.set_track_mute_state(names, False)
        except Exception:
            pass
        try:
            engine.set_track_solo_state(names, False)
        except Exception:
            pass
    saved = run_save_version(engine)
    return {"cleared": len(names), **saved}


def run_snapshot(engine) -> dict:
    tracks = []
    for track in engine.track_list():
        tracks.append(
            {
                "name": loc_field(track, "name"),
                "type": str(loc_field(track, "type") or ""),
            }
        )
    markers = []
    try:
        for loc in engine.get_memory_locations():
            markers.append(
                {
                    "name": loc_field(loc, "name"),
                    "number": loc_field(loc, "number", "location_number", "index"),
                    "start": loc_field(loc, "start_time", "start"),
                }
            )
    except Exception:
        markers = []

    return {
        "name": engine.session_name(),
        "path": engine.session_path(),
        "sampleRate": engine.session_sample_rate(),
        "length": engine.session_length(),
        "trackCount": len(tracks),
        "tracks": tracks,
        "markers": markers,
    }


def run_locate(engine, marker_name: str) -> dict:
    for loc in engine.get_memory_locations():
        name = loc_field(loc, "name")
        if name and name.lower() == marker_name.lower():
            number = loc_field(loc, "number", "location_number", "index")
            engine.select_memory_location(int(number))
            return {"located": name, "number": number}
    raise RuntimeError(f"No marker named {marker_name}")


def live_status(engine) -> dict:
    snap = run_snapshot(engine)
    return {
        "mode": "live",
        "connected": True,
        "session": snap["name"],
        "sampleRate": snap["sampleRate"],
        "length": snap["length"],
        "trackCount": snap["trackCount"],
        "markerCount": len(snap["markers"]),
        "markers": [m["name"] for m in snap["markers"] if m.get("name")],
    }


def demo_status() -> dict:
    return {
        "mode": "demo",
        "connected": False,
        "session": "Demo Session",
        "sampleRate": 48000,
        "length": "3:20.000",
        "trackCount": 0,
        "markerCount": 0,
        "markers": [],
        "reason": "Pro Tools is not connected. Running in demo.",
    }


def handle(command: dict, force_demo: bool) -> dict:
    cmd = command.get("cmd")
    bpm = float(command.get("bpm") or 120)
    automation = command.get("automation")
    marker = command.get("marker")

    engine = None
    error = "demo forced" if force_demo else None
    if not force_demo:
        engine, error = try_open_engine()

    try:
        if cmd == "status":
            return live_status(engine) if engine else {**demo_status(), "reason": error}

        if cmd == "locate":
            if not engine:
                return {"ok": True, "mode": "demo", "located": marker}
            return {"ok": True, "mode": "live", **run_locate(engine, marker)}

        if cmd != "run":
            raise RuntimeError(f"Unknown command {cmd}")

        if automation == "pop-form":
            result = (
                run_pop_form(engine, bpm, POP_FORM)
                if engine
                else {"created": [m["name"] for m in form_plan(POP_FORM, bpm)], "count": 10, "bpm": bpm}
            )
        elif automation == "radio-edit":
            result = (
                run_pop_form(engine, bpm, RADIO_EDIT)
                if engine
                else {"created": [m["name"] for m in form_plan(RADIO_EDIT, bpm)], "count": 10, "bpm": bpm}
            )
        elif automation == "skeleton":
            result = run_skeleton(engine) if engine else {"created": [t[0] for t in SKELETON_TRACKS], "count": len(SKELETON_TRACKS)}
        elif automation == "color-roles":
            result = run_color_roles(engine) if engine else {"grouped": {}, "colored": False, "note": "Demo: role map only"}
        elif automation == "prep-mix":
            result = run_prep_mix(engine) if engine else {"cleared": 0, "to": "Demo Session_v02"}
        elif automation == "snapshot":
            result = run_snapshot(engine) if engine else demo_status()
        elif automation == "save-version":
            result = run_save_version(engine) if engine else {"from": "Demo Session", "to": "Demo Session_v02"}
        else:
            raise RuntimeError(f"Unknown automation {automation}")

        return {
            "ok": True,
            "mode": "live" if engine else "demo",
            "automation": automation,
            "result": result,
            "at": datetime.now().isoformat(timespec="seconds"),
        }
    finally:
        if engine is not None:
            try:
                engine.close()
            except Exception:
                pass


def main() -> int:
    parser = argparse.ArgumentParser(description="Cursor Mini Pro Tools bridge")
    parser.add_argument("command", nargs="?", help="JSON command")
    parser.add_argument("--demo", action="store_true", help="Force demo mode")
    args = parser.parse_args()

    raw = args.command
    if not raw:
        raw = sys.stdin.read()
    if not raw.strip():
        raw = json.dumps({"cmd": "status"})

    try:
        command = json.loads(raw)
        payload = handle(command, force_demo=args.demo)
        if "ok" not in payload:
            payload = {"ok": True, **payload}
    except Exception as exc:  # noqa: BLE001
        payload = {"ok": False, "error": str(exc)}

    json.dump(payload, sys.stdout, default=str)
    sys.stdout.write("\n")
    return 0 if payload.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
