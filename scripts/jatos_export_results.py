#!/usr/bin/env python3
"""Export JATOS results to an explicitly chosen lab backup directory."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from _jatos_api import JatosClient, verify_study


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--study-id", required=True)
    parser.add_argument("--expected-title", required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--label", default="clt-vwm-m")
    args = parser.parse_args()
    output_dir = args.output_dir.resolve()
    repository_root = Path(__file__).resolve().parents[1]
    try:
        output_dir.relative_to(repository_root)
    except ValueError:
        pass
    else:
        raise SystemExit("--output-dir must be outside the Git repository; choose the approved lab cloud directory")
    output_dir.mkdir(parents=True, exist_ok=True)
    client = JatosClient()
    study = verify_study(client, args.study_id, args.expected_title)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output = output_dir / f"{args.label}_jatos_results_{timestamp}.zip"
    study_id = int(args.study_id) if str(args.study_id).isdigit() else args.study_id
    body = json.dumps({"studyIds": study_id}).encode("utf-8")
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, dir=output_dir, suffix=".part") as handle:
            temporary = Path(handle.name)
            with client.request("POST", "/jatos/api/v1/results", body=body,
                                content_type="application/json", accept="application/zip") as response:
                shutil.copyfileobj(response, handle)
        os.replace(temporary, output)
        temporary = None
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    digest = sha256(output)
    manifest = {
        "study_id": study.get("id", args.study_id),
        "study_uuid": study.get("uuid"),
        "study_title": study.get("title"),
        "exported_at_utc": datetime.now(timezone.utc).isoformat(),
        "archive": output.name,
        "sha256": digest,
    }
    output.with_suffix(".manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    output.with_suffix(".sha256").write_text(f"{digest}  {output.name}\n", encoding="ascii")
    print(f"Exported results backup: {output}")
    print(f"SHA-256: {digest}")


if __name__ == "__main__":
    main()
