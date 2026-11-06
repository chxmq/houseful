# Hosting

## Blocked without credentials

`vercel whoami` has no login on this machine. Deploy needs `vercel login` (or a token) and a Turso database.

## Ready to wire

1. Create a Turso DB, copy `libsql://…` into `DATABASE_URL` and the token into `DATABASE_AUTH_TOKEN`.
2. From `apps/web`: `pnpm exec drizzle-kit push --force` against that DB, then seed.
3. Set Vercel project root to `apps/web` (see `vercel.json`). Paste the same env vars as `.env.local` for 1301, plus `NEXT_PUBLIC_APP_URL`.
4. `vercel --prod` from `apps/web` after login.

Live Unichain Houseful: see `packages/contracts/deployments/1301.json`.
