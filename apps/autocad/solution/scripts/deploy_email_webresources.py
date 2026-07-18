"""Upsert HTML email templates used by Child_Send_Approval_* flows.

Flows look up webresourceset by name:
  - enmax_approval_needed
  - enmax_approval_approved
  - enmax_approval_declined
  - enmax_logo_white         (PNG, sent inline as cid:enmax_logo_white.png)

Source HTML lives under solution/src/WebResources/email_templates/ and the
inline logo under solution/src/WebResources/images/.

Usage:
    export DATAVERSE_URL=https://nrg-enmax-dev.crm3.dynamics.com
    python solution/scripts/deploy_email_webresources.py --auth azcli
"""

from __future__ import annotations

import argparse
import base64
import sys
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "solution" / "scripts"))

from seed import _load_env_local, _require_env, acquire_token  # noqa: E402

TEMPLATES = (
    ("enmax_approval_needed", "approval_needed.html", "Approval Needed Email Template"),
    ("enmax_approval_approved", "approval_approved.html", "Approval Approved Email Template"),
    ("enmax_approval_declined", "approval_declined.html", "Approval Declined Email Template"),
)

# Inline logo referenced by the email HTML as cid:enmax_logo_white.png. Email
# flows fetch this web resource and send it as an inline attachment so Outlook
# renders the ENMAX wordmark in the header (SVG/data-URI don't render there).
IMAGES = (
    ("enmax_logo_white", "enmax_logo_white.png", "ENMAX White Logo (email header)"),
)

SRC_DIR = REPO_ROOT / "solution" / "src" / "WebResources" / "email_templates"
IMAGES_DIR = REPO_ROOT / "solution" / "src" / "WebResources" / "images"
# Web resource types: 1 = HTML (webpage), 5 = PNG image.
WEB_RESOURCE_TYPE_HTML = 1
WEB_RESOURCE_TYPE_PNG = 5


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Content-Type": "application/json",
    }


def _upsert(session, base, token, logical_name, path, display, wrtype, description, dry_run) -> bool:
    """Upsert one web resource. Returns True on success."""
    if not path.is_file():
        print(f"ERROR missing source {path}", file=sys.stderr)
        return False
    content_b64 = base64.b64encode(path.read_bytes()).decode("ascii")
    list_url = (
        f"{base}/api/data/v9.2/webresourceset"
        f"?$select=webresourceid,name&$filter=name eq '{logical_name}'&$top=1"
    )
    resp = session.get(list_url, headers=_headers(token), timeout=60)
    if resp.status_code != 200:
        print(f"ERROR list {logical_name}: {resp.status_code} {resp.text[:300]}", file=sys.stderr)
        return False
    rows = resp.json().get("value", [])
    if dry_run:
        print(f"DRY-RUN {'PATCH' if rows else 'POST'} {logical_name} from {path.name}")
        return True
    if rows:
        wid = rows[0]["webresourceid"]
        patch = session.patch(
            f"{base}/api/data/v9.2/webresourceset({wid})",
            headers=_headers(token),
            json={"content": content_b64, "displayname": display},
            timeout=120,
        )
        if patch.status_code not in (204, 200):
            print(f"ERROR PATCH {logical_name}: {patch.status_code} {patch.text[:300]}", file=sys.stderr)
            return False
        print(f"Updated {logical_name} ({wid})")
    else:
        create = session.post(
            f"{base}/api/data/v9.2/webresourceset",
            headers=_headers(token),
            json={
                "name": logical_name,
                "displayname": display,
                "webresourcetype": wrtype,
                "content": content_b64,
                "description": description,
            },
            timeout=120,
        )
        if create.status_code not in (201, 204):
            print(f"ERROR POST {logical_name}: {create.status_code} {create.text[:300]}", file=sys.stderr)
            return False
        print(f"Created {logical_name}")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--auth", choices=("spn", "device", "azcli", "interactive"), default="azcli")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    _load_env_local()
    base = _require_env("DATAVERSE_URL").rstrip("/")
    token = acquire_token(base, args.auth)
    session = requests.Session()

    for logical_name, filename, display in TEMPLATES:
        if not _upsert(
            session, base, token, logical_name, SRC_DIR / filename, display,
            WEB_RESOURCE_TYPE_HTML, "Email HTML template for Power Automate notification flows",
            args.dry_run,
        ):
            return 1

    for logical_name, filename, display in IMAGES:
        if not _upsert(
            session, base, token, logical_name, IMAGES_DIR / filename, display,
            WEB_RESOURCE_TYPE_PNG, "Inline logo attached to Power Automate notification emails (cid)",
            args.dry_run,
        ):
            return 1

    if not args.dry_run:
        pub = session.post(
            f"{base}/api/data/v9.2/PublishAllXml",
            headers=_headers(token),
            json={},
            timeout=300,
        )
        # PublishAllXml may return 204
        print(f"PublishAllXml status={pub.status_code}")

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
