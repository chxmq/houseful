import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  BUILD_DIR,
  CHAIN_ID,
  CONTRACTS_DIR,
  HOST,
  LOG_DIR,
  PORTS,
  STATE_DIR,
  URLS,
  WEB_DIR,
  readDeployment,
} from "./config";
import { appEnv, chainEnv } from "./env";
import {
  binPath,
  httpStatus,
  isAlive,
  killLeftover,
  portOpen,
  rpcChainId,
  runToCompletion,
  spawnManaged,
  stopManaged,
  tail,
  waitUntil,
  type Managed,
} from "./process";
import { startWorldVerifyStub, type WorldVerifyStub } from "./world-verify-stub";

export type Stack = {
  /** True when a stack that was already running is being used, so stop() leaves it alone. */
  reused: boolean;
  urls: typeof URLS;
  stop(): Promise<void>;
};

type StartOptions = {
  /** Use a complete stack that is already listening on the harness ports, instead of failing on the busy ports. */
  reuseExistingServer: boolean;
  say?: (message: string) => void;
};

const PID_FILE = path.join(STATE_DIR, "stack.json");

type PidFile = { owner: number; tmp: string; children: { name: string; pid: number }[] };

/** After a crash the stack's children can outlive the runner that started them. Remove them, but never a stack whose owner is alive. */
function removeLeftovers(say: (message: string) => void) {
  if (!existsSync(PID_FILE)) return;
  try {
    const left = JSON.parse(readFileSync(PID_FILE, "utf8")) as PidFile;
    if (isAlive(left.owner)) return;
    for (const child of left.children) {
      if (killLeftover(child.pid, /hardhat|next/i)) say(`stopped ${child.name} left over from a crashed run (pid ${child.pid})`);
    }
    if (path.basename(left.tmp).startsWith("houseful-e2e-")) rmSync(left.tmp, { recursive: true, force: true });
    rmSync(PID_FILE, { force: true });
  } catch {
    rmSync(PID_FILE, { force: true });
  }
}

async function probe() {
  const [chainId, world, web] = await Promise.all([
    rpcChainId(URLS.rpc),
    httpStatus(`${URLS.world}/__e2e/health`),
    portOpen(PORTS.web, HOST),
  ]);
  return { chain: chainId === CHAIN_ID, world: world === 200, web };
}

/** next build fetches Google Fonts. A dropped connection there is not our failure, so try again. */
async function buildApp(env: NodeJS.ProcessEnv, say: (message: string) => void) {
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const build = spawnManaged({
      name: attempt === 1 ? "build" : `build-retry-${attempt - 1}`,
      command: binPath(WEB_DIR, "next"),
      args: ["build"],
      cwd: WEB_DIR,
      env: { ...env, NODE_ENV: "production" },
    });
    const code = await build.exited;
    if (code === 0) return;

    const log = tail(build.logFile, 400);
    const fontTrouble = /fonts\.googleapis\.com|from Google Fonts/i.test(log);
    const lockTrouble = /another next build|lock/i.test(log) && /already running/i.test(log);
    if (attempt < attempts && (fontTrouble || lockTrouble)) {
      say(`next build failed on ${fontTrouble ? "a font download" : "a build lock"}, trying again (${attempt}/${attempts - 1})`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      continue;
    }
    throw new Error(`next build failed with exit code ${code}. Last lines of ${build.logFile}:\n${tail(build.logFile)}`);
  }
}

export async function startStack(options: StartOptions): Promise<Stack> {
  const started = Date.now();
  const say = (message: string) =>
    (options.say ?? console.log)(`[e2e ${((Date.now() - started) / 1000).toFixed(1).padStart(5)}s] ${message}`);

  removeLeftovers(say);

  const alive = await probe();
  const names = (Object.keys(alive) as (keyof typeof alive)[]).filter((key) => alive[key]);
  if (names.length === 3) {
    if (!options.reuseExistingServer) {
      throw new Error(
        `A stack is already running on ports ${PORTS.chain}, ${PORTS.world} and ${PORTS.web}. Stop it, or set E2E_REUSE=1 to run against it.`,
      );
    }
    say(`reusing the stack already running on ports ${PORTS.chain}, ${PORTS.world} and ${PORTS.web}`);
    return { reused: true, urls: URLS, stop: async () => {} };
  }
  if (names.length > 0) {
    throw new Error(
      `Only part of a stack is running (${names.join(", ")} answered, the rest did not). ` +
        `Stop whatever holds ports ${PORTS.chain}, ${PORTS.world} or ${PORTS.web} and run again.`,
    );
  }

  mkdirSync(LOG_DIR, { recursive: true });
  const tmp = mkdtempSync(path.join(os.tmpdir(), "houseful-e2e-"));
  const children: Managed[] = [];
  let world: WorldVerifyStub | undefined;

  const writePidFile = () => {
    const file: PidFile = {
      owner: process.pid,
      tmp,
      children: children.flatMap((child) => (child.child.pid ? [{ name: child.name, pid: child.child.pid }] : [])),
    };
    writeFileSync(PID_FILE, JSON.stringify(file));
  };

  const stop = async () => {
    await Promise.allSettled(children.map((child) => stopManaged(child)));
    await world?.close();
    if (path.basename(tmp).startsWith("houseful-e2e-")) rmSync(tmp, { recursive: true, force: true });
    rmSync(PID_FILE, { force: true });
  };

  try {
    const chain = spawnManaged({
      name: "chain",
      command: binPath(CONTRACTS_DIR, "hardhat"),
      args: ["node", "--hostname", HOST, "--port", String(PORTS.chain)],
      cwd: CONTRACTS_DIR,
      env: chainEnv(),
    });
    children.push(chain);
    writePidFile();
    await waitUntil(async () => (await rpcChainId(URLS.rpc)) === CHAIN_ID, {
      what: `the Hardhat node on port ${PORTS.chain}`,
      timeoutMs: 90_000,
      watch: chain,
    });
    say(`chain is up on port ${PORTS.chain}`);

    await runToCompletion({
      name: "deploy",
      command: binPath(CONTRACTS_DIR, "hardhat"),
      args: ["run", "scripts/deploy.ts", "--network", "localhost"],
      cwd: CONTRACTS_DIR,
      env: chainEnv(),
    });
    const deployment = readDeployment();
    say(`contracts deployed, Houseful at ${deployment.address}`);

    const usdt = String(deployment.usdt ?? "");
    const weth = String(deployment.weth ?? "");
    const swapRouter = String(deployment.swapRouter ?? "");
    if (!usdt || !weth || !swapRouter) {
      throw new Error(`Local deploy at ${deployment.address} is missing usdt/weth/swapRouter in deployments/${CHAIN_ID}.json`);
    }
    const env = appEnv({
      databaseUrl: `file:${path.join(tmp, "houseful.db")}`,
      contractAddress: deployment.address,
      usdtAddress: usdt,
      wethAddress: weth,
      swapRouterAddress: swapRouter,
      worldRpSigningKey: randomBytes(32).toString("hex"),
      doorIssuerSecretKey: randomBytes(32).toString("hex"),
    });

    await runToCompletion({ name: "db-push", command: binPath(WEB_DIR, "drizzle-kit"), args: ["push", "--force"], cwd: WEB_DIR, env });
    await runToCompletion({ name: "db-seed", command: binPath(WEB_DIR, "tsx"), args: ["scripts/seed.ts"], cwd: WEB_DIR, env });
    await runToCompletion({ name: "chain-seed", command: binPath(WEB_DIR, "tsx"), args: ["scripts/seed-chain.ts"], cwd: WEB_DIR, env });
    say("database pushed and seeded, shows listed on chain");

    world = await startWorldVerifyStub({ port: PORTS.world, host: HOST, logFile: path.join(LOG_DIR, "world-verify.log") });
    say(`World verify stub is listening on port ${PORTS.world}`);

    await buildApp(env, say);
    say(`web app built into ${path.relative(WEB_DIR, BUILD_DIR)}`);

    const web = spawnManaged({
      name: "web",
      command: binPath(WEB_DIR, "next"),
      args: ["start", "--hostname", HOST, "--port", String(PORTS.web)],
      cwd: WEB_DIR,
      env: { ...env, NODE_ENV: "production" },
    });
    children.push(web);
    writePidFile();
    await waitUntil(async () => (await httpStatus(`${URLS.web}/mumbai`)) === 200, {
      what: `the web app on port ${PORTS.web}`,
      timeoutMs: 60_000,
      watch: web,
    });
    say(`web app is up on ${URLS.web}`);

    return { reused: false, urls: URLS, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
