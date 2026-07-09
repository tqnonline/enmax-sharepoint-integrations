#!/usr/bin/env bash
# Deploy remaining ENMAX DEV steps using USER pac auth only (no SPN).
# macOS/Linux friendly — does not require PowerShell.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PAC_PROFILE="${PAC_PROFILE:-ENMAX DEV}"
APP_ID="${APP_ID:-}"
VENV="$REPO_ROOT/.venv-deploy"

# Prefer Azure CLI when already logged in — no browser/device prompt in the IDE terminal.
if [[ -z "${USER_AUTH:-}" ]]; then
  if command -v az &>/dev/null && az account show &>/dev/null 2>&1; then
    USER_AUTH="azcli"
  elif [[ "$(uname -s)" == "Darwin" ]]; then
    USER_AUTH="interactive"
  else
    USER_AUTH="device"
  fi
fi

echo "== ENMAX DEV deploy (user auth, bash) =="
echo "Web API auth: $USER_AUTH (override with USER_AUTH=device|interactive|azcli)"
if [[ "$USER_AUTH" == "azcli" ]] && ! az account show &>/dev/null 2>&1; then
  echo "ERROR: USER_AUTH=azcli but 'az account show' failed. Run: az login --tenant <tenant-id>"
  exit 1
fi

# Bootstrap Python deps (requests, msal, azure-identity) into a local venv.
if [[ ! -d "$VENV" ]]; then
  echo "Creating Python venv at .venv-deploy ..."
  python3 -m venv "$VENV"
fi
# shellcheck source=/dev/null
source "$VENV/bin/activate"
pip install -q -r "$REPO_ROOT/solution/scripts/requirements.txt"
PYTHON="$VENV/bin/python3"

pac auth select --name "$PAC_PROFILE"

ORG_URL="$(pac org who | sed -n 's/.*Org URL:[[:space:]]*//p' | head -1 | tr -d '\r')"
ENV_ID="$(pac org who | sed -n 's/.*Environment ID:[[:space:]]*//p' | head -1 | tr -d '\r')"
TENANT_ID="$(pac auth who | sed -n 's/.*Tenant Id:[[:space:]]*//p' | head -1 | tr -d '\r')"
TOKEN_EXPIRES="$(pac auth who | sed -n 's/.*Token Expires:[[:space:]]*//p' | head -1 | tr -d '\r')"
export DATAVERSE_URL="${ORG_URL%/}"
export DATAVERSE_TENANT_ID="${TENANT_ID}"

echo "Target: $DATAVERSE_URL (env $ENV_ID)"
if [[ -n "$TOKEN_EXPIRES" ]]; then
  echo "pac token expires: $TOKEN_EXPIRES"
  echo "If auth fails, refresh pac login:"
  echo "  pac auth create --name \"$PAC_PROFILE\" --url \"$DATAVERSE_URL\""
fi

if [[ "${IMPORT_SOLUTION:-}" == "1" || "${FULL:-}" == "1" ]]; then
  echo ""
  echo "-- pack + import solution (deploys WS6 fields like enmax_acdnreservationtype) --"
  "$PYTHON" "$REPO_ROOT/solution/scripts/pack.py"
  "$PYTHON" "$REPO_ROOT/solution/scripts/import.py"
  echo ""
  echo "-- patch option set labels --"
  "$PYTHON" "$REPO_ROOT/solution/scripts/patch_optionsets.py" --auth "$USER_AUTH"
fi

echo ""
if [[ -n "${DATAVERSE_ACCESS_TOKEN:-}" ]]; then
  echo "Using DATAVERSE_ACCESS_TOKEN from environment."
else
  echo "Acquiring Dataverse token (auth=$USER_AUTH)..."
  export DATAVERSE_ACCESS_TOKEN="$("$PYTHON" "$REPO_ROOT/solution/scripts/get_dataverse_token.py" --auth "$USER_AUTH" --url "$DATAVERSE_URL" | tail -1)"
fi
echo "Token acquired."

if [[ -z "${APP_ID:-}" ]]; then
  echo ""
  echo "Discovering Code App id..."
  # discover_code_app must print only the GUID on stdout (logs go to stderr).
  APP_ID="$("$PYTHON" "$REPO_ROOT/solution/scripts/discover_code_app.py" --auth "$USER_AUTH" --url "$DATAVERSE_URL" | tail -1 | tr -d '\r')"
  echo "Discovered APP_ID: $APP_ID"
fi
export APP_ID

if [[ "${SKIP_BACKFILL:-}" != "1" ]]; then
  echo ""
  echo "-- taxonomy backfill dry-run --"
  "$PYTHON" "$REPO_ROOT/solution/scripts/backfill_taxonomy.py" --dry-run --auth "$USER_AUTH"

  echo ""
  echo "-- taxonomy backfill apply --"
  "$PYTHON" "$REPO_ROOT/solution/scripts/backfill_taxonomy.py" --auth "$USER_AUTH"
else
  echo ""
  echo "Skipping backfill (SKIP_BACKFILL=1)."
fi

export APP_ID
export ENVIRONMENT_ID="$ENV_ID"

echo "-- refresh notification data source schema (required for runtime OData) --"
cd "$REPO_ROOT/apps/code-app"
npx power-apps refresh-data-source --data-source-name enmax_autocadinappnotifications --non-interactive

echo ""
echo "-- build + publish Code App (npx power-apps push) --"
"$PYTHON" "$REPO_ROOT/solution/scripts/write_power_config.py"
npm run build
# pac code push fails on macOS (FileNotFoundException: PowerApps CLI script).
# Use the npm CLI — opens browser for user auth when SP_* env vars are unset.
npx power-apps push

echo ""
echo "Play URL:"
echo "  https://apps.powerapps.com/play/e/$ENV_ID/app/$APP_ID"
echo "Done."
