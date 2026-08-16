# Windows Agent Guide — Migrate to `enmax-corp/cnp-sharepoint-integrations`

**Audience:** an AI coding agent (GitHub Copilot, opencode, or a human following
along) operating on a **Windows machine**, tasked with moving this repository
from its current location to the ENMAX GitHub Enterprise org and continuing
work there.

**Current location:** `https://github.com/tqnonline/enmax-sharepoint-integrations`
(private, test/staging org — used to build and validate this monorepo merge;
see `docs/MIGRATION_PLAN.md` for how it was assembled).

**Target location:** `https://github.com/enmax-corp/cnp-sharepoint-integrations`
(GitHub Enterprise org — the real, governed home for this repo).

Do not skip the **STOP AND VERIFY** checkpoints. Do not invent secret values,
reviewer usernames, or SPN credentials — those are named human/IT actions,
listed explicitly where they occur.

---

## 0. Before you start — read this

- This guide moves **git history**, not just a working tree snapshot. Follow
  it in order; do not `git init` a fresh repo and copy files by hand — that
  silently discards the commit history, ADR provenance, and `git blame`
  traceability that Phase 2 of the original migration deliberately preserved
  (see `docs/MIGRATION_PLAN.md` §"History-preserving import").
- The two orgs (`tqnonline` and `enmax-corp`) are almost certainly separate
  GitHub tenants with separate authentication. You will likely need **two
  separate `gh auth login` sessions** (or one account with access to both, if
  that exists). Check this first — see §1.
- If the Windows machine cannot reach `tqnonline` at all (corporate firewall,
  no personal-org access from a managed device), use the **bundle-file
  fallback** in §2B instead of a direct network clone.
- Nothing in `enmax-corp/cnp-sharepoint-integrations` should be assumed to
  exist yet. This guide creates it. If someone already created an empty repo
  there, skip the creation sub-step and push into the existing empty repo.

---

## 1. Prerequisites

Run each check. Do not proceed past a failed check without resolving it.

```powershell
# Git for Windows
git --version                      # need >= 2.40

# GitHub CLI
gh --version                       # need >= 2.40

# PowerShell 7 (this repo's deploy tooling requires pwsh, not Windows PowerShell 5.1)
$PSVersionTable.PSVersion          # need Major -ge 7

# Confirm current auth state
gh auth status
```

If `gh` or `git` are missing:

```powershell
winget install --id Git.Git -e
winget install --id GitHub.cli -e
winget install --id Microsoft.PowerShell -e
```

### 1.1 Authenticate to the SOURCE org (`tqnonline`)

```powershell
gh auth login --hostname github.com
# Choose: GitHub.com, HTTPS, authenticate with a token or browser login.
# The account used must have at least READ access to
# tqnonline/enmax-sharepoint-integrations.
```

### 1.2 Authenticate to the TARGET org (`enmax-corp`)

This is very likely a **separate identity** (corporate SSO-backed GitHub
Enterprise account), not the same login as step 1.1.

```powershell
# If enmax-corp is GitHub Enterprise Cloud with SAML SSO, you still auth
# against github.com but must separately AUTHORIZE the resulting token for
# the enmax-corp org (Settings -> a banner appears on github.com prompting
# "Authorize" for SSO orgs). If it's GitHub Enterprise SERVER (self-hosted,
# different domain), use --hostname with that domain instead:
gh auth login --hostname github.com
# or, for a self-hosted GHE instance:
# gh auth login --hostname github.enmax.com

gh auth status
# Confirm you see an authenticated session with access to enmax-corp. If
# using `gh auth switch` between two github.com identities, note the CLI
# only holds one active github.com session color at a time per host - you
# may need a second machine profile, GH_TOKEN env var, or `gh auth switch`.
```

**STOP AND VERIFY:** confirm write/admin access to the target org before
continuing:

```powershell
gh api orgs/enmax-corp --jq '.login'
# Expect: "enmax-corp". A 404 or 403 here means auth/SSO authorization isn't
# resolved yet - fix it before proceeding. Do not try to work around it by
# using a personal fork or a different org.
```

---

## 2A. Clone the source with full history (network path — preferred)

```powershell
$Work = "$env:USERPROFILE\migration-work"
New-Item -ItemType Directory -Force -Path $Work | Out-Null
Set-Location $Work

git clone --mirror https://github.com/tqnonline/enmax-sharepoint-integrations.git source.git
Set-Location source.git

# Inspect what you're about to move - confirm the 4 expected branches and
# no unexpected extra refs (GitHub keeps closed PR refs server-side; these
# should NOT be pushed to the new repo - see the explicit ref list in §3).
git branch -a
git tag -l
git for-each-ref
```

Expect exactly these branches: `main`, `dev`, `specs`, `runbooks`. No tags
(the migration's rescue tag `rescue/handoff-doc-generators` lives on the
**original** `enmax-apinv2sp-integration` repo, not this monorepo — it does
not need to move). You will likely also see a stray `refs/pull/1/head` —
this is a closed test-verification PR ref from the original migration
session; it must **not** be pushed forward (see §3).

## 2B. Bundle-file fallback (air-gapped / firewalled Windows machine)

If the Windows machine cannot reach `tqnonline` directly, run this step on
**any machine that can** (e.g. the machine this migration was originally
built on), producing a single portable file:

```bash
# On a machine with access to the source repo:
cd /path/to/enmax-sharepoint-integrations
git bundle create enmax-sharepoint-integrations.bundle --all
```

Transfer `enmax-sharepoint-integrations.bundle` to the Windows machine via
your org's approved internal transfer method (file share, USB, artifact
storage — not email/personal cloud storage, given this repo's
`DataClassification: Confidential` tagging convention carried over from
inv2sp's Bicep tags).

On the Windows machine:

```powershell
$Work = "$env:USERPROFILE\migration-work"
New-Item -ItemType Directory -Force -Path $Work | Out-Null
Set-Location $Work

git clone enmax-sharepoint-integrations.bundle source.git
Set-Location source.git
git branch -a   # verify: main, dev, specs, runbooks
```

Continue with §3 using this `source.git` in place of the one from §2A.

---

## 3. Create the target repo and push history

### 3.1 Create the empty target repo (skip if it already exists)

```powershell
gh repo create enmax-corp/cnp-sharepoint-integrations --private `
  --description "Monorepo: Power Apps Code App (document numbering) + Azure Logic App Standard (AP invoices -> SharePoint) integrations"
```

If it already exists and is non-empty, **stop** — do not force-push over
existing history without explicit human confirmation of what's there.

### 3.2 Push exactly the intended refs (not a blind `--mirror` push)

A blind `git push --mirror` would also attempt to push the closed PR ref
(`refs/pull/1/head`), which GitHub's server-side `refs/pull/*` namespace
rejects as read-only, and would fail the whole push. Push explicit refs
instead:

```powershell
# Still inside source.git (the --mirror clone from §2A or §2B)
git remote add target https://github.com/enmax-corp/cnp-sharepoint-integrations.git

git push target refs/heads/main:refs/heads/main
git push target refs/heads/dev:refs/heads/dev
git push target refs/heads/specs:refs/heads/specs
git push target refs/heads/runbooks:refs/heads/runbooks
```

**STOP AND VERIFY:**

```powershell
gh api repos/enmax-corp/cnp-sharepoint-integrations/branches --jq '.[].name'
# Expect: dev, main, runbooks, specs (order may vary)

git ls-remote target
# Confirm no refs/pull/* appear - only refs/heads/*
```

Set the default branch:

```powershell
gh api repos/enmax-corp/cnp-sharepoint-integrations --method PATCH -f default_branch=dev
```

### 3.3 Set up your working checkout

```powershell
Set-Location $Work
git clone https://github.com/enmax-corp/cnp-sharepoint-integrations.git
Set-Location cnp-sharepoint-integrations
git checkout dev
git log --oneline -5
# Sanity check: this should show the same commit history as the
# tqnonline source (same SHAs - a mirror push does not rewrite history).
```

From this point on, **work only in this `cnp-sharepoint-integrations`
checkout.** Do not keep editing the old `tqnonline` clone.

---

## 4. Decide: rename internal references, or keep as-is?

The GitHub repo slug is changing (`enmax-sharepoint-integrations` →
`cnp-sharepoint-integrations`) but the following tracked files still contain
the **old** slug or org name:

| File | What it references |
|---|---|
| `package.json`, `package-lock.json` | root package `name` field |
| `README.md` | doc links |
| `docs/MIGRATION_PLAN.md` | historical narrative — describes the tqnonline migration itself |
| `.github/ISSUE_TEMPLATE/manual-handoff.yml` | a placeholder GitHub URL |
| `apps/autocad/scripts/PowerPlatform.Deploy/Private/Get-PpEnvConfig.ps1` | a code comment naming the migration event |

**This is a judgment call — make it explicitly, do not silently pick one:**

- **Recommended:** leave `package.json`'s `name` field and
  `docs/MIGRATION_PLAN.md` alone (they're historical/internal identifiers,
  not user-facing), but fix the one **live, actionable** reference:
  `.github/ISSUE_TEMPLATE/manual-handoff.yml`'s runbook-link placeholder,
  since that one actively misdirects a future issue reporter to the wrong
  (tqnonline, soon-to-be-archived) repo.
- **Alternative:** do a full rename pass (`package.json` name →
  `cnp-sharepoint-integrations`, README title, etc.) if ENMAX's internal
  convention requires the package name to match the repo slug exactly. If
  you take this path, re-run `npm install` afterward (package name changes
  do not require a lockfile regen, but verify `npm ci` still succeeds) and
  re-run the full verification suite in §7 before proceeding.

Minimum required fix, either way:

```powershell
# Update the ISSUE_TEMPLATE placeholder to point at the new repo
(Get-Content .github\ISSUE_TEMPLATE\manual-handoff.yml -Raw) `
  -replace 'https://github\.com/tqnonline/enmax-sharepoint-integrations', 'https://github.com/enmax-corp/cnp-sharepoint-integrations' `
  | Set-Content .github\ISSUE_TEMPLATE\manual-handoff.yml

git add .github/ISSUE_TEMPLATE/manual-handoff.yml
git commit -m "chore: repoint manual-handoff issue template to enmax-corp/cnp-sharepoint-integrations"
git push origin dev
```

Also update `CODEOWNERS` — it currently lists `@rahulnakmol` (a personal
github.com username) as owner of nearly everything. **This is a named human
decision, not something to guess at:** confirm with the actual ENMAX team who
the correct enterprise-org owner(s) should be, then edit
`.github/CODEOWNERS` accordingly before rulesets (which require CODEOWNERS
review) are enforced in §5.

---

## 5. Re-apply repository configuration

The ruleset definitions already exist as versioned JSON in this repo —
reuse them rather than re-authoring by hand.

### 5.1 Repo-level merge settings

```powershell
gh api repos/enmax-corp/cnp-sharepoint-integrations --method PATCH `
  -f allow_squash_merge=true `
  -f allow_merge_commit=false `
  -f allow_rebase_merge=false `
  -f delete_branch_on_merge=true `
  -f allow_update_branch=true `
  -f squash_merge_commit_title=PR_TITLE `
  -f squash_merge_commit_message=PR_BODY
```

### 5.2 Branch protection rulesets

```powershell
gh api repos/enmax-corp/cnp-sharepoint-integrations/rulesets --method POST --input .github/rulesets/protect-main.json
gh api repos/enmax-corp/cnp-sharepoint-integrations/rulesets --method POST --input .github/rulesets/protect-dev.json
```

**STOP AND VERIFY:**

```powershell
gh api repos/enmax-corp/cnp-sharepoint-integrations/rulesets --jq '.[] | "\(.name): \(.enforcement)"'
# Expect: protect-dev: active / protect-main: active
```

### 5.3 GitHub Environments

```powershell
gh api repos/enmax-corp/cnp-sharepoint-integrations/environments/dev --method PUT
gh api repos/enmax-corp/cnp-sharepoint-integrations/environments/prod-plan --method PUT
```

For `uat` and `prod`, this enterprise org's billing tier should support
required reviewers (the earlier `tqnonline` test org's plan did not — see
`docs/MIGRATION_PLAN.md` final report, "Blocked / requires you" item 1).
**Get the real reviewer's GitHub user ID first** — do not hardcode a
placeholder:

```powershell
$reviewerId = gh api users/<real-reviewer-github-username> --jq '.id'

gh api repos/enmax-corp/cnp-sharepoint-integrations/environments/uat --method PUT `
  -f 'reviewers[][type]=User' -F "reviewers[][id]=$reviewerId"

gh api repos/enmax-corp/cnp-sharepoint-integrations/environments/prod --method PUT `
  -f 'reviewers[][type]=User' -F "reviewers[][id]=$reviewerId"
```

If this fails with *"Please ensure the billing plan supports the required
reviewers protection rule"* again, that's a real org-billing/tier issue —
escalate to whoever owns the `enmax-corp` GitHub Enterprise subscription;
do not silently continue without the gate.

---

## 6. Add real secrets

**Do not invent, guess, or placeholder these values.** Every value below is
a named human/IT action (ServiceNow request, Azure AD app registration,
Key Vault lookup) — get the real value from whoever owns that credential,
then set it:

```powershell
# Example pattern - repeat per secret, per environment:
gh secret set AUTOCAD_SP_CLIENT_ID     --env dev  --repo enmax-corp/cnp-sharepoint-integrations
gh secret set AUTOCAD_SP_CLIENT_SECRET --env dev  --repo enmax-corp/cnp-sharepoint-integrations
# ... (gh secret set prompts for the value interactively, or pipe via stdin -
# never pass secret values as a bare CLI argument that lands in shell history)
```

Full secret list and which environment(s) each belongs to: see
[`docs/cicd.md`](../cicd.md) §"Environments and secrets". Summary:

| Secret | Environments |
|---|---|
| `AUTOCAD_SP_CLIENT_ID` / `_SP_CLIENT_SECRET` / `_TENANT_ID` | dev, uat, prod |
| `AUTOCAD_SVC_USERNAME` / `_SVC_PASSWORD` | dev, uat, prod |
| `AUTOCAD_DATAVERSE_URL` / `_APP_ID` / `_APP_DISPLAY_NAME` / `_POWER_APPS_ENV_ID` | dev, uat, prod |
| `INV2SP_AZURE_CLIENT_ID` / `_CLIENT_SECRET` / `_TENANT_ID` / `_SUBSCRIPTION_ID` | dev, prod, prod-plan |

**Before setting `AUTOCAD_SVC_USERNAME`/`_SVC_PASSWORD`:** confirm the ROPC
(Resource-Owner-Password-Credentials) auth spike from
`docs/MIGRATION_PLAN.md` Phase 0 item 1 has actually been validated —
i.e. the service account is MFA-exempt / excluded from any Conditional
Access policy blocking legacy auth for the PAC CLI's application ID. If
that spike hasn't run yet, do it now, on this Windows machine, before
wiring the secret in:

```powershell
pac auth create --url <dev-environment-url> --username eec_pwrplat_svc@enmax.com --password <password>
pac auth list
# Expect a User (not Application) profile listed, successfully. If this
# fails with an MFA/Conditional-Access error, STOP - escalate to the
# identity team per docs/MIGRATION_PLAN.md Phase 0 item 1. Do not set the
# AUTOCAD_SVC_* secrets or proceed to §7 until this succeeds.
```

---

## 7. Verify

### 7.1 Corp runner capability probe

Confirm the actual `windows-latest-enmax-corp` / `ubuntu-latest-enmax-corp`
self-hosted runners (referenced by every workflow in `.github/workflows/`)
are registered and reachable from this org — this could not be tested from
the `tqnonline` staging environment:

```powershell
gh workflow run "CI" --repo enmax-corp/cnp-sharepoint-integrations --ref dev
Start-Sleep -Seconds 15
gh run list --repo enmax-corp/cnp-sharepoint-integrations --workflow="CI" --limit 3
```

**STOP AND VERIFY:** the run must move past `queued` into `in_progress`
within a reasonable window. If it stays `queued` indefinitely, the corp
runner pool isn't attached to this repo/org yet — escalate to the platform
team (see `docs/MIGRATION_PLAN.md` Phase 0 item 2) before relying on any
CD pipeline.

### 7.2 Branch policy enforcement

```powershell
git checkout -b test/verify-branch-policy dev
"verification" | Out-File docs/VERIFY_BRANCH_POLICY_TEST.md
git add docs/VERIFY_BRANCH_POLICY_TEST.md
git commit -m "test: verify branch policy enforcement (to be deleted)"
git push -u origin test/verify-branch-policy

gh pr create --repo enmax-corp/cnp-sharepoint-integrations --base main --head test/verify-branch-policy `
  --title "test: verify branch-policy rejects feature->main" `
  --body "Temporary verification PR - expect the Branch Policy check to FAIL. Will be closed."
```

Wait for the `Branch Policy` check to report, confirm it **fails** (targeting
`main` directly, not from `dev`), then clean up:

```powershell
gh pr close <pr-number> --repo enmax-corp/cnp-sharepoint-integrations --delete-branch
git checkout dev
git branch -D test/verify-branch-policy
git fetch origin --prune
```

### 7.3 Local build/test verification (optional but recommended)

If Node 22, .NET SDK 10, Python 3.11 + `uv`, and the PAC CLI are available
on this Windows machine, re-run the same checks the original migration
verified on macOS (this is the first time they'll run natively on Windows,
where autocad's CI actually targets):

```powershell
npm ci
npm run build --workspaces --if-present
npm test --workspaces --if-present

Set-Location apps\autocad\solution\plugins
dotnet build IssueNumbers --configuration Release
dotnet test IssueNumbers.Tests --filter "Category!=Integration" --configuration Release
Set-Location ..\..\..\..

Invoke-Pester -Path apps\autocad\scripts\PowerPlatform.Deploy\Tests
Invoke-Pester -Path apps\inv2sp\tests
```

---

## 8. Continue the outstanding migration work

The items below were explicitly left `BLOCKED`/`HANDOFF` in the original
migration (see `docs/MIGRATION_PLAN.md` Phase 0 and the final report).
Work through them now that you're on the real org:

1. **inv2sp dev SPN** — does not exist yet. Request via ServiceNow: Contributor
   role on `RG-ENMAX-COR-UW2-INV2SP-T`.
2. **inv2sp prod SPN** — same, for `RG-ENMAX-COR-UW2-INV2SP-P`. Note ServiceNow
   only creates a Federated Credential; the client secret must be added by
   hand (see `apps/inv2sp/docs/decisions/0033-github-actions-prod-deployment-spn.md`).
3. **ROPC / Conditional Access exclusion for `eec_pwrplat_svc@enmax.com`** —
   validated in §6 above; if it failed, this is now the top blocker for
   autocad's CD pipelines (Code App push cannot run in CI without it, and
   there is no cached-profile fallback on ephemeral runners).
4. **Corp runner image/toolchain** — confirmed reachable in §7.1; if jobs
   ran but failed on missing tools (Node/. NET/Python/PAC CLI/az/bicep), ask
   the platform team about a pre-baked image per `docs/cicd.md`'s note on
   ephemeral-runner setup cost.
5. **`uat`/`prod` reviewer gates** — confirmed in §5.3.
6. **CODEOWNERS real owners** — confirmed in §4.

Once all of the above are resolved and a real `dev` → `main` → `prod`
promotion has been rehearsed end-to-end, this repo is the authoritative
source. Proceed to §9.

---

## 9. Decommission the old locations

**Only after the above is confirmed working.** Do not delete anything
before that.

1. Archive (do not delete) `tqnonline/enmax-sharepoint-integrations` —
   set it read-only via `gh api repos/tqnonline/enmax-sharepoint-integrations
   --method PATCH -f archived=true`.
2. Archive the two original source repos the same way:
   `tqnonline/enmax-autocad`, `tqnonline/enmax-apinv2sp-integration`. Their
   `rescue/handoff-doc-generators` tag and full reflog remain intact and
   readable in an archived repo — do not delete these either.
3. Update any external references (team wikis, ServiceNow tickets, Slack
   pinned links, other repos' READMEs) that point at the old
   `tqnonline/*` URLs to point at `enmax-corp/cnp-sharepoint-integrations`
   instead.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `gh api orgs/enmax-corp` returns 404/403 | SSO not authorized for this token, or wrong host | Re-run `gh auth login`, complete the SSO authorization step on github.com's Settings > Applications page |
| `git push target refs/heads/main:...` rejected, non-fast-forward | Target repo wasn't actually empty | Stop; confirm with a human whether the existing content should be preserved, merged, or intentionally overwritten - do not force-push blindly |
| CI run stays `queued` forever | Corp self-hosted runner not attached to this repo/org | Escalate per §7.1 / Phase 0 item 2 - do not swap `runs-on:` to a public runner as a silent workaround without approval, since the design intentionally requires corp network access |
| `pac auth create --username/--password` fails with an MFA or "AADSTS" error | Conditional Access blocking legacy/ROPC auth for the service account | Escalate to identity team per §6 - this is Phase 0's highest-severity risk materializing, not a transient error |
| Environment reviewer API call fails with a billing-plan message | Org tier doesn't support required reviewers on private-repo environments | Escalate to whoever owns the GitHub Enterprise subscription for `enmax-corp` |
