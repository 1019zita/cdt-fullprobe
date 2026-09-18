#!/usr/bin/env python3
"""Build Full-Probe JATOS assets without constructing JZIP metadata."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "build" / "study-assets"
ENTRY = "full_probe.html"
FILES = (
    "index.html", ENTRY, "full_probe.js", "style.css", "VERSION",
    "vendor/xlsx.full.min.js", "src/storage/index.js", "src/storage/jatos-storage.js",
)

def git_commit() -> str:
    result = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, check=True, capture_output=True, text=True)
    return result.stdout.strip()

def transform_html(source: str) -> str:
    replacements = {
        "window.CLT_STORAGE_BACKEND = 'supabase';": "window.CLT_STORAGE_BACKEND = 'jatos';",
        '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>': '<script src="jatos.js"></script>',
        '<script src="src/storage/supabase-storage.js"></script>': '<script src="src/storage/jatos-storage.js"></script>',
    }
    for old, new in replacements.items():
        if old not in source:
            raise RuntimeError(f"Expected HTML marker is missing: {old}")
        source = source.replace(old, new, 1)
    return source

def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def build(output: Path) -> None:
    if output.exists(): shutil.rmtree(output)
    output.mkdir(parents=True)
    for relative in FILES:
        source, target = ROOT / relative, output / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if relative == ENTRY:
            target.write_text(transform_html(source.read_text(encoding="utf-8")), encoding="utf-8")
        else:
            shutil.copy2(source, target)
    version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
    info = {"experiment_version": version, "git_commit": git_commit(), "built_at_utc": datetime.now(timezone.utc).isoformat(), "component_entry": ENTRY, "response_mode": "keyboard", "experiment_type": "FullProbe"}
    (output / "build-info.json").write_text(json.dumps(info, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = [f"{sha256(path)}  {path.relative_to(output).as_posix()}" for path in sorted(p for p in output.rglob("*") if p.is_file())]
    (output / "MANIFEST.sha256").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Built JATOS study assets: {output}")

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    output = parser.parse_args().output.resolve()
    if output == ROOT or (ROOT in output.parents and output.name in {"src", "docs", "scripts", "vendor"}):
        raise SystemExit("Refusing to overwrite a source directory")
    build(output)

if __name__ == "__main__": main()
