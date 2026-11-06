import { appendFileSync } from "node:fs";
import http, { type IncomingMessage, type ServerResponse } from "node:http";

/**
 * A stand-in for World's verify API, which the app's server calls with POST {WORLD_VERIFY_URL}/{rp_id}.
 *
 * By default it says yes to every proof and echoes the nullifier it was sent, in the shape World uses:
 * `success`, plus a `results` array with one entry per submitted proof. A test can make it say no for one
 * person (keyed by nullifier, so parallel tests cannot disturb each other), or for everyone through a
 * default rule. Control calls live under /__e2e and are meant for the test process only.
 */

export type VerifyRule =
  /** Say yes. `nullifier` answers with a different value than the one sent, to test the integrity check. */
  | { kind: "ok"; nullifier?: string }
  /** Say no with World's error body. `null` leaves a field out, an empty body being what World sends for some failures. */
  | { kind: "reject"; status?: number; code?: string | null; detail?: string | null }
  /** Close the connection without answering, as if World were down. */
  | { kind: "unreachable" }
  /** Wait, then say yes. */
  | { kind: "slow"; ms: number };

export type VerifyCall = {
  id: number;
  at: number;
  rpId: string;
  action: string | null;
  identifier: string | null;
  /** Decimal string, so any spelling of the same nullifier matches. */
  nullifier: string | null;
  answered: VerifyRule["kind"];
};

/** One spelling for every way a nullifier is written: nil_ prefix, 0x hex or decimal all become decimal. */
export function nullifierKey(value: string | bigint): string {
  if (typeof value === "bigint") return value.toString();
  const text = value.trim();
  try {
    if (text.startsWith("nil_")) return BigInt(`0x${text.slice(4)}`).toString();
    return BigInt(text).toString();
  } catch {
    return text.toLowerCase();
  }
}

export type WorldVerifyStub = {
  port: number;
  calls: VerifyCall[];
  close(): Promise<void>;
};

type Options = {
  port: number;
  host?: string;
  /** A file to append one line per verify call to. */
  logFile?: string;
};

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function startWorldVerifyStub(options: Options): Promise<WorldVerifyStub> {
  const calls: VerifyCall[] = [];
  const rules = new Map<string, VerifyRule>();
  let defaultRule: VerifyRule | null = null;
  let nextId = 1;

  const log = (line: string) => {
    if (options.logFile) appendFileSync(options.logFile, `${new Date().toISOString()} ${line}\n`);
  };

  async function verify(req: IncomingMessage, res: ServerResponse, rpId: string) {
    const body = await readJson(req);
    const responses = Array.isArray(body.responses) ? (body.responses as Record<string, unknown>[]) : [];
    const first = responses[0];
    const sent = typeof first?.nullifier === "string" ? first.nullifier : null;
    const key = sent ? nullifierKey(sent) : null;
    const rule: VerifyRule = (key ? rules.get(key) : undefined) ?? defaultRule ?? { kind: "ok" };

    calls.push({
      id: nextId++,
      at: Date.now(),
      rpId,
      action: typeof body.action === "string" ? body.action : null,
      identifier: typeof first?.identifier === "string" ? first.identifier : null,
      nullifier: key,
      answered: rule.kind,
    });
    log(`verify ${rpId} nullifier=${key ?? "none"} answered=${rule.kind}`);

    if (rule.kind === "unreachable") {
      req.socket.destroy();
      return;
    }
    if (rule.kind === "reject") {
      const failure: Record<string, unknown> = { success: false };
      const code = rule.code === undefined ? "invalid_proof" : rule.code;
      const detail = rule.detail === undefined ? "The proof did not verify." : rule.detail;
      if (code !== null) failure.code = code;
      if (detail !== null) failure.detail = detail;
      send(res, rule.status ?? 400, rule.code === null && rule.detail === null ? {} : failure);
      return;
    }
    if (rule.kind === "slow") await pause(rule.ms);

    const echoed = rule.kind === "ok" && rule.nullifier ? rule.nullifier : sent;
    send(res, 200, {
      success: true,
      action: typeof body.action === "string" ? body.action : null,
      environment: typeof body.environment === "string" ? body.environment : null,
      nullifier: echoed,
      created_at: new Date().toISOString(),
      results: responses.map((item) => ({
        identifier: typeof item.identifier === "string" ? item.identifier : null,
        success: true,
        nullifier: rule.kind === "ok" && rule.nullifier ? rule.nullifier : (item.nullifier ?? null),
      })),
      message: "Verification successful",
    });
  }

  async function control(req: IncomingMessage, res: ServerResponse, url: URL) {
    const route = `${req.method} ${url.pathname}`;
    if (route === "GET /__e2e/health") return send(res, 200, { ok: true, service: "world-verify-stub" });
    if (route === "GET /__e2e/calls") {
      const wanted = url.searchParams.get("nullifier");
      const filter = wanted ? nullifierKey(wanted) : null;
      return send(res, 200, filter ? calls.filter((call) => call.nullifier === filter) : calls);
    }
    if (route === "PUT /__e2e/rules") {
      const body = await readJson(req);
      if (typeof body.nullifier !== "string" || typeof body.rule !== "object" || body.rule === null) {
        return send(res, 400, { error: "Send { nullifier, rule }." });
      }
      rules.set(nullifierKey(body.nullifier), body.rule as VerifyRule);
      return send(res, 200, { ok: true });
    }
    if (route === "DELETE /__e2e/rules") {
      const wanted = url.searchParams.get("nullifier");
      if (wanted) rules.delete(nullifierKey(wanted));
      else rules.clear();
      return send(res, 200, { ok: true });
    }
    if (route === "PUT /__e2e/default") {
      defaultRule = (await readJson(req)) as VerifyRule;
      return send(res, 200, { ok: true });
    }
    if (route === "DELETE /__e2e/default") {
      defaultRule = null;
      return send(res, 200, { ok: true });
    }
    if (route === "POST /__e2e/reset") {
      rules.clear();
      defaultRule = null;
      calls.length = 0;
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: `No control route for ${route}.` });
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://stub.local");
    const verifyRoute = req.method === "POST" ? /^\/(rp_[^/]+)$/.exec(url.pathname) : null;
    const handled = url.pathname.startsWith("/__e2e/")
      ? control(req, res, url)
      : verifyRoute
        ? verify(req, res, verifyRoute[1])
        : Promise.resolve(send(res, 404, { code: "not_found", detail: `No route for ${req.method} ${url.pathname}.` }));
    handled.catch((error: unknown) => {
      log(`error ${String(error)}`);
      if (!res.headersSent) send(res, 500, { code: "stub_error", detail: String(error) });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host ?? "127.0.0.1", resolve);
  });

  return {
    port: options.port,
    calls,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
