import { readFileSync } from "node:fs";
import path from "node:path";

/** Ports for the disposable stack. Chosen to stay clear of dev servers (3000, 8545) and other local work. */
function port(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error(`${name} must be a valid port`);
  return value;
}

export const PORTS = {
  web: port("E2E_WEB_PORT", 3200),
  chain: port("E2E_CHAIN_PORT", 8547),
  world: port("E2E_WORLD_PORT", 3299),
} as const;
export const HOST = "127.0.0.1";

export const URLS = {
  web: `http://${HOST}:${PORTS.web}`,
  rpc: `http://${HOST}:${PORTS.chain}`,
  world: `http://${HOST}:${PORTS.world}`,
} as const;

export const CHAIN_ID = 31337;

/** What the app is told about World. The verify endpoint and the browser bridge are both stubbed, so these are labels. */
export const WORLD = { appId: "app_e2e", rpId: "rp_e2e", environment: "staging" } as const;

/**
 * Hardhat's published development keys. They are public by design and only ever sign on the throwaway
 * local chain. Account 0 deploys, seeds, funds wallets and backs the app's faucet. Account 1 is the
 * verifier the local deploy trusts, so the app signs its attestations with it.
 */
export const HARDHAT_KEYS = {
  account0: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  account1: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
} as const;

export const WEB_DIR = path.resolve(__dirname, "../..");
export const REPO_DIR = path.resolve(WEB_DIR, "../..");
export const CONTRACTS_DIR = path.join(REPO_DIR, "packages/contracts");

/** Runtime state of the stack: its production build and its logs. Ignored by git, safe to delete when it is stopped. */
export const STATE_DIR = path.join(WEB_DIR, ".e2e");
export const LOG_DIR = path.join(STATE_DIR, "logs");
export const BUILD_DIR = path.join(STATE_DIR, "next");
/** Relative to apps/web, which is where Next resolves distDir from. */
export const BUILD_DIR_RELATIVE = path.relative(WEB_DIR, BUILD_DIR);

export type Deployment = {
  address: `0x${string}`;
  verifier: `0x${string}`;
  usdt: `0x${string}`;
  blockNumber: number;
  [field: string]: unknown;
};

/** What the local deploy wrote for the Hardhat chain. Read fresh each time, because the deploy rewrites it. */
export function readDeployment(): Deployment {
  const file = path.join(CONTRACTS_DIR, "deployments", `${CHAIN_ID}.json`);
  return JSON.parse(readFileSync(file, "utf8")) as Deployment;
}
