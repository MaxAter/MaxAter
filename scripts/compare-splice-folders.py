#!/usr/bin/env python3
"""
Compare an old Splice "packs" folder against a current "Splice live" folder.

Finds files that exist only in packs (not already in Splice live), so you can
copy over the unique leftovers without re-downloading duplicates.

Default match key: relative path + file size (fast, good for same pack layout).
Optional --by-name: match on basename + size (catches relocated duplicates).
Optional --hash: also compare SHA-256 of size-matched candidates (slower, safest).

Usage (macOS):
  python3 compare-splice-folders.py \\
    --packs "/Volumes/Kingston/packs" \\
    --live "/Volumes/Audio assets/Splice live"

  # Then review the report, and optionally copy unique files:
  python3 compare-splice-folders.py \\
    --packs "/Volumes/Kingston/packs" \\
    --live "/Volumes/Audio assets/Splice live" \\
    --copy-unique "/Volumes/Audio assets/Splice live/_from_old_packs"
"""

from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path


SKIP_NAMES = {".DS_Store", "Thumbs.db", ".Spotlight-V100", ".Trashes", ".fseventsd"}
SKIP_SUFFIXES = {".tmp", ".partial", ".crdownload"}


@dataclass(frozen=True)
class FileInfo:
    rel: str
    size: int
    path: Path


def should_skip(path: Path) -> bool:
    name = path.name
    if name in SKIP_NAMES or name.startswith("._"):
        return True
    if path.suffix.lower() in SKIP_SUFFIXES:
        return True
    return False


def iter_files(root: Path) -> list[FileInfo]:
    files: list[FileInfo] = []
    root = root.resolve()
    for dirpath, dirnames, filenames in os.walk(root):
        # Skip common junk / system dirs
        dirnames[:] = [
            d
            for d in dirnames
            if d not in {".git", ".Spotlight-V100", ".Trashes", ".fseventsd", "$RECYCLE.BIN"}
            and not d.startswith("._")
        ]
        for name in filenames:
            full = Path(dirpath) / name
            if should_skip(full):
                continue
            try:
                size = full.stat().st_size
            except OSError as exc:
                print(f"warn: could not stat {full}: {exc}", file=sys.stderr)
                continue
            rel = full.relative_to(root).as_posix()
            files.append(FileInfo(rel=rel, size=size, path=full))
    return files


def file_hash(path: Path, chunk: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            block = f.read(chunk)
            if not block:
                break
            h.update(block)
    return h.hexdigest()


def build_indexes(files: list[FileInfo]):
    by_rel_size: set[tuple[str, int]] = set()
    by_name_size: dict[tuple[str, int], list[FileInfo]] = defaultdict(list)
    for fi in files:
        by_rel_size.add((fi.rel.lower(), fi.size))
        by_name_size[(fi.path.name.lower(), fi.size)].append(fi)
    return by_rel_size, by_name_size


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Find Splice files present only in old packs, not in Splice live."
    )
    parser.add_argument(
        "--packs",
        required=True,
        type=Path,
        help='Old folder, e.g. "/Volumes/Kingston/packs"',
    )
    parser.add_argument(
        "--live",
        required=True,
        type=Path,
        help='Current folder, e.g. "/Volumes/Audio assets/Splice live"',
    )
    parser.add_argument(
        "--by-name",
        action="store_true",
        help="Treat basename+size matches as already present (even if path differs).",
    )
    parser.add_argument(
        "--hash",
        action="store_true",
        dest="use_hash",
        help="When --by-name finds a size match, confirm with SHA-256 (slower).",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=Path.home() / "Desktop" / "splice-packs-only.txt",
        help="Where to write the only-in-packs report (default: Desktop).",
    )
    parser.add_argument(
        "--copy-unique",
        type=Path,
        default=None,
        help="If set, copy only-in-packs files into this folder (preserving relative paths).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="With --copy-unique, only print what would be copied.",
    )
    args = parser.parse_args()

    packs = args.packs.expanduser()
    live = args.live.expanduser()

    if not packs.is_dir():
        print(f"error: packs folder not found: {packs}", file=sys.stderr)
        return 1
    if not live.is_dir():
        print(f"error: Splice live folder not found: {live}", file=sys.stderr)
        print(
            "Tip: open Finder → Audio assets drive → copy the folder path, or run:\n"
            '  ls /Volumes',
            file=sys.stderr,
        )
        return 1

    print(f"Scanning packs:  {packs}")
    packs_files = iter_files(packs)
    print(f"  → {len(packs_files):,} files")

    print(f"Scanning live:   {live}")
    live_files = iter_files(live)
    print(f"  → {len(live_files):,} files")

    live_rel_size, live_name_size = build_indexes(live_files)
    live_hash_cache: dict[Path, str] = {}

    only_in_packs: list[FileInfo] = []
    already_present = 0

    for fi in packs_files:
        if (fi.rel.lower(), fi.size) in live_rel_size:
            already_present += 1
            continue

        if args.by_name:
            candidates = live_name_size.get((fi.path.name.lower(), fi.size), [])
            if candidates:
                if not args.use_hash:
                    already_present += 1
                    continue
                # Confirm content hash against any same-name+size live file
                try:
                    packs_digest = file_hash(fi.path)
                except OSError as exc:
                    print(f"warn: could not hash packs file {fi.path}: {exc}", file=sys.stderr)
                    only_in_packs.append(fi)
                    continue
                matched = False
                for cand in candidates:
                    try:
                        if cand.path not in live_hash_cache:
                            live_hash_cache[cand.path] = file_hash(cand.path)
                        if live_hash_cache[cand.path] == packs_digest:
                            matched = True
                            break
                    except OSError as exc:
                        print(f"warn: could not hash live file {cand.path}: {exc}", file=sys.stderr)
                if matched:
                    already_present += 1
                    continue

        only_in_packs.append(fi)

    only_in_packs.sort(key=lambda x: x.rel.lower())
    total_bytes = sum(f.size for f in only_in_packs)

    report = args.report.expanduser()
    report.parent.mkdir(parents=True, exist_ok=True)
    with report.open("w", encoding="utf-8") as out:
        out.write("# Files only in packs (not found in Splice live)\n")
        out.write(f"# packs: {packs}\n")
        out.write(f"# live:  {live}\n")
        out.write(f"# mode:  {'by-name' if args.by_name else 'by-relative-path'}")
        out.write(f"{' + hash' if args.use_hash else ''}\n")
        out.write(f"# count: {len(only_in_packs):,} files\n")
        out.write(f"# size:  {total_bytes / (1024**3):.2f} GB\n")
        out.write(f"# already present in live: {already_present:,}\n")
        out.write("#\n")
        for fi in only_in_packs:
            out.write(f"{fi.size}\t{fi.rel}\n")

    print()
    print(f"Already in Splice live: {already_present:,}")
    print(f"Only in packs:          {len(only_in_packs):,}  ({total_bytes / (1024**3):.2f} GB)")
    print(f"Report written to:      {report}")

    if args.copy_unique is not None:
        dest_root = args.copy_unique.expanduser()
        print()
        print(f"{'Dry-run copy' if args.dry_run else 'Copying'} unique files → {dest_root}")
        copied = 0
        for fi in only_in_packs:
            dest = dest_root / fi.rel
            if args.dry_run:
                print(f"  would copy: {fi.rel}")
            else:
                dest.parent.mkdir(parents=True, exist_ok=True)
                if not dest.exists():
                    shutil.copy2(fi.path, dest)
                    copied += 1
                else:
                    print(f"  skip existing: {dest}")
        if not args.dry_run:
            print(f"Copied {copied:,} files.")

    # Show a short preview in the terminal
    preview = only_in_packs[:25]
    if preview:
        print()
        print("Preview (first 25 only-in-packs files):")
        for fi in preview:
            print(f"  {fi.rel}")
        if len(only_in_packs) > 25:
            print(f"  … and {len(only_in_packs) - 25:,} more (see report)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
