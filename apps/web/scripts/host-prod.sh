#!/usr/bin/env bash
# Run after: vercel login && turso auth login
set -euo pipefail
export PATH="$HOME/.turso:$PATH"
cd "$(dirname "$0")/.."

DB_NAME="${TURSO_DB_NAME:-houseful}"

echo "==> Turso database"
if ! turso db show "$DB_NAME" >/dev/null 2>&1; then
  turso db create "$DB_NAME"
fi
DB_URL="$(turso db show "$DB_NAME" --url)"
DB_TOKEN="$(turso db tokens create "$DB_NAME")"
echo "DATABASE_URL=$DB_URL"

echo "==> Schema + seed"
DATABASE_URL="$DB_URL" DATABASE_AUTH_TOKEN="$DB_TOKEN" pnpm exec drizzle-kit push --force
DATABASE_URL="$DB_URL" DATABASE_AUTH_TOKEN="$DB_TOKEN" pnpm db:seed

echo "==> Vercel production env"
printf '%s' "$DB_URL" | vercel env add DATABASE_URL production --force
printf '%s' "$DB_TOKEN" | vercel env add DATABASE_AUTH_TOKEN production --force

echo "==> Deploy"
URL="$(vercel --prod --yes 2>&1 | tee /tmp/houseful-vercel-deploy.log | awk '/https:\/\/.*\.vercel\.app/ {print $NF}' | tail -1)"
if [[ -n "$URL" ]]; then
  printf '%s' "$URL" | vercel env add NEXT_PUBLIC_APP_URL production --force || true
fi
echo "LIVE_URL=${URL:-see /tmp/houseful-vercel-deploy.log}"
