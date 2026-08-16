# Contributing

## Reviewer model

Single-reviewer model. All PRs require **one approval from Rahul Akmol** before merge.
This applies to all paths including `solution/plugins/` (per project decision 2026-05-17).

## Branch model

| Branch | Purpose |
|--------|---------|
| `main` | Protected trunk — release branch |
| `dev` | Integration branch — default PR target |
| `specs` | Orphan — spec docs + design assets (do not merge into main) |
| `runbooks` | Orphan — IT-Admin manual runbooks (do not merge into main) |

Feature branches: `feat/<NNN>-short-description` → PR to `dev`.

## Branch protection (applied via GitHub UI by repo admin)

`main` requires:
- Status check: `ci` green
- Pull request reviews: 1 approval (Rahul)
- Conversation resolution required
- No force-push

See runbook #009 or open a follow-up plan `#01a` to script via `gh api` if reproducibility across environments matters.

## Windows-only development

All development is on Windows. All CI runners are pinned to `windows-latest`.
Use PowerShell 7+ (`pwsh`) for all shell scripts.

## Commit style

`type(scope): message` — types: `feat`, `fix`, `chore`, `docs`, `ci`, `refactor`, `test`.

## OS / runtime requirements

| Tool | Minimum |
|------|---------|
| Node | 20.x LTS |
| npm | 10.x |
| Python | 3.11+ |
| .NET SDK | 10.x (build host; plug-in targets net462) |
| PAC CLI | latest stable |

## Running locally

```powershell
# Install workspace deps
npm install

# Code App dev server (requires plan #04 env binding first)
Set-Location code-app
npm run dev

# Python tooling
uv venv .venv
.\.venv\Scripts\Activate.ps1
uv pip install -r solution/scripts/requirements.txt

# Build plug-in
Set-Location solution/plugins/IssueNumbers
dotnet build
```

## PR checklist

Use `.github/PULL_REQUEST_TEMPLATE.md` — it autofills when you open a PR.

## Issue templates

Use `.github/ISSUE_TEMPLATE/` — bug, feature, or manual-handoff forms.
