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


def upload_file(
    library_url: str,
    folder_path: str,
    file_name: str,
    token: str,
    content: bytes,
    content_type: str = "application/octet-stream",
) -> str:
    """Upload a file into a library, creating `folder_path` implicitly if needed.

    Graph's path-addressed PUT .../content endpoint auto-creates missing
    intermediate folders, so no separate mkdir pass is required.
    """
    hostname, site_path, drive_name = _library_parts(library_url)
    drive_id = _drive_id(hostname, site_path, drive_name, token)
    clean_folder = folder_path.strip("/")
    item_path = f"{clean_folder}/{file_name}" if clean_folder else file_name
    endpoint = (
        f"{GRAPH_ROOT}/drives/{drive_id}/root:/{item_path}:/content"
        "?@microsoft.graph.conflictBehavior=replace"
    )
    resp = requests.put(
        endpoint,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": content_type,
        },
        data=content,
        timeout=120,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"Graph upload failed ({resp.status_code}): {resp.text[:300]}")
    return resp.json().get("webUrl") or f"{library_url.rstrip('/')}/{item_path}"


def upload_pdf(library_url: str, file_name: str, token: str, content: bytes) -> str:
    """Upload a PDF to a library root folder; returns the file web URL."""
    return upload_file(library_url, "", file_name, token, content, content_type="application/pdf")


# SharePoint "Record Type" choice column internal name is not guessable from the
# display label alone (spaces are typically encoded as _x0020_ but managed
# metadata / choice columns vary by list template). Try the common candidates;
# the first populated one wins. Best-effort per the indexer plan — a miss here
# just means recordTypeSp stays None and taxonomy falls back to library URL.
_RECORD_TYPE_FIELD_CANDIDATES = ("RecordType", "Record_x0020_Type", "DocumentType", "Document_x0020_Type")


def _iter_children(drive_id: str, token: str, item_id: str | None, *, expand_fields: bool) -> list[dict]:
    """List all children (paged) of a drive item, or the drive root when item_id is None."""
    base = f"{GRAPH_ROOT}/drives/{drive_id}"
    endpoint = f"{base}/root/children" if item_id is None else f"{base}/items/{item_id}/children"
    if expand_fields:
        endpoint += "?$expand=listItem($expand=fields)"
    results: list[dict] = []
    while endpoint:
        resp = requests.get(endpoint, headers={"Authorization": f"Bearer {token}"}, timeout=120)
        if resp.status_code >= 400:
            raise RuntimeError(f"Cannot list children ({resp.status_code}): {resp.text[:300]}")
        body = resp.json()
        results.extend(body.get("value", []))
        endpoint = body.get("@odata.nextLink")
    return results


def _extract_list_fields(item: dict) -> dict:
    fields = ((item.get("listItem") or {}).get("fields")) or {}
    record_type_sp = None
    for candidate in _RECORD_TYPE_FIELD_CANDIDATES:
        value = fields.get(candidate)
        if isinstance(value, str) and value.strip():
            record_type_sp = value.strip()
            break
    return {"contentTypeId": fields.get("ContentTypeId"), "recordTypeSp": record_type_sp}


def list_pdfs(
    library_url: str,
    token: str,
    *,
    recursive: bool = True,
    content_type_id: str | None = None,
    include_metadata: bool = True,
) -> list[dict]:
    """Return PDF descriptors for a library, recursing into subfolders by default.

    Each result: {fileName, absoluteUrl, serverRelativeUrl, lastModifiedDateTime,
    recordTypeSp, contentTypeId}.

    Content-type filtering is best-effort: Graph has no server-side content-type
    filter on drive listings, so this expands `listItem.fields` per item and
    matches `ContentTypeId` (prefix match, since sub-content-types extend the
    parent ID) client-side. Items where the field can't be resolved are KEPT
    rather than dropped, so a metadata gap never silently hides a file.
    """
    hostname, site_path, drive_name = _library_parts(library_url)
    drive_id = _drive_id(hostname, site_path, drive_name, token)

    results: list[dict] = []
    pending: list[str | None] = [None]  # None = drive root
    seen_folder_ids: set[str] = set()
    while pending:
        folder_id = pending.pop()
        for item in _iter_children(drive_id, token, folder_id, expand_fields=include_metadata):
            if "folder" in item:
                child_id = item.get("id")
                if recursive and child_id and child_id not in seen_folder_ids:
                    seen_folder_ids.add(child_id)
                    pending.append(child_id)
                continue

            name = item.get("name", "")
            if not name.lower().endswith(".pdf"):
                continue

            meta = _extract_list_fields(item) if include_metadata else {"contentTypeId": None, "recordTypeSp": None}
            item_ct = meta["contentTypeId"]
            if content_type_id and item_ct and not str(item_ct).startswith(content_type_id):
                continue

            web_url = item.get("webUrl", "")
            rel = urlparse(web_url).path if web_url else ""
            results.append({
                "fileName": name,
                "absoluteUrl": web_url,
                "serverRelativeUrl": rel,
                "lastModifiedDateTime": item.get("lastModifiedDateTime"),
                "recordTypeSp": meta["recordTypeSp"],
                "contentTypeId": item_ct,
            })
    return results
