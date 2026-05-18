"""Import solution/build/EnmaxAutoCADNumbering_unmanaged.zip into the target Dataverse environment.

Reads DATAVERSE_URL, DATAVERSE_CLIENT_ID, DATAVERSE_CLIENT_SECRET, DATAVERSE_TENANT_ID
from the environment (or .env.local at repo root). Uses PAC CLI; assumes `pac auth` has
been run or that the CI workflow has set up authentication via service principal.
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
ZIP = REPO_ROOT / "solution" / "build" / "EnmaxAutoCADNumbering_unmanaged.zip"


def _pac() -> str:
    found = shutil.which("pac")
    if found:
        return found
    candidate = Path.home() / ".dotnet" / "tools" / "pac.exe"
    if candidate.exists():
        return str(candidate)
    print("ERROR: pac CLI not found.", file=sys.stderr)
    sys.exit(1)


def _load_env_local() -> None:
    env_local = REPO_ROOT / ".env.local"
    if not env_local.exists():
        return
    for line in env_local.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def main() -> int:
    _load_env_local()

    if not ZIP.exists():
        print(f"ERROR: {ZIP} not found. Run pack.py first.", file=sys.stderr)
        return 2

    cmd = [
        _pac(), "solution", "import",
        "--path", str(ZIP),
        "--publish-changes",
        "--activate-plugins",
    ]
    result = subprocess.run(cmd, check=False)
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
