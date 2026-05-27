"""Tests for powerplatform_deploy.config.

Why these tests matter:
- load_env must map the short .env key names (ENVIRONMENT_URL, CLIENT_ID, etc.)
  to the canonical DATAVERSE_* names that provision_roles.py / seed.py expect.
  If that mapping breaks, every deploy script will silently use empty credentials.
- os.environ must win over the file so CI can override values without editing
  the .env file (a common secure-credential pattern in GitHub Actions).
- Stripped quotes ensure that .env files authored on Windows (common in this
  project) don't break when values are quoted.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from powerplatform_deploy.config import load_env


@pytest.fixture()
def tmp_env_file(tmp_path: Path):
    """Return a helper that writes a .env file and returns its parent repo root."""

    def _make(environment: str, content: str) -> Path:
        env_dir = tmp_path / "apps" / "code-app"
        env_dir.mkdir(parents=True)
        (env_dir / f".env.{environment}").write_text(content, encoding="utf-8")
        return tmp_path

    return _make


class TestLoadEnvParsing:
    """load_env correctly parses KEY=VALUE content."""

    def test_parses_basic_key_value(self, tmp_env_file):
        """Basic KEY=VALUE lines are parsed and alias-mapped."""
        root = tmp_env_file(
            "dev",
            "ENVIRONMENT_URL=https://org.crm3.dynamics.com\n"
            "CLIENT_ID=abc\n"
            "CLIENT_SECRET=secret\n"
            "TENANT_ID=tenant\n",
        )
        cfg = load_env("dev", _repo_root=root)
        assert cfg["DATAVERSE_URL"] == "https://org.crm3.dynamics.com"
        assert cfg["DATAVERSE_CLIENT_ID"] == "abc"
        assert cfg["DATAVERSE_CLIENT_SECRET"] == "secret"
        assert cfg["DATAVERSE_TENANT_ID"] == "tenant"

    def test_strips_double_quotes(self, tmp_env_file):
        """Values enclosed in double quotes are unquoted."""
        root = tmp_env_file(
            "dev",
            'ENVIRONMENT_URL="https://org.crm3.dynamics.com"\n'
            'CLIENT_ID="abc"\n'
            'CLIENT_SECRET="s3cr3t"\n'
            'TENANT_ID="t1"\n',
        )
        cfg = load_env("dev", _repo_root=root)
        assert cfg["DATAVERSE_URL"] == "https://org.crm3.dynamics.com"
        assert cfg["DATAVERSE_CLIENT_ID"] == "abc"

    def test_strips_single_quotes(self, tmp_env_file):
        """Values enclosed in single quotes are unquoted."""
        root = tmp_env_file(
            "dev",
            "ENVIRONMENT_URL='https://org.crm3.dynamics.com'\n"
            "CLIENT_ID='abc'\n"
            "CLIENT_SECRET='secret'\n"
            "TENANT_ID='tenant'\n",
        )
        cfg = load_env("dev", _repo_root=root)
        assert cfg["DATAVERSE_URL"] == "https://org.crm3.dynamics.com"

    def test_skips_blank_lines_and_comments(self, tmp_env_file):
        """Blank lines and # comments do not cause parse errors."""
        root = tmp_env_file(
            "dev",
            "# This is a comment\n"
            "\n"
            "ENVIRONMENT_URL=https://org.crm3.dynamics.com\n"
            "CLIENT_ID=abc\n"
            "CLIENT_SECRET=secret\n"
            "TENANT_ID=tenant\n",
        )
        cfg = load_env("dev", _repo_root=root)
        assert "DATAVERSE_URL" in cfg

    def test_all_four_required_keys_present(self, tmp_env_file):
        """All four DATAVERSE_* keys are returned even when sourced via aliases."""
        root = tmp_env_file(
            "dev",
            "ENVIRONMENT_URL=https://org.crm3.dynamics.com\n"
            "CLIENT_ID=abc\n"
            "CLIENT_SECRET=secret\n"
            "TENANT_ID=tenant\n",
        )
        cfg = load_env("dev", _repo_root=root)
        for key in ("DATAVERSE_URL", "DATAVERSE_CLIENT_ID", "DATAVERSE_CLIENT_SECRET", "DATAVERSE_TENANT_ID"):
            assert key in cfg, f"Missing required key: {key}"


class TestLoadEnvEnvWins:
    """os.environ values override .env file values."""

    def test_env_var_wins_over_file(self, tmp_env_file, monkeypatch):
        """When DATAVERSE_URL is set in os.environ it takes priority over the file."""
        root = tmp_env_file(
            "dev",
            "ENVIRONMENT_URL=https://file-value.crm3.dynamics.com\n"
            "CLIENT_ID=abc\n"
            "CLIENT_SECRET=secret\n"
            "TENANT_ID=tenant\n",
        )
        monkeypatch.setenv("DATAVERSE_URL", "https://env-value.crm3.dynamics.com")
        cfg = load_env("dev", _repo_root=root)
        assert cfg["DATAVERSE_URL"] == "https://env-value.crm3.dynamics.com"

    def test_partial_override(self, tmp_env_file, monkeypatch):
        """Only the keys present in os.environ are overridden; others come from file."""
        root = tmp_env_file(
            "dev",
            "ENVIRONMENT_URL=https://file.crm3.dynamics.com\n"
            "CLIENT_ID=file-client\n"
            "CLIENT_SECRET=file-secret\n"
            "TENANT_ID=file-tenant\n",
        )
        monkeypatch.setenv("DATAVERSE_CLIENT_ID", "env-client")
        cfg = load_env("dev", _repo_root=root)
        assert cfg["DATAVERSE_CLIENT_ID"] == "env-client"
        assert cfg["DATAVERSE_URL"] == "https://file.crm3.dynamics.com"


class TestLoadEnvErrors:
    """load_env raises the right errors on bad input."""

    def test_missing_file_raises_file_not_found(self, tmp_path):
        """FileNotFoundError when .env.<environment> does not exist."""
        with pytest.raises(FileNotFoundError):
            load_env("nonexistent", _repo_root=tmp_path)


class TestLoadEnvEnvOnlyMode:
    """load_env env-only fast path: all four DATAVERSE_* in os.environ, no file needed.

    WHY: CD (GitHub Actions) has no .env files — credentials come exclusively
    from repository secrets injected as environment variables. Without this fast
    path every pp-deploy step would raise FileNotFoundError and the workflow
    would fail before doing any real work.
    """

    def test_env_only_returns_values_without_file(self, tmp_path, monkeypatch):
        """When all four DATAVERSE_* are set, load_env succeeds with no .env file.

        tmp_path has no apps/code-app/.env.* files, so any file-based lookup
        would raise FileNotFoundError. Passing confirms the fast path was taken.
        """
        monkeypatch.setenv("DATAVERSE_URL", "https://ci-org.crm3.dynamics.com")
        monkeypatch.setenv("DATAVERSE_CLIENT_ID", "ci-client")
        monkeypatch.setenv("DATAVERSE_CLIENT_SECRET", "ci-secret")
        monkeypatch.setenv("DATAVERSE_TENANT_ID", "ci-tenant")

        cfg = load_env("dev", _repo_root=tmp_path)

        assert cfg["DATAVERSE_URL"] == "https://ci-org.crm3.dynamics.com"
        assert cfg["DATAVERSE_CLIENT_ID"] == "ci-client"
        assert cfg["DATAVERSE_CLIENT_SECRET"] == "ci-secret"
        assert cfg["DATAVERSE_TENANT_ID"] == "ci-tenant"

    def test_env_only_accepts_short_aliases(self, tmp_path, monkeypatch):
        """Short alias names (ENVIRONMENT_URL etc.) also satisfy the fast path.

        WHY: Some CI configs may use the short names from the existing scripts.
        The fast path must accept them so those pipelines don't regress.
        """
        monkeypatch.setenv("ENVIRONMENT_URL", "https://alias-org.crm3.dynamics.com")
        monkeypatch.setenv("CLIENT_ID", "alias-client")
        monkeypatch.setenv("CLIENT_SECRET", "alias-secret")
        monkeypatch.setenv("TENANT_ID", "alias-tenant")

        cfg = load_env("dev", _repo_root=tmp_path)

        assert cfg["DATAVERSE_URL"] == "https://alias-org.crm3.dynamics.com"
        assert cfg["DATAVERSE_CLIENT_ID"] == "alias-client"
        assert cfg["DATAVERSE_CLIENT_SECRET"] == "alias-secret"
        assert cfg["DATAVERSE_TENANT_ID"] == "alias-tenant"

    def test_incomplete_env_falls_through_to_file_error(self, tmp_path, monkeypatch):
        """When env vars are incomplete AND no .env file exists, FileNotFoundError is raised.

        WHY: Regression guard. The fast path must NOT be taken when only some
        keys are present — the missing keys cannot be satisfied from a file that
        doesn't exist, so the error must propagate.
        """
        monkeypatch.setenv("DATAVERSE_URL", "https://partial.crm3.dynamics.com")
        # CLIENT_ID, CLIENT_SECRET, TENANT_ID intentionally absent.

        with pytest.raises(FileNotFoundError):
            load_env("dev", _repo_root=tmp_path)

    def test_env_wins_over_file_when_both_present(self, tmp_env_file, monkeypatch):
        """Canonical env vars override file values even when a .env file exists.

        WHY: Confirms the existing overlay behaviour is preserved by the refactor.
        CI secrets must always win over any stale local file values.
        """
        root = tmp_env_file(
            "dev",
            "ENVIRONMENT_URL=https://file-org.crm3.dynamics.com\n"
            "CLIENT_ID=file-client\n"
            "CLIENT_SECRET=file-secret\n"
            "TENANT_ID=file-tenant\n",
        )
        monkeypatch.setenv("DATAVERSE_URL", "https://env-wins.crm3.dynamics.com")
        monkeypatch.setenv("DATAVERSE_CLIENT_ID", "env-client")
        monkeypatch.setenv("DATAVERSE_CLIENT_SECRET", "env-secret")
        monkeypatch.setenv("DATAVERSE_TENANT_ID", "env-tenant")

        cfg = load_env("dev", _repo_root=root)

        assert cfg["DATAVERSE_URL"] == "https://env-wins.crm3.dynamics.com"
        assert cfg["DATAVERSE_CLIENT_ID"] == "env-client"
