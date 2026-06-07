"""Dataverse Web API client for powerplatform_deploy.

Mirrors the DataverseClient pattern from solution/scripts/provision_roles.py
with the addition of a classmethod factory that acquires a client-credentials
token via MSAL.

Fail-loud principle (project Rule 12): non-2xx responses raise RuntimeError
with the full Dataverse error body so callers are never silently swallowed.
"""

from __future__ import annotations

from typing import Any

import msal
import requests


class DataverseClient:
    """Minimal authenticated client for the Dataverse Web API v9.2."""

    def __init__(self, base_url: str, token: str) -> None:
        """Initialise the client with a pre-acquired bearer token.

        Args:
            base_url: The Dataverse environment URL, e.g.
                      ``https://myorg.crm3.dynamics.com``.  A trailing slash is
                      stripped automatically.
            token: A valid OAuth 2.0 bearer token for the Dataverse resource.
        """
        self._base = base_url.rstrip("/") + "/api/data/v9.2"
        self._session = requests.Session()
        self._session.headers.update({
            "Authorization": f"Bearer {token}",
            "OData-MaxVersion": "4.0",
            "OData-Version": "4.0",
            "Accept": "application/json",
            "Content-Type": "application/json",
        })

    # ------------------------------------------------------------------
    # Internal HTTP helpers
    # ------------------------------------------------------------------

    def _get(self, path: str, params: dict[str, str] | None = None) -> Any:
        """Issue a GET request and return the parsed JSON body.

        Args:
            path: Path relative to the OData endpoint (e.g. ``"roles"``).
            params: Optional OData query parameters (``$filter``, ``$select``, …).

        Returns:
            Parsed JSON (usually a dict with a ``"value"`` list).

        Raises:
            requests.HTTPError: on non-2xx responses (via raise_for_status).
        """
        resp = self._session.get(f"{self._base}/{path}", params=params)
        resp.raise_for_status()
        return resp.json()

    def _post(self, path: str, body: dict) -> requests.Response:
        """Issue a POST request and return the Response on success.

        Non-2xx responses raise RuntimeError with the full Dataverse error
        body.  We do NOT use raise_for_status because that discards the
        response text, hiding the actual Dataverse error message.

        Args:
            path: Path relative to the OData endpoint.
            body: Request payload; serialised as JSON.

        Returns:
            The raw ``requests.Response`` on success (2xx).

        Raises:
            RuntimeError: on non-2xx, with the status code and response body.
        """
        resp = self._session.post(f"{self._base}/{path}", json=body)
        if not resp.ok:
            raise RuntimeError(f"POST {path} -> {resp.status_code}: {resp.text}")
        return resp

    def _patch(self, path: str, body: dict) -> requests.Response:
        """Issue a PATCH request and return the Response on success.

        Non-2xx responses raise RuntimeError with the full Dataverse error
        body.  We do NOT use raise_for_status because that discards the
        response text, hiding the actual Dataverse error message.

        Args:
            path: Path relative to the OData endpoint.
            body: Request payload; serialised as JSON.

        Returns:
            The raw ``requests.Response`` on success (2xx).

        Raises:
            RuntimeError: on non-2xx, with the status code and response body.
        """
        resp = self._session.patch(f"{self._base}/{path}", json=body)
        if not resp.ok:
            raise RuntimeError(f"PATCH {path} -> {resp.status_code}: {resp.text}")
        return resp

    # ------------------------------------------------------------------
    # Factory
    # ------------------------------------------------------------------

    @classmethod
    def from_env(cls, cfg: dict) -> "DataverseClient":
        """Acquire a client-credentials token and return a ready DataverseClient.

        Uses MSAL ConfidentialClientApplication (client_credentials flow),
        matching the pattern in provision_roles.py and seed.py.

        Args:
            cfg: Dict containing at minimum:
                 - ``DATAVERSE_URL``
                 - ``DATAVERSE_CLIENT_ID``
                 - ``DATAVERSE_CLIENT_SECRET``
                 - ``DATAVERSE_TENANT_ID``

        Returns:
            An authenticated DataverseClient.

        Raises:
            RuntimeError: if MSAL token acquisition fails.
            KeyError: if a required key is absent from *cfg*.
        """
        url = cfg["DATAVERSE_URL"].rstrip("/")
        client_id = cfg["DATAVERSE_CLIENT_ID"]
        client_secret = cfg["DATAVERSE_CLIENT_SECRET"]
        tenant_id = cfg["DATAVERSE_TENANT_ID"]

        authority = f"https://login.microsoftonline.com/{tenant_id}"
        app = msal.ConfidentialClientApplication(
            client_id,
            authority=authority,
            client_credential=client_secret,
        )
        result = app.acquire_token_for_client(scopes=[f"{url}/.default"])
        if "access_token" not in result:
            raise RuntimeError(
                f"MSAL token acquisition failed: "
                f"{result.get('error_description', result)}"
            )
        return cls(url, result["access_token"])
