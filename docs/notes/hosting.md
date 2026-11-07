# Hosting

## Live

- Production alias: https://houseful-chxmqs-projects.vercel.app
- Turso DB: `houseful` (`libsql://houseful-chxmq.aws-ap-northeast-1.turso.io`), catalog seeded
- Unichain 1301 Houseful: `0x8F9A0dfb0BC16526FB4df5d9774ea6D6e2aBa98e`

## Open access

Vercel Authentication is off for Production, so the site opens without a sign-in. The hosted app asks World for its staging environment, so verification works with World's simulator and not with the real World App (see the README).

## Redeploy

From `apps/web` after login:

```sh
vercel --prod --yes
```

Install uses `scripts/vercel-install.mjs` and the vendored `apps/web/vendor/{contracts,pass}` packages so the upload does not need the monorepo root.
