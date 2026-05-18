"""Export the unmanaged solution from dev tenant and unpack to solution/src/.

Run after every maker-UI schema change. Produces the XML diff that goes into the PR.

Usage:
    python solution/scripts/export.py
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
BUILD = REPO_ROOT / "solution" / "build"
SRC = REPO_ROOT / "solution" / "src"
ZIP = BUILD / "EnmaxAutoCADNumbering_unmanaged.zip"
SOLUTION_NAME = "enmax_autocadsln"


def _pac() -> str:
    """Return path to pac CLI; prefers PATH, falls back to dotnet global tools."""
    found = shutil.which("pac")
    if found:
        return found
    candidate = Path.home() / ".dotnet" / "tools" / "pac.exe"
    if candidate.exists():
        return str(candidate)
    print("ERROR: pac CLI not found. Install: dotnet tool install --global Microsoft.PowerApps.CLI.Tool", file=sys.stderr)
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
    BUILD.mkdir(exist_ok=True)

    # Step 1: export unmanaged solution zip from the connected environment
    export_cmd = [
        _pac(), "solution", "export",
        "--path", str(ZIP),
        "--name", SOLUTION_NAME,
        "--managed", "false",
        "--overwrite",
    ]
    r = subprocess.run(export_cmd, check=False)
    if r.returncode != 0:
        print("ERROR: pac solution export failed.", file=sys.stderr)
        return r.returncode

    # Step 2: unpack into solution/src/
    unpack_cmd = [
        _pac(), "solution", "unpack",
        "--zipfile", str(ZIP),
        "--folder", str(SRC),
        "--packagetype", "Unmanaged",
        "--allowDelete", "true",
    ]
    r = subprocess.run(unpack_cmd, check=False)
    if r.returncode != 0:
        print("ERROR: pac solution unpack failed.", file=sys.stderr)
        return r.returncode

    print(f"Solution unpacked to {SRC}. Review `git diff solution/src/` before committing.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
