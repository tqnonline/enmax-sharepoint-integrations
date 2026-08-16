import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from reconcile_refdata import codes_to_deactivate


def test_deactivates_only_codes_absent_from_canonical():
    dev = {"AES", "PRO", "GEN"}
    canonical = {"AES", "GEN"}
    # PRO is in dev but not in the Excel-derived canonical set -> deactivate it.
    assert codes_to_deactivate(dev, canonical) == {"PRO"}


def test_never_flags_canonical_only_codes():
    # A canonical code missing from dev is NOT our concern (seed adds it); never returned.
    assert codes_to_deactivate({"AES"}, {"AES", "NEW"}) == set()
