"""Dependency-free JATOS API client with secret-safe failures."""

from __future__ import annotations

import json
import os
import secrets
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        return None


class JatosApiError(RuntimeError):
    def __init__(self, status: int | str, endpoint: str, message: str):
        super().__init__(f"JATOS API {status} at {endpoint}: {message}")
        self.status = status
        self.endpoint = endpoint


class JatosClient:
    def __init__(self) -> None:
        base_url = os.environ.get("JATOS_BASE_URL", "").strip().rstrip("/")
        token = os.environ.get("JATOS_API_TOKEN", "")
        if not base_url:
            raise SystemExit("JATOS_BASE_URL is not set")
        if not token:
            raise SystemExit("JATOS_API_TOKEN is not set")
        parsed = urllib.parse.urlparse(base_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise SystemExit("JATOS_BASE_URL must be an absolute HTTP(S) URL")
        if parsed.scheme != "https" and parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
            raise SystemExit("JATOS_BASE_URL must use HTTPS except for localhost")
        self.base_url = base_url
        self._token = token
        self._opener = urllib.request.build_opener(_NoRedirectHandler())

    def _sanitize(self, text: str) -> str:
        return text.replace(self._token, "[REDACTED]")[:1000]

    def request(self, method: str, endpoint: str, *, body: bytes | None = None,
                content_type: str | None = None, accept: str = "application/json"):
        headers = {
            "Authorization": f"Bearer {self._token}",
            "Accept": accept,
            "User-Agent": "clt-vwm-m-jatos-migration/1",
        }
        if content_type:
            headers["Content-Type"] = content_type
        request = urllib.request.Request(
            f"{self.base_url}{endpoint}", data=body, headers=headers, method=method
        )
        try:
            response = self._opener.open(request, timeout=60)
            if not 200 <= response.status < 300:
                detail = response.read(4096).decode("utf-8", errors="replace")
                response.close()
                raise JatosApiError(response.status, endpoint, self._sanitize(detail))
            return response
        except urllib.error.HTTPError as error:
            detail = error.read(4096).decode("utf-8", errors="replace")
            raise JatosApiError(error.code, endpoint, self._sanitize(detail)) from None
        except urllib.error.URLError as error:
            raise JatosApiError("NETWORK", endpoint, self._sanitize(str(error.reason))) from None

    def get_json(self, endpoint: str) -> dict[str, Any]:
        with self.request("GET", endpoint) as response:
            return json.loads(response.read().decode("utf-8"))

    def multipart_upload(self, endpoint: str, field_name: str, file_path: Path,
                         *, accept: str = "application/json") -> tuple[dict[str, Any], int]:
        boundary = f"----cltvwmm{secrets.token_hex(16)}"
        filename = file_path.name.replace('"', "")
        file_content_type = (
            "application/zip"
            if file_path.suffix.lower() in {".jzip", ".zip"}
            else "application/octet-stream"
        )
        prefix = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"\r\n'
            f"Content-Type: {file_content_type}\r\n\r\n"
        ).encode("utf-8")
        suffix = f"\r\n--{boundary}--\r\n".encode("utf-8")
        body = prefix + file_path.read_bytes() + suffix
        with self.request("POST", endpoint, body=body,
                          content_type=f"multipart/form-data; boundary={boundary}",
                          accept=accept) as response:
            return json.loads(response.read().decode("utf-8")), response.status


def unwrap_data(payload: dict[str, Any]) -> Any:
    return payload.get("data", payload)


def verify_study(client: JatosClient, study_id: str, expected_title: str) -> dict[str, Any]:
    quoted = urllib.parse.quote(str(study_id), safe="")
    payload = client.get_json(
        f"/jatos/api/v1/studies/{quoted}/properties?withComponentProperties=true"
    )
    study = unwrap_data(payload)
    requested_id = str(study_id)
    returned_ids = {str(study.get("id", "")), str(study.get("uuid", ""))}
    if requested_id not in returned_ids:
        raise SystemExit(
            f"Target study identity mismatch: requested {requested_id!r}, "
            f"server returned id={study.get('id')!r} uuid={study.get('uuid')!r}"
        )
    actual_title = str(study.get("title", ""))
    if actual_title != expected_title:
        raise SystemExit(f"Target study title mismatch: expected {expected_title!r}, got {actual_title!r}")
    return study
