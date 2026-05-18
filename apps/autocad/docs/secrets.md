# Secrets Reference

All secrets are stored in Azure Key Vault and surfaced as GitHub Environment secrets. **Do not commit any secret values.**

Runbook #009 (`009-key-vault-secrets-and-github-environments.md`) is the authoritative procedure for populating these.

## GitHub Environment: `dev`

| Secret name | Source | Notes |
|-------------|--------|-------|
| `DEV_DATAVERSE_URL` | Power Platform admin | e.g. `https://orgxxxxx.crm3.dynamics.com` |
| `DEV_SP_CLIENT_ID` | Entra app registration | Service principal client ID |
| `DEV_SP_CLIENT_SECRET` | Azure Key Vault | Rotated quarterly per runbook #009 |
| `DEV_TENANT_ID` | Entra | ENMAX dev tenant ID |
| `DEV_POWER_APPS_ENV_ID` | Power Platform admin | Environment GUID for Code App push |
| `DEV_APP_PLAY_URL` | Power Apps | Play URL emitted after first `power-apps push` |

## GitHub Environment: `uat`

| Secret name | Source | Notes |
|-------------|--------|-------|
| `UAT_DATAVERSE_URL` | Power Platform admin | e.g. `https://orgyyyyy.crm3.dynamics.com` |
| `UAT_SP_CLIENT_ID` | Entra app registration | Service principal client ID |
| `UAT_SP_CLIENT_SECRET` | Azure Key Vault | Rotated quarterly per runbook #009 |
| `UAT_TENANT_ID` | Entra | ENMAX UAT tenant ID |
| `UAT_POWER_APPS_ENV_ID` | Power Platform admin | Environment GUID for Code App push |

## Notes

- `DATAVERSE_GEO=can` is a non-secret env var hard-coded in workflows (Canada Central).
- Service account: `eec_pwrplat_svc@enmax.com` — credentials managed per runbook #001.
- `DEV_APP_PLAY_URL` only exists after the first successful `power-apps push` in plan #04.
