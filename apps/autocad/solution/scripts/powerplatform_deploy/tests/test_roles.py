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

import yaml

from powerplatform_deploy.commands.roles import (
    DEPTH_VALUES,
    OP_PREFIXES,
    _find_privilege_id,
    _resolve_privileges,
    ensure_business_unit,
    find_business_unit,
    find_default_team,
    find_root_business_unit,
    replace_privileges,
    upsert_app_config,
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


# ---------------------------------------------------------------------------
# Test 6: least-privilege YAML assertions
# ---------------------------------------------------------------------------

class TestLeastPrivilegeTargets:
    """security_roles.yaml must reflect the Phase 5 least-privilege hardening."""

    @staticmethod
    def _load_yaml() -> dict:
        """Load the seed YAML relative to the repo root (5 levels up from tests/)."""
        from pathlib import Path
        repo_root = Path(__file__).resolve().parent.parent.parent.parent.parent
        seed = repo_root / "solution" / "seed" / "security_roles.yaml"
        with seed.open(encoding="utf-8") as fh:
            return yaml.safe_load(fh)

    @staticmethod
    def _role_privs(data: dict, role_name: str) -> dict:
        for r in data["roles"]:
            if r["name"] == role_name:
                return r.get("privileges", {})
        raise KeyError(f"Role not found: {role_name}")

    def test_least_privilege_targets(self):
        data = self._load_yaml()
        user_privs = self._role_privs(data, "Enmax AutoCAD User")
        approver_privs = self._role_privs(data, "Enmax AutoCAD Approver")
        admin_privs = self._role_privs(data, "Enmax AutoCAD Admin")

        # User: checkout is read-only basic
        assert user_privs["enmax_autocadcheckout"] == {"read": "basic"}, (
            f"User checkout must be {{read: basic}}, got: {user_privs['enmax_autocadcheckout']}"
        )
        # User: numbersequence deleted
        assert "enmax_autocadnumbersequence" not in user_privs, (
            "User must NOT have enmax_autocadnumbersequence"
        )
        # User: auditevent deleted
        assert "enmax_autocadauditevent" not in user_privs, (
            "User must NOT have enmax_autocadauditevent"
        )
        # User: reservation has no assign
        assert "assign" not in user_privs["enmax_autocadreservation"], (
            f"User reservation must not have assign; got: {user_privs['enmax_autocadreservation']}"
        )
        # User: new tables present
        assert "enmax_autocadbroadcastdismissal" in user_privs, (
            "User must have enmax_autocadbroadcastdismissal"
        )
        assert "enmax_autocaduserpreference" in user_privs, (
            "User must have enmax_autocaduserpreference"
        )

        # Approver: reservation is read-only global
        assert approver_privs["enmax_autocadreservation"] == {"read": "global"}, (
            f"Approver reservation must be {{read: global}}, got: {approver_privs['enmax_autocadreservation']}"
        )

        # Admin: auditevent is read-only global
        assert admin_privs["enmax_autocadauditevent"] == {"read": "global"}, (
            f"Admin auditevent must be {{read: global}}, got: {admin_privs['enmax_autocadauditevent']}"
        )
        # Admin: no delete on reference tables
        assert "delete" not in admin_privs["enmax_autocadbusiness"], (
            f"Admin enmax_autocadbusiness must not have delete; got: {admin_privs['enmax_autocadbusiness']}"
        )
        assert "delete" not in admin_privs["enmax_autocadnumbersequence"], (
            f"Admin enmax_autocadnumbersequence must not have delete; got: {admin_privs['enmax_autocadnumbersequence']}"
        )


# ---------------------------------------------------------------------------
# Test 7: find_default_team filters on isdefault
# ---------------------------------------------------------------------------

class TestFindDefaultTeam:
    """find_default_team must query teams with isdefault eq true scoped to the BU."""

    def test_find_default_team_filters_isdefault(self):
        client = _make_client()

        with patch.object(
            client, "_get", return_value={"value": [{"teamid": "team-guid"}]}
        ) as mock_get:
            result = find_default_team(client, "bu-guid")

        assert result == "team-guid", f"Expected 'team-guid', got {result!r}"
        assert mock_get.call_count == 1
        call_path, call_params = mock_get.call_args[0]
        assert call_path == "teams", f"Expected path 'teams', got {call_path!r}"
        filt = call_params.get("$filter", "")
        assert "isdefault" in filt, f"$filter must contain 'isdefault'; got: {filt}"
        assert "bu-guid" in filt, f"$filter must contain bu-guid; got: {filt}"

    def test_find_default_team_returns_none_when_empty(self):
        client = _make_client()

        with patch.object(client, "_get", return_value={"value": []}):
            result = find_default_team(client, "bu-guid")

        assert result is None


# ---------------------------------------------------------------------------
# Test 8: upsert_app_config patches when record exists
# ---------------------------------------------------------------------------

class TestUpsertAppConfigPatches:
    """upsert_app_config must PATCH when a matching key already exists."""

    def test_upsert_app_config_patches_when_exists(self):
        client = _make_client()
        existing_id = "cfg-id-existing"

        with (
            patch.object(
                client, "_get",
                return_value={"value": [{"enmax_autocadappconfigid": existing_id, "enmax_acdnvalue": "old"}]},
            ),
            patch.object(client, "_patch") as mock_patch,
            patch.object(client, "_post") as mock_post,
            patch.object(client, "_delete") as mock_delete,
        ):
            upsert_app_config(client, "AppOwnerTeamId", "team-abc")

        mock_patch.assert_called_once()
        mock_post.assert_not_called()
        mock_delete.assert_not_called()
        patch_path = mock_patch.call_args[0][0]
        assert existing_id in patch_path, (
            f"PATCH path must include the config id; got: {patch_path}"
        )
        patch_body = mock_patch.call_args[0][1]
        assert patch_body == {"enmax_acdnvalue": "team-abc"}


# ---------------------------------------------------------------------------
# Test 9: upsert_app_config posts when record absent
# ---------------------------------------------------------------------------

class TestUpsertAppConfigPosts:
    """upsert_app_config must POST when no matching key is found."""

    def test_upsert_app_config_posts_when_absent(self):
        client = _make_client()

        mock_resp = _mock_response(204)

        with (
            patch.object(client, "_get", return_value={"value": []}),
            patch.object(client, "_patch") as mock_patch,
            patch.object(client, "_post", return_value=mock_resp) as mock_post,
            patch.object(client, "_delete") as mock_delete,
        ):
            upsert_app_config(client, "AppOwnerTeamId", "team-xyz")

        mock_post.assert_called_once()
        mock_patch.assert_not_called()
        mock_delete.assert_not_called()
        post_args = mock_post.call_args[0]
        assert post_args[0] == "enmax_autocadappconfigs", (
            f"POST path must be 'enmax_autocadappconfigs'; got: {post_args[0]}"
        )
        post_body = post_args[1]
        assert post_body == {"enmax_acdnkey": "AppOwnerTeamId", "enmax_acdnvalue": "team-xyz"}, (
            f"POST body mismatch: {post_body}"
        )


# ---------------------------------------------------------------------------
# Test 10: upsert_app_config dedupes duplicate keys (keep real GUID, delete empty)
# ---------------------------------------------------------------------------

class TestUpsertAppConfigDedupes:
    """Duplicate AppOwnerTeamId rows must collapse to one real value."""

    def test_upsert_keeps_non_empty_and_deletes_empty_duplicate(self):
        client = _make_client()
        empty_id = "cfg-empty"
        real_id = "cfg-real"
        empty_guid = "00000000-0000-0000-0000-000000000000"

        with (
            patch.object(
                client, "_get",
                return_value={"value": [
                    {"enmax_autocadappconfigid": empty_id, "enmax_acdnvalue": empty_guid},
                    {"enmax_autocadappconfigid": real_id, "enmax_acdnvalue": "team-keep"},
                ]},
            ),
            patch.object(client, "_patch") as mock_patch,
            patch.object(client, "_post") as mock_post,
            patch.object(client, "_delete") as mock_delete,
        ):
            upsert_app_config(client, "AppOwnerTeamId", "team-new")

        mock_post.assert_not_called()
        mock_patch.assert_called_once()
        assert real_id in mock_patch.call_args[0][0]
        assert mock_patch.call_args[0][1] == {"enmax_acdnvalue": "team-new"}
        mock_delete.assert_called_once()
        assert empty_id in mock_delete.call_args[0][0]
