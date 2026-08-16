"""Tests for powerplatform_deploy.client.DataverseClient.

Why these tests matter:
- _post must raise RuntimeError with the Dataverse response body on non-2xx.
  Using raise_for_status() would swallow the body; we explicitly surface it
  so operators can diagnose Dataverse errors without digging through logs.
- A 2xx _post must return parsed JSON so callers can read OData-EntityId etc.
- No network calls are made; the session is replaced with a mock.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
import requests

from powerplatform_deploy.client import DataverseClient


def _make_client(base_url: str = "https://org.crm3.dynamics.com") -> DataverseClient:
    """Return a DataverseClient with a mock session (no real network)."""
    client = DataverseClient(base_url, token="fake-token")
    return client


def _mock_response(status_code: int, json_body: dict | None = None, text: str = "") -> MagicMock:
    """Build a mock requests.Response."""
    resp = MagicMock(spec=requests.Response)
    resp.status_code = status_code
    resp.ok = 200 <= status_code < 300
    resp.text = text or (str(json_body) if json_body else "")
    if json_body is not None:
        resp.json.return_value = json_body
    return resp


class TestPostFailLoud:
    """_post raises RuntimeError with the response body on non-2xx."""

    def test_post_4xx_raises_with_body(self):
        """A 400 response raises RuntimeError containing the Dataverse error text.

        This is the fail-loud rule: the full error body must be surfaced so
        operators know WHY Dataverse rejected the request.
        """
        client = _make_client()
        error_body = '{"error":{"code":"0x80040265","message":"Validation failed"}}'
        mock_resp = _mock_response(400, text=error_body)

        with patch.object(client._session, "post", return_value=mock_resp):
            with pytest.raises(RuntimeError) as exc_info:
                client._post("roles", {"name": "bad"})

        error_msg = str(exc_info.value)
        assert "400" in error_msg, "Status code must appear in the error message"
        assert "Validation failed" in error_msg, "Response body must appear in the error message"

    def test_post_5xx_raises_with_body(self):
        """A 500 response raises RuntimeError containing the status and body."""
        client = _make_client()
        error_body = "Internal Server Error"
        mock_resp = _mock_response(500, text=error_body)

        with patch.object(client._session, "post", return_value=mock_resp):
            with pytest.raises(RuntimeError) as exc_info:
                client._post("some/path", {})

        assert "500" in str(exc_info.value)
        assert "Internal Server Error" in str(exc_info.value)

    def test_post_error_message_includes_path(self):
        """The RuntimeError message includes the path so the log is self-describing."""
        client = _make_client()
        mock_resp = _mock_response(403, text="Forbidden")

        with patch.object(client._session, "post", return_value=mock_resp):
            with pytest.raises(RuntimeError) as exc_info:
                client._post("roles(abc)/Microsoft.Dynamics.CRM.ReplacePrivilegesRole", {})

        assert "roles(abc)/Microsoft.Dynamics.CRM.ReplacePrivilegesRole" in str(exc_info.value)


class TestPostSuccess:
    """_post returns the Response object on 2xx."""

    def test_post_201_returns_response(self):
        """A 201 Created response is returned without raising."""
        client = _make_client()
        mock_resp = _mock_response(201, json_body={"roleid": "abc-123"})
        mock_resp.headers = {"OData-EntityId": "/api/data/v9.2/roles(abc-123)"}

        with patch.object(client._session, "post", return_value=mock_resp):
            result = client._post("roles", {"name": "Test Role"})

        assert result is mock_resp

    def test_post_204_returns_response(self):
        """A 204 No Content response is returned without raising (Dataverse upserts use 204)."""
        client = _make_client()
        mock_resp = _mock_response(204, text="")

        with patch.object(client._session, "post", return_value=mock_resp):
            result = client._post("roles(abc)/action", {})

        assert result is mock_resp


class TestGet:
    """_get returns parsed JSON on 2xx and raises on non-2xx via raise_for_status."""

    def test_get_returns_json(self):
        """A 200 GET response returns the parsed JSON body."""
        client = _make_client()
        body = {"value": [{"roleid": "abc", "name": "Admin"}]}
        mock_resp = _mock_response(200, json_body=body)
        mock_resp.raise_for_status = MagicMock()  # no-op

        with patch.object(client._session, "get", return_value=mock_resp):
            result = client._get("roles", {"$filter": "name eq 'Admin'"})

        assert result == body

    def test_get_calls_raise_for_status(self):
        """_get delegates error handling to raise_for_status (standard requests pattern)."""
        client = _make_client()
        mock_resp = _mock_response(404, text="Not Found")
        mock_resp.raise_for_status = MagicMock(side_effect=requests.HTTPError("404"))

        with patch.object(client._session, "get", return_value=mock_resp):
            with pytest.raises(requests.HTTPError):
                client._get("roles")


class TestHeaders:
    """DataverseClient sets the required OData headers."""

    def test_bearer_token_in_session_headers(self):
        """The Authorization header is set with the supplied token."""
        client = _make_client()
        assert client._session.headers["Authorization"] == "Bearer fake-token"

    def test_odata_headers_present(self):
        """OData-Version and OData-MaxVersion headers are set."""
        client = _make_client()
        assert client._session.headers["OData-Version"] == "4.0"
        assert client._session.headers["OData-MaxVersion"] == "4.0"

    def test_base_url_has_api_path(self):
        """The internal base URL includes the /api/data/v9.2 suffix."""
        client = _make_client("https://org.crm3.dynamics.com")
        assert client._base == "https://org.crm3.dynamics.com/api/data/v9.2"

    def test_trailing_slash_stripped(self):
        """A trailing slash in base_url is removed before appending the API path."""
        client = _make_client("https://org.crm3.dynamics.com/")
        assert client._base == "https://org.crm3.dynamics.com/api/data/v9.2"
