"""Pack a solution source tree into a solution zip via PAC CLI.

Usage:
    python solution/scripts/pack.py [--solution prod|admin]

    prod (default): solution/src/          -> solution/build/EnmaxAutoCADNumbering_unmanaged.zip
    admin:          solution/admin/src/    -> solution/build/EnmaxAutoCADAdmin_unmanaged.zip
"""

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
BUILD = REPO_ROOT / "solution" / "build"

SOLUTIONS = {
    "prod": {
        "src": REPO_ROOT / "solution" / "src",
        "zip": BUILD / "EnmaxAutoCADNumbering_unmanaged.zip",
    },
    "admin": {
        "src": REPO_ROOT / "solution" / "admin" / "src",
        "zip": BUILD / "EnmaxAutoCADAdmin_unmanaged.zip",
    },
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


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--solution", choices=("prod", "admin"), default="prod")
    args = parser.parse_args()

    target = SOLUTIONS[args.solution]
    src, zip_path = target["src"], target["zip"]

    BUILD.mkdir(exist_ok=True)
    cmd = [
        _pac(), "solution", "pack",
        "--folder", str(src),
        "--zipfile", str(zip_path),
        "--packagetype", "Unmanaged",
    ]
    result = subprocess.run(cmd, check=False)
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
