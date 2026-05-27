"""Tests for the pp-deploy CLI (cli.py).

Why these tests matter:
- The typer app must expose pack/import/export subcommands so CI scripts and
  developers can discover them via `pp-deploy --help`.
- --dry-run MUST NOT invoke subprocess.run: running pac in a test environment
  would require a real Dataverse connection and valid credentials.
- The import command MUST retain --async in its subprocess call; dropping it
  causes upgrade imports to exceed PAC's 30-minute sync timeout.
"""

from __future__ import annotations

import subprocess
from pathlib import Path
from unittest.mock import MagicMock, call, patch

import pytest
from typer.testing import CliRunner

from powerplatform_deploy.cli import app

runner = CliRunner()

# Fake credentials dict returned by load_env in all tests.
_FAKE_CFG = {
    "DATAVERSE_URL": "https://org.crm3.dynamics.com",
    "DATAVERSE_CLIENT_ID": "test-client",
    "DATAVERSE_CLIENT_SECRET": "test-secret",
    "DATAVERSE_TENANT_ID": "test-tenant",
}


# ---------------------------------------------------------------------------
# Command registration
# ---------------------------------------------------------------------------

class TestCommandRegistration:
    """The typer app must expose the three expected subcommands."""

    def test_app_help_lists_pack(self):
        """pp-deploy --help output includes 'pack'."""
        result = runner.invoke(app, ["--help"])
        assert result.exit_code == 0, result.output
        assert "pack" in result.output

    def test_app_help_lists_import(self):
        """pp-deploy --help output includes 'import'."""
        result = runner.invoke(app, ["--help"])
        assert result.exit_code == 0, result.output
        assert "import" in result.output

    def test_app_help_lists_export(self):
        """pp-deploy --help output includes 'export'."""
        result = runner.invoke(app, ["--help"])
        assert result.exit_code == 0, result.output
        assert "export" in result.output

    def test_pack_has_help_text(self):
        """pp-deploy pack --help exits 0 with descriptive text."""
        result = runner.invoke(app, ["pack", "--help"])
        assert result.exit_code == 0, result.output
        assert "pack" in result.output.lower()

    def test_import_has_help_text(self):
        """pp-deploy import --help exits 0 with descriptive text."""
        result = runner.invoke(app, ["import", "--help"])
        assert result.exit_code == 0, result.output
        assert "import" in result.output.lower()

    def test_export_has_help_text(self):
        """pp-deploy export --help exits 0 with descriptive text."""
        result = runner.invoke(app, ["export", "--help"])
        assert result.exit_code == 0, result.output
        assert "export" in result.output.lower()


# ---------------------------------------------------------------------------
# --dry-run does not invoke subprocess
# ---------------------------------------------------------------------------

class TestDryRun:
    """--dry-run must log the command without calling subprocess.run."""

    def test_pack_dry_run_does_not_call_subprocess(self):
        """pack --dry-run skips subprocess execution."""
        mock_run = MagicMock()
        with (
            patch("powerplatform_deploy.commands.pack.subprocess.run", mock_run),
            patch("powerplatform_deploy.commands.pack.load_env", return_value=_FAKE_CFG),
        ):
            result = runner.invoke(app, ["pack", "--environment", "dev", "--dry-run"])
        assert result.exit_code == 0, result.output
        mock_run.assert_not_called()

    def test_import_dry_run_does_not_call_subprocess(self):
        """import --dry-run skips subprocess execution."""
        mock_run = MagicMock()
        with (
            patch("powerplatform_deploy.commands.import_.subprocess.run", mock_run),
            patch("powerplatform_deploy.commands.import_.load_env", return_value=_FAKE_CFG),
        ):
            result = runner.invoke(app, ["import", "--environment", "dev", "--dry-run"])
        assert result.exit_code == 0, result.output
        mock_run.assert_not_called()

    def test_export_dry_run_does_not_call_subprocess(self):
        """export --dry-run skips subprocess execution."""
        mock_run = MagicMock()
        with (
            patch("powerplatform_deploy.commands.export.subprocess.run", mock_run),
            patch("powerplatform_deploy.commands.export.load_env", return_value=_FAKE_CFG),
        ):
            result = runner.invoke(app, ["export", "--environment", "dev", "--dry-run"])
        assert result.exit_code == 0, result.output
        mock_run.assert_not_called()


# ---------------------------------------------------------------------------
# Import invariant: --async flag must be present
# ---------------------------------------------------------------------------

class TestImportInvariant:
    """The import command must pass --async to pac to avoid the 30-min timeout."""

    def test_import_command_includes_async_flag(self, tmp_path: Path):
        """import run() builds a pac command containing --async and --max-async-wait-time."""
        captured: list[list[str]] = []

        def fake_run(cmd, **kwargs):
            captured.append(list(cmd))
            return MagicMock(returncode=0)

        # Create a fake zip so the existence check passes.
        fake_zip = tmp_path / "solution" / "build" / "EnmaxAutoCADNumbering_unmanaged.zip"
        fake_zip.parent.mkdir(parents=True)
        fake_zip.write_bytes(b"fake")

        from powerplatform_deploy.commands import import_ as import_mod

        with (
            patch("powerplatform_deploy.commands.import_.subprocess.run", side_effect=fake_run),
            patch("powerplatform_deploy.commands.import_._pac", return_value="pac"),
            patch("powerplatform_deploy.commands.import_.load_env", return_value=_FAKE_CFG),
            # Make the repo_root resolve to tmp_path so zip_path == fake_zip.
            patch.object(
                Path,
                "resolve",
                side_effect=lambda self: (
                    tmp_path / "solution" / "scripts" / "powerplatform_deploy" / "commands" / "import_.py"
                    if str(self).endswith("import_.py")
                    else Path.resolve.__wrapped__(self)  # type: ignore[attr-defined]
                    if hasattr(Path.resolve, "__wrapped__")
                    else self
                ),
            ) if False else patch(
                "powerplatform_deploy.commands.import_.Path",
                wraps=Path,
            ) if False else patch(
                # Patch at module level: override __file__ so repo_root = tmp_path.
                "powerplatform_deploy.commands.import_.__file__",
                str(tmp_path / "solution" / "scripts" / "powerplatform_deploy" / "commands" / "import_.py"),
            ),
        ):
            import_mod.run(environment="dev", dry_run=False, verbose=False)

        assert captured, "subprocess.run was never called"
        cmd = captured[0]
        assert "--async" in cmd, (
            "pac solution import MUST include --async to avoid the 30-minute sync timeout. "
            f"Actual command: {cmd}"
        )
        assert "--max-async-wait-time" in cmd, (
            f"pac solution import is missing --max-async-wait-time. Actual: {cmd}"
        )
