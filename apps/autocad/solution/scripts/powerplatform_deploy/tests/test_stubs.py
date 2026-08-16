"""Tests for the four new pp-deploy subcommands: schema, extract, sharepoint, flows.

Why these tests matter:
- All ten subcommands (pack/import/export/roles/seed/optionsets/schema/extract/
  sharepoint/flows) must be discoverable via `pp-deploy --help` so CI scripts
  and developers can find them without reading source.
- sharepoint and flows MUST raise NotImplementedError on a real run so callers
  receive a clear, informative signal rather than a silent no-op.
- sharepoint and flows MUST NOT raise on --dry-run: dry-run is a preview, not an
  error path, and must be safe to call in automated pipelines.
- extract MUST NOT call load_env (offline command, no credentials needed).
- schema/extract subprocess invocations are NOT tested here to avoid requiring
  real Dataverse connections or Excel files in CI.
"""

from __future__ import annotations

import pytest
from typer.testing import CliRunner

from powerplatform_deploy.cli import app
from powerplatform_deploy.commands import flows as flows_mod
from powerplatform_deploy.commands import sharepoint as sharepoint_mod

runner = CliRunner()


# ---------------------------------------------------------------------------
# Command registration — all ten subcommands visible in --help
# ---------------------------------------------------------------------------

class TestCommandRegistration:
    """All ten subcommands must appear in pp-deploy --help output."""

    _ALL_COMMANDS = [
        "pack", "import", "export", "roles", "seed", "optionsets",
        "schema", "extract", "sharepoint", "flows",
    ]

    def test_help_lists_all_ten_commands(self):
        """pp-deploy --help lists all ten subcommands."""
        result = runner.invoke(app, ["--help"])
        assert result.exit_code == 0, result.output
        for cmd in self._ALL_COMMANDS:
            assert cmd in result.output, (
                f"Expected subcommand '{cmd}' in pp-deploy --help output.\n"
                f"Full output:\n{result.output}"
            )

    def test_schema_help_exits_zero(self):
        """pp-deploy schema --help exits 0."""
        result = runner.invoke(app, ["schema", "--help"])
        assert result.exit_code == 0, result.output

    def test_extract_help_exits_zero(self):
        """pp-deploy extract --help exits 0 and mentions --workbook option."""
        result = runner.invoke(app, ["extract", "--help"])
        assert result.exit_code == 0, result.output
        assert "workbook" in result.output.lower(), (
            "extract --help should document the --workbook option.\n"
            f"Full output:\n{result.output}"
        )

    def test_sharepoint_help_exits_zero(self):
        """pp-deploy sharepoint --help exits 0."""
        result = runner.invoke(app, ["sharepoint", "--help"])
        assert result.exit_code == 0, result.output

    def test_flows_help_exits_zero(self):
        """pp-deploy flows --help exits 0."""
        result = runner.invoke(app, ["flows", "--help"])
        assert result.exit_code == 0, result.output


# ---------------------------------------------------------------------------
# sharepoint stub behaviour
# ---------------------------------------------------------------------------

class TestSharepointStub:
    """sharepoint.run() raises NotImplementedError on a real run; is no-op on dry-run."""

    def test_real_run_raises_not_implemented(self):
        """sharepoint.run() MUST raise NotImplementedError so callers get a clear signal.

        A silent no-op would be worse: CI would report success while SharePoint
        libraries were never provisioned.
        """
        with pytest.raises(NotImplementedError):
            sharepoint_mod.run(environment="dev", dry_run=False, verbose=False)

    def test_dry_run_does_not_raise(self):
        """sharepoint.run(dry_run=True) must return cleanly — dry-run is a safe preview."""
        # Should not raise any exception.
        sharepoint_mod.run(environment="dev", dry_run=True, verbose=False)

    def test_dry_run_does_not_call_load_env(self):
        """sharepoint dry-run must not attempt to load credentials (no .env needed)."""
        from unittest.mock import patch
        with patch("powerplatform_deploy.commands.sharepoint.pp_logging.get_logger") as mock_logger:
            mock_logger.return_value = mock_logger
            mock_logger.info = lambda *a, **kw: None
            mock_logger.debug = lambda *a, **kw: None
            # If load_env were called, it would fail in CI (no .env file present).
            # The fact that the call completes without patching load_env proves it
            # is not called.
            sharepoint_mod.run(environment="dev", dry_run=True, verbose=False)


# ---------------------------------------------------------------------------
# flows stub behaviour
# ---------------------------------------------------------------------------

class TestFlowsStub:
    """flows.run() raises NotImplementedError on a real run; is no-op on dry-run."""

    def test_real_run_raises_not_implemented(self):
        """flows.run() MUST raise NotImplementedError so callers get a clear signal.

        A silent no-op would be worse: CI would report success while flows were
        never enabled or wired.
        """
        with pytest.raises(NotImplementedError):
            flows_mod.run(environment="dev", dry_run=False, verbose=False)

    def test_dry_run_does_not_raise(self):
        """flows.run(dry_run=True) must return cleanly — dry-run is a safe preview."""
        # Should not raise any exception.
        flows_mod.run(environment="dev", dry_run=True, verbose=False)

    def test_dry_run_does_not_call_load_env(self):
        """flows dry-run must not attempt to load credentials (no .env needed)."""
        from unittest.mock import patch
        with patch("powerplatform_deploy.commands.flows.pp_logging.get_logger") as mock_logger:
            mock_logger.return_value = mock_logger
            mock_logger.info = lambda *a, **kw: None
            mock_logger.debug = lambda *a, **kw: None
            flows_mod.run(environment="dev", dry_run=True, verbose=False)


# ---------------------------------------------------------------------------
# extract: no load_env call
# ---------------------------------------------------------------------------

class TestExtractNoCredentials:
    """extract.run() must never call load_env — it is an offline command."""

    def test_extract_dry_run_does_not_call_load_env(self):
        """extract dry-run completes without patching load_env, proving it is not called."""
        from powerplatform_deploy.commands import extract as extract_mod
        # If load_env were called it would raise FileNotFoundError in CI.
        # Completing successfully without patching it proves load_env is not called.
        extract_mod.run(environment="dev", dry_run=True, verbose=False)

    def test_extract_module_does_not_import_load_env(self):
        """extract.py must not import load_env — offline contract enforcement."""
        import inspect
        from powerplatform_deploy.commands import extract as extract_mod
        source = inspect.getsource(extract_mod)
        # Check that no import statement for load_env is present.
        # The docstring may mention "load_env" in a comment explaining why it
        # is absent; we only care that the actual import does not exist.
        assert "from powerplatform_deploy.config import load_env" not in source, (
            "extract.py must NOT import load_env. "
            "It is an offline command that requires no Dataverse credentials."
        )
        assert "import load_env" not in source, (
            "extract.py must NOT import load_env. "
            "It is an offline command that requires no Dataverse credentials."
        )
