# End to end tests

Playwright runs the real app against a real local chain, on a desktop window (1280x800) and a phone window (375x812, touch, 3x). Only the outside world is faked, and it is faked at the network edge: World ID and the browser wallet. The app has no test switch in it.

## Run

```sh
pnpm --filter web e2e                 # both projects; starts its own stack and stops it again
pnpm --filter web e2e:phone           # phone window only
pnpm --filter web e2e e2e/smoke/city.spec.ts --project=desktop   # one spec
```

A cold run builds the app first, so it spends about 15 seconds before the first test.

### One spec against a stack that is already running

```sh
pnpm --filter web e2e:stack                       # terminal 1: starts the stack and keeps it up, Ctrl+C stops it
pnpm --filter web e2e e2e/chain/seat-pay.spec.ts       # terminal 2: finds the stack, skips setup, leaves it running
```

The runner follows Playwright's `reuseExistingServer` rule: it reuses a complete stack on the ports below, locally, and refuses to in CI. `E2E_REUSE=1` or `0` overrides that either way. A half-running stack (some ports busy, some not) is an error that names what answered, never a silent mix.

Restart the stack to pick up changes to the app. A reused stack keeps what earlier runs did to it, so specs pick fresh people and wallets and must not rely on untouched seed data.

## The stack

| Piece | Port | Notes |
|---|---|---|
| Web app | 3200 | `next build` into `apps/web/.e2e/next`, then `next start`. Never touches `.next`, so a dev server is left alone. |
| Hardhat chain | 8547 | Contracts deployed with the repo's own deploy script, then the shows listed with `seed-chain`. |
| World verify stub | 3299 | Stands in for World's verify API. Runs inside the process that started the stack. |
| Database | none | A new libsql file in the OS temp folder, pushed and seeded, deleted at the end. |

Every setting is handed to the child processes by `e2e/stack/env.ts`. Nothing is written to a tracked file, and the values win over any `.env.local`. The World RP signing key and the door signing key are made fresh for each run. When the app learns a new setting, add it in `env.ts`. Logs for each step are in `apps/web/.e2e/logs/`. Setup order is in `e2e/stack/up.ts`. If a run is killed hard, the next one removes what it left behind.

Use alternate ports when another checkout is running the default stack. Apply the same overrides to both the stack command and the test command:

```sh
E2E_WEB_PORT=3300 E2E_CHAIN_PORT=8550 E2E_WORLD_PORT=3399 pnpm --filter web e2e e2e/discovery
```

## The stubs

**World ID in the browser** (`support/world-bridge.ts`). IDKit talks to `bridge.worldcoin.org`: it posts an encrypted request, shows a link and a QR code that carry the request id and key, then polls for an answer. The stub intercepts those calls with Playwright routes and plays the phone, the way World's simulator does. It reads the key from the link on screen, decrypts the request to see which credential was asked for, and answers.

```ts
world.person                         // the nullifier of this phone's person
world.completeAs(nullifier)          // approve as this person (by default every prompt is approved as world.person)
world.failWith("credential_unavailable")   // World App answers with an error
world.cancel()                       // the person declines
world.hold()                         // nobody answers, so the prompt stays open: close it from the page
world.cancel({ once: true })         // any of these for the next prompt only
world.requests                       // what the app asked for, for assertions
```

It is installed for every test automatically (`world` is an auto fixture), so no spec can reach the real bridge. `device()` opens another phone with its own stub. Give it the same `person` to play one human on two wallets.

**World verify API on the server** (`stack/world-verify-stub.ts`, `support/world-verify.ts`). The app's server posts the proof to `{WORLD_VERIFY_URL}/{rp_id}`. The stub answers in World's shape: `success`, and a `results` array with a nullifier for each proof sent. Rules are keyed by nullifier, so tests cannot disturb each other, and the `worldVerify` fixture removes them when a test ends.

```ts
await worldVerify.reject(world.person, { code: "invalid_proof", detail: "..." })
await worldVerify.unreachable(world.person)
await worldVerify.calls(world.person)      // what the server asked World
```

Both stubs together follow the whole path: the browser proves, the server checks with World, the contract accepts the signed result. Neither is bypassed.

**Browser wallet** (`support/fake-wallet.ts`). `wallet()` puts an EIP-1193 provider on `window.ethereum` and announces it through EIP-6963. The page side is a thin shim. Requests go to the test process, which signs `personal_sign`, `eth_signTypedData_v4` and transactions with a throwaway private key and sends every other call to the Hardhat node. The key never enters the page. `wallet({ privateKey })` picks the wallet, and a second `device()` can hold a different one. Like MetaMask it shares no account until `eth_requestAccounts`, and `rejectNext()` plays a user turning a request down.

## Helpers

- `support/chain.ts`, the `chain` fixture. `fund(address)` sends test ETH from Hardhat account 0. `read.*` reads the Houseful contract with viem. `blockNumber()` and `waitForEvent()` wait for what the app does on chain. `untilShown(page, event, shows)` waits for the event, then for the page to show it, retrying and optionally reloading, and says which half failed.
- `support/fixtures.ts`. `world`, `worldVerify`, `wallet`, `device`, `chain`. Each test gets a fresh browser context, so a fresh built-in wallet.
- `support/page.ts`. `expectNoHorizontalScroll(page)` and the built-in wallet's address.
- `support/catalog.ts`. The seeded shows the specs use. Update it when the seed changes.
- `smoke/` checks the app. `harness/` checks the stubs and helpers.

## Settings and output

| Variable | Effect |
|---|---|
| `E2E_REUSE=1` or `0` | Use or refuse a stack that is already running. Default: reuse, unless `CI` is set. |
| `E2E_WEB_PORT`, `E2E_CHAIN_PORT`, `E2E_WORLD_PORT` | Ports of the stack (3200, 8547, 3299 by default). Set the same values for the stack and for the run to keep a second stack beside one that is already running, for instance from another clone of the repo. |
| `E2E_WORKERS=n` | Tests run one at a time by default, because they share one chain, one database and one funding account. Four workers passed four runs in a row and halve the time, but a spec that changes a shared show (a sold out show, a waitlist) must run alone. |
| `E2E_HTML=1` | Also write an HTML report to `playwright-report/`. Off by default. |

Failures keep a trace and a screenshot in `apps/web/test-results/`. Open a trace with `pnpm --filter web exec playwright show-trace <trace.zip>`. Motion is reduced, the clock zone is UTC and the locale is en-IN in every run, so a run looks the same on any machine. A spec about a city's own time zone sets its own with `test.use({ timezoneId })`.

`next build` fetches Google Fonts. A dropped connection there is retried twice before the run fails. The stack code stops processes by group and checks them with `ps`, so it runs on macOS and Linux.
