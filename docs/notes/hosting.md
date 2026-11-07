# Hosting

## Live

- Production alias: https://houseful-chxmqs-projects.vercel.app
- Latest ready deploy: https://houseful-fqig2wh6a-chxmqs-projects.vercel.app
- Turso DB: `houseful` (`libsql://houseful-chxmq.aws-ap-northeast-1.turso.io`), catalog seeded
- Unichain 1301 Houseful: `0x8F9A0dfb0BC16526FB4df5d9774ea6D6e2aBa98e`

## Open access (required for phone demo)

Vercel Authentication is still on for this team project, so anonymous phone hits get an SSO redirect.

In the Vercel dashboard: Project → Settings → Deployment Protection → turn **Vercel Authentication** off for Production (or set Standard Protection to Preview only).

Optional automation bypass secret already set as `VERCEL_AUTOMATION_BYPASS_SECRET`. After the dashboard toggle matches, you can also open:

`https://houseful-chxmqs-projects.vercel.app/?x-vercel-protection-bypass=houseful-booth-bypass-2026&x-vercel-set-bypass-cookie=true`

## Redeploy

From `apps/web` after login:

```sh
vercel --prod --yes
```

Install uses `scripts/vercel-install.mjs` and the vendored `apps/web/vendor/{contracts,pass}` packages so the upload does not need the monorepo root.
