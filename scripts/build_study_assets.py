#!/usr/bin/env python3
"""Build exp1_fcdt JATOS assets without constructing JZIP metadata."""

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
ENTRY = "exp1_fcdt.html"
FILES = (
    "index.html", ENTRY, "exp1_fcdt.js", "style.css", "VERSION",
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
    # src/storage 是共享存储模板子模块：没取子模块时给出明确指引，
    # 而不是让 shutil 抛一个看不出原因的 FileNotFoundError。
    missing = [relative for relative in FILES if not (ROOT / relative).is_file()]
    if missing:
        hint = ""
        if any(relative.startswith("src/storage/") for relative in missing):
            hint = "\nHint: src/storage is a git submodule; run git submodule update --init --recursive"
        raise SystemExit("Missing build inputs: " + ", ".join(missing) + hint)
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
    # response_mode 由 keyboard 改为 mouse：2026-10-09 起作答改为鼠标左右键
    # experiment_type 与导出文件名 / 数据字段保持一致：exp1_fcdt
    # （response_mode=mouse：2026-10-09 起作答改为鼠标左右键）
    info = {"experiment_version": version, "git_commit": git_commit(), "built_at_utc": datetime.now(timezone.utc).isoformat(), "component_entry": ENTRY, "response_mode": "mouse", "experiment_type": "exp1_fcdt"}
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
