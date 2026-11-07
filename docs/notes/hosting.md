# Hosting

## Your steps (once)

```sh
vercel login
# and, if needed:
curl -sSfL https://get.tur.so/install.sh | bash
source ~/.zshrc
turso auth login
```

Turso CLI is already installed at `~/.turso/turso` on this machine. Vercel CLI is present. Both still need login.

## Agent steps after login

1. `turso db create houseful` (or reuse) and mint a DB token.
2. Push schema + seed against that Turso URL from `apps/web`.
3. Link / create the Vercel project with root `apps/web`.
4. Set production env for Unichain 1301 and `0x8F9A0dfb0BC16526FB4df5d9774ea6D6e2aBa98e` (same values as local `.env.local`, plus `NEXT_PUBLIC_APP_URL`).
5. `vercel --prod` from `apps/web`, open the live URL on a phone, buy one ticket, report the URL.

Live Unichain Houseful: see `packages/contracts/deployments/1301.json` (`eventCount` was 19 at last check).
