#!/usr/bin/env python3
"""Export a verified JATOS Study Archive."""

from __future__ import annotations

import argparse
import os
import shutil
import tempfile
import urllib.parse
from pathlib import Path

from _jatos_api import JatosClient, verify_study


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--study-id", required=True)
    parser.add_argument("--expected-title", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    if output.suffix.lower() != ".jzip":
        raise SystemExit("--output must end in .jzip")
    output.parent.mkdir(parents=True, exist_ok=True)
    client = JatosClient()
    verify_study(client, args.study_id, args.expected_title)
    endpoint = f"/jatos/api/v1/studies/{urllib.parse.quote(str(args.study_id), safe='')}"
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, dir=output.parent, suffix=".part") as handle:
            temporary = Path(handle.name)
            with client.request("GET", endpoint, accept="application/zip") as response:
                shutil.copyfileobj(response, handle)
        os.replace(temporary, output)
        temporary = None
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    print(f"Exported verified study {args.study_id} to {output}")


if __name__ == "__main__":
    main()
