import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from generate_seed_from_xlsx import split_code_label, unit_code, parse_cell


def test_split_on_first_separator_only():
    # System cell: code is before the FIRST " - "; label keeps the rest verbatim.
    assert split_code_label("ABB - Auxiliary Boiler - Blowdown") == ("ABB", "Auxiliary Boiler - Blowdown")


def test_split_handles_mojibake_and_endash():
    assert split_code_label("ST � Stoney Transit") == ("ST", "Stoney Transit")
    assert split_code_label("AES – Independent System Operator") == ("AES", "Independent System Operator")


def test_split_literal_no_prd22_cleaning():
    # Literal: '>' stays '>', sentinel stays 'XXX' (no 'over'/'Unspecified').
    assert split_code_label("EHA - High Voltage AC (> 34000 V)") == ("EHA", "High Voltage AC (> 34000 V)")
    assert split_code_label("XXX") == ("XXX", "XXX")


def test_unit_pads_single_digit_only():
    assert unit_code("0") == "00"
    assert unit_code("9") == "09"
    assert unit_code("37") == "37"
    assert unit_code("E0") == "E0"
    assert unit_code("XX") == "XX"


def test_parse_cell_does_not_split_vendor():
    # Vendor column is NOT coded — the whole cell is the name even with ' - '.
    assert parse_cell("Camfil Power Systems - Super Radiator Coils", "vendor") == \
        ("Camfil Power Systems - Super Radiator Coils", "Camfil Power Systems - Super Radiator Coils")


def test_parse_cell_skips_placeholders():
    assert parse_cell("Text Field", "vendor") is None
    assert parse_cell("", "asset") is None
    assert parse_cell(None, "asset") is None
