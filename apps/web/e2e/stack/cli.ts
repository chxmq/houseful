import { PORTS } from "./config";
import { startStack } from "./up";

/**
 * Starts the disposable stack and keeps it up until Ctrl+C, so specs can be run against it again and
 * again without paying for the build each time:
 *
 *   pnpm --filter web e2e:stack                         (one terminal)
 *   pnpm --filter web e2e e2e/smoke/city.spec.ts        (another, as often as you like)
 *
 * The runner notices the stack on its ports and reuses it. Restart the stack to pick up changes to the app,
 * and to get fresh seed data: events and wallets keep what earlier runs did to them.
 */
async function main() {
  const stack = await startStack({ reuseExistingServer: false });

  console.log("");
  console.log(`[e2e] Stack is up. Web ${stack.urls.web}, chain ${stack.urls.rpc}, World stub ${stack.urls.world}.`);
  console.log(`[e2e] In another terminal: pnpm --filter web e2e <spec file> [--project=phone]`);
  console.log(`[e2e] Logs are in apps/web/.e2e/logs. Press Ctrl+C to stop (ports ${PORTS.chain}, ${PORTS.world}, ${PORTS.web}).`);

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    console.log("\n[e2e] Stopping the stack.");
    await stack.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await new Promise(() => {});
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
