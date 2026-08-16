#!/usr/bin/env python3
"""Print a Dataverse bearer token using user-delegated auth (no service principal).

Usage:
    export DATAVERSE_URL=https://org.crm.dynamics.com/
    python solution/scripts/get_dataverse_token.py --auth azcli
    python solution/scripts/get_dataverse_token.py --auth device
    python solution/scripts/get_dataverse_token.py --auth interactive

    # Or skip Python entirely after az login:
    export DATAVERSE_ACCESS_TOKEN=$(az account get-access-token \\
        --resource "$DATAVERSE_URL" --query accessToken -o tsv)
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "solution" / "scripts"))

from seed import _load_env_local, _require_env, acquire_token  # noqa: E402


def main() -> int:
    _load_env_local()
    parser = argparse.ArgumentParser(description="Acquire a user-delegated Dataverse token")
    parser.add_argument(
        "--auth",
        choices=["device", "interactive", "azcli"],
        default="azcli" if __import__("shutil").which("az") else ("interactive" if sys.platform == "darwin" else "device"),
        help="User auth mode (default: azcli when az is on PATH, else interactive on macOS)",
    )
    parser.add_argument(
        "--url",
        default="",
        help="Dataverse URL (default: DATAVERSE_URL env var)",
    )
    args = parser.parse_args()

    url = (args.url or os.environ.get("DATAVERSE_URL", "")).strip()
    if not url:
        url = _require_env("DATAVERSE_URL")
    print(acquire_token(url.rstrip("/"), args.auth))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
