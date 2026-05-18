"""Pack solution/src/ into solution/build/EnmaxAutoCADNumbering_unmanaged.zip via PAC CLI."""

import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SRC = REPO_ROOT / "solution" / "src"
BUILD = REPO_ROOT / "solution" / "build"
ZIP = BUILD / "EnmaxAutoCADNumbering_unmanaged.zip"


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
    BUILD.mkdir(exist_ok=True)
    cmd = [
        _pac(), "solution", "pack",
        "--folder", str(SRC),
        "--zipfile", str(ZIP),
        "--packagetype", "Unmanaged",
    ]
    result = subprocess.run(cmd, check=False)
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
