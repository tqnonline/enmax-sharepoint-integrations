"""Import a packed solution zip into the target Dataverse environment.

Usage:
    python solution/scripts/import.py [--solution prod|admin]

    prod (default): solution/build/EnmaxAutoCADNumbering_unmanaged.zip
    admin:          solution/build/EnmaxAutoCADAdmin_unmanaged.zip

Reads DATAVERSE_URL, DATAVERSE_CLIENT_ID, DATAVERSE_CLIENT_SECRET, DATAVERSE_TENANT_ID
from the environment (or .env.local at repo root). Uses PAC CLI; assumes `pac auth` has
been run or that the CI workflow has set up authentication via service principal.
"""

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
BUILD = REPO_ROOT / "solution" / "build"

ZIP_BY_SOLUTION = {
    "prod": BUILD / "EnmaxAutoCADNumbering_unmanaged.zip",
    "admin": BUILD / "EnmaxAutoCADAdmin_unmanaged.zip",
}


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

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--solution", choices=("prod", "admin"), default="prod")
    args = parser.parse_args()

    zip_path = ZIP_BY_SOLUTION[args.solution]
    if not zip_path.exists():
        print(f"ERROR: {zip_path} not found. Run pack.py --solution {args.solution} first.", file=sys.stderr)
        return 2

    # --async polls the import job instead of holding a synchronous WCF channel
    # open; upgrade imports can exceed PAC's 30-minute sync timeout otherwise.
    cmd = [
        _pac(), "solution", "import",
        "--path", str(zip_path),
        "--publish-changes",
        "--activate-plugins",
        "--async",
        "--max-async-wait-time", "60",
    ]
    result = subprocess.run(cmd, check=False)
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
