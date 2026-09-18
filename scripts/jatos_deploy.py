#!/usr/bin/env python3
"""Dry-run-first JATOS import and verified incremental asset deployment."""

from __future__ import annotations

import argparse
import json
import urllib.parse
import zipfile
import zlib
from pathlib import Path

from _jatos_api import JatosClient, unwrap_data, verify_study


def parse_jzip_identity(path: Path) -> tuple[str, str]:
    with zipfile.ZipFile(path) as archive:
        names = [name for name in archive.namelist() if name.lower().endswith(".jas")]
        if len(names) != 1:
            raise SystemExit("JZIP must contain exactly one .jas study-properties file")
        archive_root = json.loads(archive.read(names[0]).decode("utf-8"))
    if not isinstance(archive_root, dict):
        raise SystemExit("JZIP study-properties file must contain a JSON object")
    properties = archive_root.get("data", archive_root)
    if not isinstance(properties, dict):
        raise SystemExit("JZIP study-properties data must contain a JSON object")
    title = str(properties.get("title", ""))
    study_uuid = str(properties.get("uuid", ""))
    if not title or not study_uuid:
        raise SystemExit("JZIP study title/UUID is missing")
    return title, study_uuid


def list_accessible_studies(client: JatosClient) -> list[dict]:
    data = unwrap_data(client.get_json("/jatos/api/v1/studies/properties?withComponentProperties=true"))
    return data if isinstance(data, list) else [data]


def command_import(args: argparse.Namespace) -> None:
    jzip = args.jzip.resolve()
    if not jzip.is_file() or jzip.suffix.lower() != ".jzip":
        raise SystemExit("--jzip must identify an existing .jzip exported by JATOS")
    title, study_uuid = parse_jzip_identity(jzip)
    if title != args.expected_title:
        raise SystemExit(f"JZIP title mismatch: expected {args.expected_title!r}, got {title!r}")
    client = JatosClient()
    if any(str(study.get("uuid")) == study_uuid for study in list_accessible_studies(client)):
        raise SystemExit("A study with this UUID already exists; verify it before incremental update")
    endpoint = "/jatos/api/v1/studies?keepProperties=true&keepAssets=true&renameAssets=true"
    print(f"Preflight OK: {title} ({study_uuid})")
    print(f"Endpoint: {endpoint}")
    if not args.apply:
        print("Dry-run only; no study was imported.")
        return
    response, status = client.multipart_upload(endpoint, "study", jzip)
    if status != 201:
        raise SystemExit(
            "JATOS did not create a new study (expected HTTP 201). Existing properties/assets were preserved."
        )
    study = unwrap_data(response)
    print(f"Imported study id={study.get('id')} uuid={study.get('uuid')} title={study.get('title')}")


def local_adler32(path: Path) -> int:
    checksum = 1
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            checksum = zlib.adler32(chunk, checksum)
    return checksum & 0xFFFFFFFF


def command_assets(args: argparse.Namespace) -> None:
    assets_dir = args.assets_dir.resolve()
    if not assets_dir.is_dir():
        raise SystemExit("--assets-dir must identify the built study-assets directory")
    client = JatosClient()
    verify_study(client, args.study_id, args.expected_title)
    study_id = urllib.parse.quote(str(args.study_id), safe="")
    entries = unwrap_data(client.get_json(f"/jatos/api/v1/studies/{study_id}/assets/structure?flatten=true"))
    if isinstance(entries, dict):
        entries = entries.get("children", entries.get("files", []))
    remote = {
        str(entry.get("path", entry.get("name", ""))).lstrip("/"): entry
        for entry in (entries or []) if entry.get("type") == "file"
    }
    changed = []
    for path in sorted(p for p in assets_dir.rglob("*") if p.is_file()):
        relative = path.relative_to(assets_dir).as_posix()
        entry = remote.get(relative)
        try:
            checksum_matches = entry is not None and int(entry.get("checksum")) == local_adler32(path)
        except (TypeError, ValueError):
            checksum_matches = False
        size_matches = entry is not None and int(entry.get("size", -1)) == path.stat().st_size
        if not (checksum_matches and size_matches):
            changed.append((path, relative))
    print(f"Verified target study: {args.study_id} / {args.expected_title}")
    print(f"Changed or new assets: {len(changed)}")
    for _, relative in changed:
        print(f"  {relative}")
    if not args.apply:
        print("Dry-run only; no asset was uploaded.")
        return
    for path, relative in changed:
        endpoint = f"/jatos/api/v1/studies/{study_id}/assets/{urllib.parse.quote(relative, safe='/')}"
        client.multipart_upload(endpoint, "studyAssetsFile", path)
    print(f"Uploaded {len(changed)} asset(s); no remote assets were deleted.")


def main() -> None:
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    import_parser = commands.add_parser("import")
    import_parser.add_argument("--jzip", type=Path, required=True)
    import_parser.add_argument("--expected-title", required=True)
    import_parser.add_argument("--apply", action="store_true")
    import_parser.set_defaults(func=command_import)
    assets_parser = commands.add_parser("assets")
    assets_parser.add_argument("--study-id", required=True)
    assets_parser.add_argument("--expected-title", required=True)
    assets_parser.add_argument("--assets-dir", type=Path, required=True)
    assets_parser.add_argument("--apply", action="store_true")
    assets_parser.set_defaults(func=command_assets)
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
