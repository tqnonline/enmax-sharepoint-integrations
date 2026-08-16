"""Configuration loading for powerplatform_deploy.

Two entry points:
  - load_env(environment)  — reads apps/code-app/.env.<environment>, falls back to
                              the main repo checkout when running inside a git worktree.
  - load_profile(repo_root) — reads deploy.profile.yaml from the repo root.

Design notes
------------
* Values already in os.environ WIN over the file (CI can override via env vars).
* The .env file uses the short key names from the existing CI scripts
  (ENVIRONMENT_URL, CLIENT_ID, etc.).  We expose the canonical DATAVERSE_* names
  that provision_roles.py and seed.py expect.
* We use `git rev-parse --git-common-dir` to locate the main repo when we are
  inside a worktree — identical to the PowerShell pattern in push-to-dev.ps1.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Any

import yaml

# Maps the short .env key names used in the Code App .env files to the canonical
# DATAVERSE_* names that the existing Python scripts expect.
_ENV_ALIASES: dict[str, str] = {
    "ENVIRONMENT_URL":   "DATAVERSE_URL",
    "CLIENT_ID":         "DATAVERSE_CLIENT_ID",
    "CLIENT_SECRET":     "DATAVERSE_CLIENT_SECRET",
    "TENANT_ID":         "DATAVERSE_TENANT_ID",
}

_REQUIRED_KEYS = ("DATAVERSE_URL", "DATAVERSE_CLIENT_ID", "DATAVERSE_CLIENT_SECRET", "DATAVERSE_TENANT_ID")


def _parse_env_file(path: Path) -> dict[str, str]:
    """Parse a KEY=VALUE .env file.

    Rules (matching the existing seed.py / push-to-dev.ps1 behaviour):
    - Blank lines and lines starting with '#' are skipped.
    - Values are stripped of surrounding single or double quotes.
    - Lines without '=' are skipped.
    """
    result: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        result[k.strip()] = v.strip().strip('"').strip("'")
    return result


def _find_main_repo_root(start: Path) -> Path | None:
    """Locate the main repo root when *start* is inside a git worktree.

    Uses `git rev-parse --git-common-dir` (the same trick as push-to-dev.ps1) to
    find the .git directory of the primary checkout, then returns its parent.
    Returns None on any failure (not a repo, git not on PATH, etc.).
    """
    try:
        result = subprocess.run(
            ["git", "-C", str(start), "rev-parse", "--git-common-dir"],
            capture_output=True,
            text=True,
            check=True,
        )
        git_common_dir = result.stdout.strip()
        if not git_common_dir:
            return None
        resolved = Path(git_common_dir)
        if not resolved.is_absolute():
            resolved = (start / resolved).resolve()
        return resolved.parent
    except Exception:
        return None


def load_env(environment: str, _repo_root: Path | None = None) -> dict[str, str]:
    """Load credentials from apps/code-app/.env.<environment>.

    Env-only fast path (CI / GitHub Actions):
      If ALL FOUR canonical DATAVERSE_* keys are present and non-empty in
      os.environ, return them immediately without requiring a .env file.
      Short aliases (ENVIRONMENT_URL, CLIENT_ID, CLIENT_SECRET, TENANT_ID) are
      also accepted; canonical names win when both are set.

    File-based path (local developer machines):
      Lookup order for the .env file:
      1. <this_worktree>/apps/code-app/.env.<environment>
      2. <main_repo_root>/apps/code-app/.env.<environment>  (worktree fallback)
      For each key, os.environ wins over the file value.

    Returns a dict containing at minimum the four DATAVERSE_* keys.

    Args:
        environment: e.g. "dev", "uat", "prod"
        _repo_root: Override for the worktree root (used in tests).

    Raises:
        FileNotFoundError: if the .env file cannot be found in either location
                           (only raised when the env-only fast path is NOT taken).
        KeyError: if a required DATAVERSE_* key is absent after env-var overlay.
    """
    if _repo_root is None:
        _repo_root = Path(__file__).resolve().parent.parent.parent.parent

    # ── Env-only fast path ────────────────────────────────────────────────────
    # Collect all four canonical keys from os.environ (canonical wins over alias).
    env_only: dict[str, str] = {}
    for canonical_key in _REQUIRED_KEYS:
        # Try canonical name first.
        val = os.environ.get(canonical_key, "").strip()
        if not val:
            # Try the short alias (e.g. ENVIRONMENT_URL for DATAVERSE_URL).
            for short_key, aliased in _ENV_ALIASES.items():
                if aliased == canonical_key:
                    val = os.environ.get(short_key, "").strip()
                    break
        if val:
            env_only[canonical_key] = val

    if len(env_only) == len(_REQUIRED_KEYS):
        # All four keys are satisfied from environment alone — no file needed.
        return env_only

    # ── File-based path ───────────────────────────────────────────────────────
    env_rel = Path("apps") / "code-app" / f".env.{environment}"
    candidate = _repo_root / env_rel

    if not candidate.exists():
        main_root = _find_main_repo_root(_repo_root)
        if main_root is not None:
            fallback = main_root / env_rel
            if fallback.exists():
                candidate = fallback

    if not candidate.exists():
        raise FileNotFoundError(
            f".env.{environment} not found at {_repo_root / env_rel} "
            f"(and no fallback found via git --git-common-dir)"
        )

    file_values = _parse_env_file(candidate)

    # Build the output dict: apply aliases, let os.environ win.
    merged: dict[str, str] = {}
    for file_key, file_val in file_values.items():
        # Resolve alias (e.g. ENVIRONMENT_URL -> DATAVERSE_URL) or keep as-is.
        canonical_key = _ENV_ALIASES.get(file_key, file_key)
        merged[canonical_key] = file_val

    # os.environ overrides file values for the canonical keys.
    for canonical_key in _REQUIRED_KEYS:
        env_val = os.environ.get(canonical_key, "").strip()
        if env_val:
            merged[canonical_key] = env_val
        # Also check the short alias name in os.environ.
        for short_key, aliased in _ENV_ALIASES.items():
            if aliased == canonical_key:
                env_short = os.environ.get(short_key, "").strip()
                if env_short and canonical_key not in merged:
                    merged[canonical_key] = env_short

    missing = [k for k in _REQUIRED_KEYS if not merged.get(k)]
    if missing:
        raise KeyError(f"Missing required env keys after loading .env.{environment}: {missing}")

    return merged


def load_profile(repo_root: Path | None = None) -> dict[str, Any]:
    """Load deploy.profile.yaml from the repo root.

    Args:
        repo_root: Path to the repo root. Defaults to four levels above this file
                   (solution/scripts/powerplatform_deploy/ -> repo root).

    Returns:
        Parsed YAML as a plain dict.

    Raises:
        FileNotFoundError: if deploy.profile.yaml does not exist at repo_root.
    """
    if repo_root is None:
        repo_root = Path(__file__).resolve().parent.parent.parent.parent

    profile_path = repo_root / "deploy.profile.yaml"
    if not profile_path.exists():
        raise FileNotFoundError(f"deploy.profile.yaml not found at {profile_path}")

    with profile_path.open(encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}
