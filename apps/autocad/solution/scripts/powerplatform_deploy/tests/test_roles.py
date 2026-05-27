"""Tests for powerplatform_deploy.commands.roles.

Why these tests matter (#14 production fixes — do not regress):
1. ReplacePrivilegesRole MUST be called as a BOUND action on the role entity.
   The URL MUST be roles({id})/Microsoft.Dynamics.CRM.ReplacePrivilegesRole.
   Reverting to an unbound action (i.e. a different path or RoleId in body)
   will cause Dataverse to return 404 / method-not-found.

2. Privilege Depth MUST be the PrivilegeDepth enum NAME string ("Basic",
   "Local", "Deep", "Global") — never an integer.  Sending an integer causes
   Dataverse to reject the payload silently (the privilege is set to None).

3. Business Unit find-or-create: when the BU is absent, the code MUST look up
   the root BU and POST a create under it, then re-find.  Skipping the create
   leaves roles in the wrong BU and breaks permission scoping.

4. Depth label "none" or anything unrecognised must produce NO privilege row.
   Emitting a row with an invalid depth crashes the ReplacePrivilegesRole call.
"""

from __future__ import annotations

from unittest.mock import MagicMock, call, patch

import pytest
import requests

from powerplatform_deploy.commands.roles import (
    DEPTH_VALUES,
    OP_PREFIXES,
    _find_privilege_id,
    _resolve_privileges,
    ensure_business_unit,
    find_business_unit,
    find_root_business_unit,
    replace_privileges,
)
from powerplatform_deploy.client import DataverseClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_client() -> DataverseClient:
    """Return a DataverseClient whose HTTP session is fully mocked."""
    client = DataverseClient("https://org.crm3.dynamics.com", token="fake-token")
    return client


def _mock_response(status_code: int, json_body: dict | None = None, text: str = "") -> MagicMock:
    resp = MagicMock(spec=requests.Response)
    resp.status_code = status_code
    resp.ok = 200 <= status_code < 300
    resp.text = text or (str(json_body) if json_body else "")
    if json_body is not None:
        resp.json.return_value = json_body
    return resp


# ---------------------------------------------------------------------------
# Test 1: replace_privileges uses the BOUND action URL
# ---------------------------------------------------------------------------

class TestReplacePrivilegesBoundAction:
    """ReplacePrivilegesRole MUST be a bound action on the role entity (not unbound).

    This test would fail if the implementation reverted to posting to an
    unbound path (e.g. 'ReplacePrivilegesRole' at the root, or including
    RoleId as a body param instead of as the entity key).
    """

    def test_posts_to_bound_role_path(self):
        """replace_privileges posts to roles({id})/Microsoft.Dynamics.CRM.ReplacePrivilegesRole."""
        client = _make_client()
        role_id = "aaaa-1111-bbbb-2222"
        privileges = [{"Depth": "Global", "PrivilegeId": "cccc-3333"}]

        mock_resp = _mock_response(204)
        with patch.object(client._session, "post", return_value=mock_resp) as mock_post:
            replace_privileges(client, role_id, privileges)

        assert mock_post.call_count == 1
        actual_url = mock_post.call_args[0][0]
        expected_fragment = f"roles({role_id})/Microsoft.Dynamics.CRM.ReplacePrivilegesRole"
        assert expected_fragment in actual_url, (
            f"ReplacePrivilegesRole must be a BOUND action on the role entity. "
            f"Expected URL to contain '{expected_fragment}', got: {actual_url}"
        )

    def test_body_contains_privileges_key_not_role_id(self):
        """Body is {Privileges: [...]} only — RoleId must NOT be a body param."""
        client = _make_client()
        privileges = [{"Depth": "Basic", "PrivilegeId": "dddd-4444"}]

        mock_resp = _mock_response(204)
        with patch.object(client._session, "post", return_value=mock_resp) as mock_post:
            replace_privileges(client, "role-guid-here", privileges)

        actual_body = mock_post.call_args[1]["json"]
        assert "Privileges" in actual_body, "Body must have 'Privileges' key"
        assert "RoleId" not in actual_body, (
            "RoleId must NOT be in the body — it is the bound entity, not a param"
        )
        assert actual_body["Privileges"] == privileges


# ---------------------------------------------------------------------------
# Test 2: Depth is enum NAME string, never an integer
# ---------------------------------------------------------------------------

class TestDepthIsEnumNameString:
    """Depth in resolved privilege objects must be the enum NAME, not an integer.

    Sending an integer causes Dataverse to silently ignore the depth, resulting
    in privileges with scope None.
    """

    def test_global_label_produces_Global_string(self):
        """YAML depth 'global' resolves to the string 'Global'."""
        # Set up a fake client whose _get returns a privilege id for prvReadFoo.
        client = _make_client()
        priv_id = "priv-read-foo-id"
        mock_resp = _mock_response(200, json_body={"value": [{"privilegeid": priv_id}]})
        mock_resp.raise_for_status = MagicMock()

        # Clear module-level cache to avoid cross-test pollution.
        from powerplatform_deploy.commands import roles as roles_mod
        roles_mod._priv_cache.clear()

        with patch.object(client._session, "get", return_value=mock_resp):
            resolved, missing = _resolve_privileges(client, {"Foo": {"read": "global"}})

        assert not missing, f"Expected no missing privileges, got: {missing}"
        assert len(resolved) == 1
        depth_val = resolved[0]["Depth"]
        assert depth_val == "Global", (
            f"Depth must be the string 'Global', not {depth_val!r}. "
            "Sending an integer causes Dataverse to set the depth to None."
        )
        assert isinstance(depth_val, str), (
            f"Depth must be a str, not {type(depth_val).__name__}"
        )

    def test_basic_label_produces_Basic_string(self):
        """YAML depth 'basic' resolves to the string 'Basic' (not 0 or 'basic')."""
        client = _make_client()
        priv_id = "priv-write-bar-id"
        mock_resp = _mock_response(200, json_body={"value": [{"privilegeid": priv_id}]})
        mock_resp.raise_for_status = MagicMock()

        from powerplatform_deploy.commands import roles as roles_mod
        roles_mod._priv_cache.clear()

        with patch.object(client._session, "get", return_value=mock_resp):
            resolved, missing = _resolve_privileges(client, {"Bar": {"write": "basic"}})

        assert resolved[0]["Depth"] == "Basic"

    def test_all_depth_labels_map_to_correct_strings(self):
        """All four YAML depth labels map to the correct PrivilegeDepth enum names."""
        expected = {
            "basic":  "Basic",
            "local":  "Local",
            "deep":   "Deep",
            "global": "Global",
        }
        for label, expected_name in expected.items():
            assert DEPTH_VALUES[label] == expected_name, (
                f"DEPTH_VALUES['{label}'] must be '{expected_name}', "
                f"got '{DEPTH_VALUES[label]}'"
            )


# ---------------------------------------------------------------------------
# Test 3: BU find-or-create creates under root BU when absent
# ---------------------------------------------------------------------------

class TestBusinessUnitFindOrCreate:
    """When find_business_unit returns None, ensure_business_unit must:
    1. Look up the root BU (parent eq null).
    2. POST a create with the root BU as parent.
    3. Re-find and return the new BU id.

    Skipping the create leaves roles without a valid BU.
    """

    def test_creates_under_root_bu_when_absent(self):
        """ensure_business_unit calls POST with root BU bind when BU not found initially."""
        client = _make_client()
        logger = MagicMock()

        root_bu_id = "root-bu-id-0000"
        new_bu_id = "new-bu-id-1111"
        bu_name = "Enmax Field Services"

        get_calls: list[dict] = []

        def fake_get(path: str, params: dict | None = None) -> dict:
            get_calls.append({"path": path, "params": params})
            # First call: find by name — not found.
            if params and f"name eq '{bu_name}'" in params.get("$filter", ""):
                if len(get_calls) == 1:
                    return {"value": []}
                # Third call: re-find after create — found.
                return {"value": [{"businessunitid": new_bu_id}]}
            # Second call: find root BU.
            if params and "_parentbusinessunitid_value eq null" in params.get("$filter", ""):
                return {"value": [{"businessunitid": root_bu_id}]}
            return {"value": []}

        post_calls: list[dict] = []

        def fake_post(path: str, body: dict) -> MagicMock:
            post_calls.append({"path": path, "body": body})
            resp = MagicMock()
            resp.ok = True
            resp.headers = {}
            return resp

        with (
            patch.object(client, "_get", side_effect=fake_get),
            patch.object(client, "_post", side_effect=fake_post),
        ):
            result = ensure_business_unit(client, bu_name, logger)

        assert result == new_bu_id, f"Expected new_bu_id, got {result}"
        assert len(post_calls) == 1, (
            f"Expected exactly 1 POST (create BU), got {len(post_calls)}"
        )
        create_body = post_calls[0]["body"]
        assert create_body["name"] == bu_name
        assert f"/businessunits({root_bu_id})" in create_body["parentbusinessunitid@odata.bind"], (
            "The new BU must be created under the root BU. "
            f"Expected root_bu_id={root_bu_id} in bind, got: {create_body}"
        )

    def test_returns_existing_bu_without_create(self):
        """ensure_business_unit returns immediately when the BU already exists (no POST)."""
        client = _make_client()
        logger = MagicMock()
        existing_id = "existing-bu-id"

        with (
            patch.object(client, "_get", return_value={"value": [{"businessunitid": existing_id}]}),
            patch.object(client, "_post") as mock_post,
        ):
            result = ensure_business_unit(client, "Some BU", logger)

        assert result == existing_id
        mock_post.assert_not_called()


# ---------------------------------------------------------------------------
# Test 4: "none"/unknown depth labels produce no privilege row
# ---------------------------------------------------------------------------

class TestUnknownDepthSkipped:
    """Depth label 'none' or unrecognised values must produce NO privilege row.

    Emitting a row with depth=None crashes ReplacePrivilegesRole (Dataverse
    rejects the payload).  The correct behaviour is to skip the op entirely.
    """

    def test_none_depth_produces_no_row(self):
        """An op with depth 'none' is skipped — no privilege entry emitted."""
        client = _make_client()

        from powerplatform_deploy.commands import roles as roles_mod
        roles_mod._priv_cache.clear()

        # _find_privilege_id should not even be called for skipped ops.
        with patch.object(client._session, "get") as mock_get:
            resolved, missing = _resolve_privileges(client, {"Foo": {"read": "none"}})

        assert resolved == [], (
            "depth='none' must produce no privilege row. "
            f"Got: {resolved}"
        )
        assert missing == [], (
            "depth='none' must not appear in missing list either."
        )
        # Confirm no network call was made (the op was dropped before lookup).
        mock_get.assert_not_called()

    def test_unrecognised_depth_produces_no_row(self):
        """An op with an unrecognised depth label (e.g. 'all') is skipped."""
        client = _make_client()

        from powerplatform_deploy.commands import roles as roles_mod
        roles_mod._priv_cache.clear()

        with patch.object(client._session, "get") as mock_get:
            resolved, missing = _resolve_privileges(client, {"Bar": {"write": "all"}})

        assert resolved == [], f"Unrecognised depth must produce no row. Got: {resolved}"
        mock_get.assert_not_called()

    def test_mixed_depth_some_none_some_valid(self):
        """A mix of 'none' and 'global' ops: only the 'global' one emits a row."""
        client = _make_client()
        priv_id = "priv-create-baz"
        mock_resp = _mock_response(200, json_body={"value": [{"privilegeid": priv_id}]})
        mock_resp.raise_for_status = MagicMock()

        from powerplatform_deploy.commands import roles as roles_mod
        roles_mod._priv_cache.clear()

        with patch.object(client._session, "get", return_value=mock_resp):
            resolved, missing = _resolve_privileges(
                client,
                {"Baz": {"read": "none", "create": "global"}},
            )

        assert len(resolved) == 1, (
            f"Only the 'global' op should produce a row, got {len(resolved)} rows"
        )
        assert resolved[0]["Depth"] == "Global"
        assert resolved[0]["PrivilegeId"] == priv_id


# ---------------------------------------------------------------------------
# Test 5: missing privileges are warned, not raised
# ---------------------------------------------------------------------------

class TestMissingPrivilegeWarned:
    """Privileges whose names don't exist in Dataverse must be collected and warned.

    Crashing on a missing privilege would halt the entire provisioning run if a
    single table hasn't been imported yet.
    """

    def test_missing_privilege_goes_into_missing_list_not_resolved(self):
        """When _find_privilege_id returns None the priv is in missing, not resolved."""
        client = _make_client()
        mock_resp = _mock_response(200, json_body={"value": []})
        mock_resp.raise_for_status = MagicMock()

        from powerplatform_deploy.commands import roles as roles_mod
        roles_mod._priv_cache.clear()

        with patch.object(client._session, "get", return_value=mock_resp):
            resolved, missing = _resolve_privileges(
                client,
                {"UnimportedEntity": {"read": "global"}},
            )

        assert resolved == [], "Missing privilege must not appear in resolved list"
        assert "prvReadUnimportedEntity" in missing, (
            f"Missing privilege name must appear in missing list. Got: {missing}"
        )
