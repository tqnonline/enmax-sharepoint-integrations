"""Shared Dataverse CLI helpers for ENMAX operator scripts.

Host gates, bearer token refresh, OData headers, and optional JSON ops logs.
"""

from __future__ import annotations

import json
import os
import subprocess
import threading
import time
from typing import Any

DEV_HOST = "nrg-enmax-dev.crm3.dynamics.com"
# Live PAC profile ENMAX-EEC-PROD → nrg-enmaxenergy-prod; keep legacy alias if present.
PROD_HOST = "nrg-enmaxenergy-prod.crm3.dynamics.com"
PROD_HOSTS = frozenset({PROD_HOST, "nrg-enmax.crm3.dynamics.com"})


class GateError(Exception):
    """Host / confirmation gate failure; map to exit code 1 in main()."""

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


def host_from_url(url: str) -> str:
    return url.rstrip("/").split("//", 1)[-1].split("/", 1)[0].lower()


def odata_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Content-Type": "application/json",
    }


def resolve_dataverse_url(*, env_var: str = "DATAVERSE_URL") -> str:
    """Resolve org URL from env, else `pac org who`."""
    base = (os.environ.get(env_var) or "").rstrip("/") or None
    if base:
        return base
    who = subprocess.run(
        ["pac", "org", "who"],
        capture_output=True,
        text=True,
        check=False,
    )
    for line in (who.stdout or "").splitlines():
        for part in line.split():
            if part.startswith("https://") and "dynamics.com" in part:
                return part.rstrip("/")
    raise RuntimeError(
        f"Set {env_var} or select pac org (pac org who)"
    )


def require_dev_confirm(url: str, *, confirm_dev: bool, action: str) -> str:
    """Return host when URL is DEV and --confirm-dev was passed; else GateError."""
    host = host_from_url(url)
    if host != DEV_HOST:
        raise GateError(
            f"ERROR: {action} currently gated to {DEV_HOST}; got {host}"
        )
    if not confirm_dev:
        raise GateError(
            f"ERROR: pass --confirm-dev to {action} on ENMAX DEV"
        )
    return host


def require_apply_confirm(
    url: str,
    *,
    confirm_dev: bool,
    confirm_prod: bool,
    action: str,
) -> str:
    """Allow Dev (--confirm-dev) or known Prod (--confirm-prod); refuse all others."""
    host = host_from_url(url)
    if host == DEV_HOST:
        return require_dev_confirm(url, confirm_dev=confirm_dev, action=action)
    if host in PROD_HOSTS:
        if not confirm_prod:
            raise GateError(
                f"ERROR: pass --confirm-prod to {action} on ENMAX PROD ({host})"
            )
        return host
    raise GateError(
        f"ERROR: {action} gated to {DEV_HOST} or {PROD_HOST}; got {host}"
    )


def log_event(event: str, **fields: Any) -> None:
    """Emit one JSON line when ENMAX_OPS_LOG=json; otherwise no-op."""
    if os.environ.get("ENMAX_OPS_LOG") != "json":
        return
    print(json.dumps({"event": event, **fields}, default=str), flush=True)


class TokenHolder:
    """Mutable bearer token; optionally refreshes from Azure CLI periodically.

    Thread-safe. ``get`` is an alias for ``maybe_refresh`` (purge uses get).
    Raises RuntimeError on refresh failure (never soft-warns).
    """

    def __init__(
        self,
        token: str,
        *,
        refresh_via_az: bool = False,
        base_url: str = "",
    ) -> None:
        self.token = token
        self.refresh_via_az = refresh_via_az
        self.base_url = base_url.rstrip("/")
        self._last_refresh = time.time()
        self._lock = threading.Lock()

    def maybe_refresh(self, force: bool = False) -> str:
        if not self.refresh_via_az:
            return self.token
        with self._lock:
            if not force and (time.time() - self._last_refresh) < 30 * 60:
                return self.token
            try:
                out = subprocess.check_output(
                    [
                        "az",
                        "account",
                        "get-access-token",
                        "--resource",
                        self.base_url,
                        "--query",
                        "accessToken",
                        "-o",
                        "tsv",
                    ],
                    text=True,
                    timeout=60,
                ).strip()
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError) as exc:
                raise RuntimeError(f"DATAVERSE token refresh failed: {exc}") from exc
            if not out:
                raise RuntimeError("DATAVERSE token refresh returned empty token")
            self.token = out
            self._last_refresh = time.time()
            print("  token refreshed via az cli", flush=True)
            return self.token

    def get(self, force: bool = False) -> str:
        return self.maybe_refresh(force=force)
