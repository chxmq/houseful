import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { LOG_DIR } from "./config";

/**
 * Small helpers for running the stack's processes. Each one gets its own process group, so stopping it
 * also stops anything it started, and its output goes to a file under .e2e/logs instead of the terminal.
 */

export type Managed = {
  name: string;
  child: ChildProcess;
  logFile: string;
  /** Resolves with the exit code once the process is gone. */
  exited: Promise<number | null>;
};

const running = new Set<Managed>();
let hooked = false;

function killGroup(managed: Managed, signal: NodeJS.Signals) {
  const pid = managed.child.pid;
  if (!pid) return;
  try {
    process.kill(-pid, signal);
  } catch {
    // Already gone.
  }
}

/** Last resort when the runner exits without a clean teardown. */
function hookExit() {
  if (hooked) return;
  hooked = true;
  process.on("exit", () => {
    for (const managed of running) killGroup(managed, "SIGKILL");
  });
}

export function binPath(packageDir: string, name: string): string {
  const file = path.join(packageDir, "node_modules", ".bin", name);
  if (!existsSync(file)) throw new Error(`${file} is missing. Run pnpm install first.`);
  return file;
}

export function tail(file: string, lines = 40): string {
  try {
    return readFileSync(file, "utf8").trimEnd().split("\n").slice(-lines).join("\n");
  } catch {
    return "(no log)";
  }
}

type SpawnOptions = {
  name: string;
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
};

export function spawnManaged(options: SpawnOptions): Managed {
  hookExit();
  mkdirSync(LOG_DIR, { recursive: true });
  const logFile = path.join(LOG_DIR, `${options.name}.log`);
  const fd = openSync(logFile, "w");
  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
    env: options.env,
    detached: true,
    stdio: ["ignore", fd, fd],
  });
  closeSync(fd);

  const managed = { name: options.name, child, logFile } as Managed;
  managed.exited = new Promise<number | null>((resolve) => {
    child.once("error", () => resolve(null));
    child.once("exit", (code) => {
      running.delete(managed);
      resolve(code);
    });
  });
  running.add(managed);
  return managed;
}

/** Runs a command to the end and throws with the tail of its log when it fails. */
export async function runToCompletion(options: SpawnOptions): Promise<void> {
  const managed = spawnManaged(options);
  const code = await managed.exited;
  if (code !== 0) {
    throw new Error(`${options.name} failed with exit code ${code}. Last lines of ${managed.logFile}:\n${tail(managed.logFile)}`);
  }
}

export async function stopManaged(managed: Managed, graceMs = 4000): Promise<void> {
  if (managed.child.exitCode !== null || managed.child.signalCode !== null) return;
  killGroup(managed, "SIGTERM");
  const timer = setTimeout(() => killGroup(managed, "SIGKILL"), graceMs);
  await managed.exited;
  clearTimeout(timer);
}

type WaitOptions = {
  what: string;
  timeoutMs: number;
  intervalMs?: number;
  /** When this process exits while we wait, fail at once instead of running out the clock. */
  watch?: Managed;
};

export async function waitUntil(check: () => Promise<boolean>, options: WaitOptions): Promise<void> {
  const end = Date.now() + options.timeoutMs;
  while (Date.now() < end) {
    if (options.watch && (options.watch.child.exitCode !== null || options.watch.child.signalCode !== null)) {
      throw new Error(`${options.watch.name} exited while waiting for ${options.what}. Last lines of ${options.watch.logFile}:\n${tail(options.watch.logFile)}`);
    }
    if (await check().catch(() => false)) return;
    await new Promise((resolve) => setTimeout(resolve, options.intervalMs ?? 150));
  }
  const log = options.watch ? `\nLast lines of ${options.watch.logFile}:\n${tail(options.watch.logFile)}` : "";
  throw new Error(`Timed out after ${options.timeoutMs / 1000}s waiting for ${options.what}.${log}`);
}

export function portOpen(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (open: boolean) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(800, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

export async function rpcChainId(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      signal: AbortSignal.timeout(2000),
    });
    const body = (await res.json()) as { result?: string };
    return body.result ? Number.parseInt(body.result, 16) : null;
  } catch {
    return null;
  }
}

export async function httpStatus(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5000) });
    return res.status;
  } catch {
    return null;
  }
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Kills a process group left behind by a runner that died, when the process is still what we started. */
export function killLeftover(pid: number, expectedCommand: RegExp): boolean {
  if (!isAlive(pid)) return false;
  try {
    const command = execFileSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" });
    if (!expectedCommand.test(command)) return false;
    process.kill(-pid, "SIGKILL");
    return true;
  } catch {
    return false;
  }
}
