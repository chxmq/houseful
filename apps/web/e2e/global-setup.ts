import { startStack } from "./stack/up";

/**
 * Brings up the disposable stack (chain, contracts, database, World stub, web app) before the first test
 * and tears it down after the last one. It runs once per `playwright test`, whatever the project.
 *
 * Reuse follows Playwright's webServer rule: `reuseExistingServer` is on locally and off in CI. A complete
 * stack on the harness ports (see `pnpm --filter web e2e:stack`) is used as it is. E2E_REUSE=1 or 0
 * overrides the default either way.
 */
export default async function globalSetup() {
  const override = process.env.E2E_REUSE;
  const reuseExistingServer = override === undefined ? !process.env.CI : override !== "0";

  const stack = await startStack({ reuseExistingServer });
  return async () => {
    await stack.stop();
  };
}
