#!/bin/bash
#
# Runs once as a web session starts.
#
# Two jobs. Installing dependencies is the ordinary one — a fresh container
# clones the repo without node_modules, so without this every session opens
# with `expo-haptics` and `expo-image-picker` unresolvable, which is three
# typecheck errors and a failing suite that have nothing to do with the work.
#
# The second is to say out loud which database this session can reach. The
# scripts in `scripts/` refuse to write to an undeclared environment, and the
# session should know that before it plans around a write rather than when one
# is refused. Egress is probed rather than assumed: the credentials being
# present says nothing about whether the environment's network policy permits
# reaching Supabase at all, and those two failures need different answers.

set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

npm install --no-audit --no-fund

echo ""
echo "── Database ───────────────────────────────────────────────────────────"

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "No credentials in this environment."
  echo "Scripts in scripts/ can neither read nor write. Sample data still works"
  echo "(data/api.ts falls back to 8 products), so tests and the app are fine."
  echo "To fix: set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ENV as"
  echo "environment variables on the environment, not in a file."
  echo "───────────────────────────────────────────────────────────────────────"
  exit 0
fi

# The subdomain, which is what `connect()` prints and what identifies the
# project to a human. Never the key.
REF="$(printf '%s' "$SUPABASE_URL" | sed -E 's#^https?://([^.]+)\..*#\1#')"
ENV_NAME="${SUPABASE_ENV:-<unset>}"

echo "Project:     $REF"
echo "SUPABASE_ENV: $ENV_NAME"

# A 403 from the egress proxy and a working connection both come back fast;
# the timeout is only here so a hang cannot hold up the whole session.
if curl -sS -o /dev/null --max-time 8 "$SUPABASE_URL/rest/v1/" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" 2>/dev/null; then
  REACHABLE=yes
else
  REACHABLE=no
fi

if [ "$REACHABLE" = "no" ]; then
  echo ""
  echo "NOT REACHABLE — the environment's network policy is blocking supabase.co."
  echo "Credentials are present and probably fine; the connection never leaves the"
  echo "container. Nothing in scripts/ will work, whatever SUPABASE_ENV says."
  echo "To fix: allow *.supabase.co in the environment's network policy"
  echo "(claude.ai/code -> environment settings). It cannot be fixed from in here."
elif [ "$ENV_NAME" = "production" ]; then
  echo ""
  echo "REACHABLE — and this is PRODUCTION. Writes additionally need --prod."
  echo "Development work belongs on staging; check before running anything that"
  echo "writes."
elif [ "$ENV_NAME" = "staging" ]; then
  echo ""
  echo "REACHABLE — staging. Writes are allowed, no extra flag needed."
  echo "Run schema and data changes here first; production is promoted"
  echo "deliberately afterwards, never automatically."
else
  echo ""
  echo "REACHABLE, but SUPABASE_ENV is not set to staging or production."
  echo "Reads work. Every write will be refused until it is set."
fi

echo "───────────────────────────────────────────────────────────────────────"
