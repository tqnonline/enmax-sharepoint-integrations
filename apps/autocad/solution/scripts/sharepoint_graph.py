"""Microsoft Graph helpers for GEN-POC SharePoint libraries (DEV/UAT)."""
from __future__ import annotations

import os
from urllib.parse import urlparse

import requests

GRAPH_ROOT = "https://graph.microsoft.com/v1.0"
_site_ids: dict[str, str] = {}
_drive_ids: dict[tuple[str, str], str] = {}


def graph_token() -> str:
    """Return a Graph access token from GRAPH_ACCESS_TOKEN or SHAREPOINT_ACCESS_TOKEN."""
    for name in ("GRAPH_ACCESS_TOKEN", "SHAREPOINT_ACCESS_TOKEN"):
        tok = os.environ.get(name, "").strip()
        if tok:
            return tok
    raise RuntimeError(
        "GRAPH_ACCESS_TOKEN required. Example:\n"
        "  az account get-access-token --resource https://graph.microsoft.com --query accessToken -o tsv"
    )


def _library_parts(library_url: str) -> tuple[str, str, str]:
    parsed = urlparse(library_url.rstrip("/"))
    parts = [p for p in parsed.path.split("/") if p]
    if len(parts) < 2:
        raise ValueError(f"Cannot parse library URL: {library_url}")
    return parsed.netloc, "/" + "/".join(parts[:-1]), parts[-1]


def _site_id(hostname: str, site_path: str, token: str) -> str:
    key = f"{hostname}:{site_path}"
    if key in _site_ids:
        return _site_ids[key]
    resp = requests.get(
        f"{GRAPH_ROOT}/sites/{hostname}:{site_path}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=60,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"Cannot resolve site {site_path} ({resp.status_code}): {resp.text[:300]}")
    site_id = resp.json()["id"]
    _site_ids[key] = site_id
    return site_id


def _drive_id(hostname: str, site_path: str, drive_name: str, token: str) -> str:
    key = (hostname, drive_name)
    if key in _drive_ids:
        return _drive_ids[key]
    site_id = _site_id(hostname, site_path, token)
    resp = requests.get(
        f"{GRAPH_ROOT}/sites/{site_id}/drives",
        headers={"Authorization": f"Bearer {token}"},
        timeout=60,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"Cannot list drives for {site_path} ({resp.status_code}): {resp.text[:300]}")
    for drive in resp.json().get("value", []):
        if drive.get("name") == drive_name:
            _drive_ids[key] = drive["id"]
            return drive["id"]
    raise RuntimeError(f"Drive '{drive_name}' not found under {site_path}")


def upload_pdf(library_url: str, file_name: str, token: str, content: bytes) -> str:
    """Upload a PDF to a library root folder; returns the file web URL."""
    hostname, site_path, drive_name = _library_parts(library_url)
    drive_id = _drive_id(hostname, site_path, drive_name, token)
    endpoint = (
        f"{GRAPH_ROOT}/drives/{drive_id}/root:/{file_name}:/content"
        "?@microsoft.graph.conflictBehavior=replace"
    )
    resp = requests.put(
        endpoint,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/pdf",
        },
        data=content,
        timeout=120,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"Graph upload failed ({resp.status_code}): {resp.text[:300]}")
    return resp.json().get("webUrl") or f"{library_url.rstrip('/')}/{file_name}"


def list_pdfs(library_url: str, token: str) -> list[dict]:
    """Return [{fileName, absoluteUrl, serverRelativeUrl}] for PDFs in a library root."""
    hostname, site_path, drive_name = _library_parts(library_url)
    drive_id = _drive_id(hostname, site_path, drive_name, token)
    endpoint = f"{GRAPH_ROOT}/drives/{drive_id}/root/children"
    results: list[dict] = []
    while endpoint:
        resp = requests.get(
            endpoint,
            headers={"Authorization": f"Bearer {token}"},
            timeout=120,
        )
        if resp.status_code >= 400:
            raise RuntimeError(
                f"Cannot list {library_url} ({resp.status_code}): {resp.text[:300]}"
            )
        body = resp.json()
        for item in body.get("value", []):
            name = item.get("name", "")
            if not name.lower().endswith(".pdf"):
                continue
            web_url = item.get("webUrl", "")
            rel = urlparse(web_url).path if web_url else ""
            results.append({
                "fileName": name,
                "absoluteUrl": web_url,
                "serverRelativeUrl": rel,
            })
        endpoint = body.get("@odata.nextLink")
    return results
