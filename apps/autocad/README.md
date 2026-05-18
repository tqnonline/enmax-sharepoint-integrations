# ENMAX AutoCAD Document Numbering

Power Platform Code App for structured, concurrency-safe drawing number issuance and lifecycle management at ENMAX.

## Purpose

Replaces the legacy manual process for assigning AutoCAD drawing numbers across six cascading segments (Business, Asset, Unit, Domain, System, Kind). Ensures uniqueness, auditability, and concurrent access safety via a Dataverse plug-in–backed custom action.

## Repository layout

```
apps/code-app/      React 18 + Fluent UI v9 Code App (plan #04+)
solution/
  plugins/          C# Dataverse plug-in (plan #03)
  src/              PAC solution unpack target (plan #02)
  seed/             YAML deterministic seed data (plan #02)
  scripts/          Python deployment + seed scripts
docs/               Architecture notes (see .worktrees/specs/ for full spec)
.github/workflows/  CI + CD pipelines
```

Spec docs and implementation plans live on the `specs` orphan branch, accessible via:

```powershell
git worktree add .worktrees/specs specs
# then read: .worktrees/specs/docs/superpowers/specs/
```

## Local dev quickstart

```powershell
# Prerequisites: Node 20, npm 10, Python 3.11+, .NET SDK 10, PAC CLI
git clone https://github.com/tqnonline/enmax-autocad
cd enmax-autocad
npm install

# Code App (requires plan #04 env binding for full dev server)
Set-Location apps/code-app
npm run dev

# Python tooling
uv venv .venv
.\.venv\Scripts\Activate.ps1
uv pip install -r solution/scripts/requirements.txt

# Plug-in build
Set-Location solution/plugins/IssueNumbers
dotnet build
```

`power-apps init` (binding to a live Power Apps environment) is deferred to plan #04 and requires a `DEV_POWER_APPS_ENV_ID`.

## License

Proprietary — see [LICENSE](./LICENSE). All rights reserved, ENMAX Corporation.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for branch model, PR conventions, and reviewer requirements.
