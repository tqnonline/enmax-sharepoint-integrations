import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from seed import sections_for_scope, SCOPE_SECTIONS, acquire_token


def test_master_is_reference_and_appconfig():
    # Master push = production-safe data that goes to every environment.
    assert sections_for_scope("master") == {"reference", "app_config"}


def test_all_excludes_sequences():
    # number_sequences must NOT ride along with 'all' — it is env-specific and
    # re-pushing it is an explicit, isolated action (Rule 14 / counter safety).
    assert "number_sequences" not in sections_for_scope("all")
    assert sections_for_scope("all") == {"reference", "app_config", "sample"}


def test_demo_is_sample_only():
    # Demo/transaction data is dev-only and must never include master/config.
    assert sections_for_scope("demo") == {"sample"}


def test_sequences_isolated():
    assert sections_for_scope("sequences") == {"number_sequences"}


def test_scopes_are_exhaustive():
    assert set(SCOPE_SECTIONS) == {"master", "demo", "sequences", "all"}


def test_acquire_token_prefers_byo_env(monkeypatch):
    # DATAVERSE_ACCESS_TOKEN overrides every auth mode and needs no network/SPN.
    monkeypatch.setenv("DATAVERSE_ACCESS_TOKEN", "byo-token-xyz")
    assert acquire_token("https://x.crm.dynamics.com", "device") == "byo-token-xyz"
    assert acquire_token("https://x.crm.dynamics.com", "spn") == "byo-token-xyz"


def test_apply_owner_only_team_owned_tables():
    from seed import _apply_owner
    bind = "/teams(abc)"
    # master + config + sequence tables -> owner assigned to the team
    assert _apply_owner({}, "enmax_autocadasset", bind)["ownerid@odata.bind"] == bind
    assert _apply_owner({}, "enmax_autocadappconfig", bind)["ownerid@odata.bind"] == bind
    assert _apply_owner({}, "enmax_autocadnumbersequence", bind)["ownerid@odata.bind"] == bind
    # sample/transaction table -> NOT assigned (stays user-owned)
    assert "ownerid@odata.bind" not in _apply_owner({}, "enmax_autocaddrawing", bind)
    # no owner_bind -> payload unchanged
    assert _apply_owner({}, "enmax_autocadasset", None) == {}
