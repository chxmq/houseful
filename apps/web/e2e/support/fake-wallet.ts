import type { BrowserContext } from "@playwright/test";
import { createWalletClient, defineChain, http, isAddress, toHex, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { CHAIN_ID, URLS } from "../stack/config";

/**
 * A browser wallet for tests: an EIP-1193 provider on window.ethereum, also announced through EIP-6963.
 *
 * The page side is a thin shim. Every request goes to this class in the test process, which signs
 * personal_sign, eth_signTypedData_v4 and transactions with a throwaway private key, and sends every other
 * call (reads, gas, receipts) to the local Hardhat node. The key never enters the page. Pass a key to
 * get a particular wallet, or leave it out for a fresh one, and give another browser context a second key to
 * play a second external wallet.
 *
 * Like MetaMask, it answers eth_accounts with nothing until the page has asked for eth_requestAccounts,
 * and it refuses to sign before that.
 */

const BINDING = "__e2eWalletRequest";
const EMIT = "__e2eWalletEmit";
const ICON =
  "data:image/svg+xml;base64," +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="6" fill="#14110f"/><rect x="8" y="10" width="16" height="12" rx="2" fill="#f1ece2"/></svg>',
  ).toString("base64");

type Reply = { ok: true; result: unknown } | { ok: false; error: { code: number; message: string; data?: unknown } };

/** The calls where a real wallet asks the user first, and so the ones a test can have turned down. */
const PROMPTS = new Set([
  "eth_requestAccounts",
  "wallet_requestPermissions",
  "wallet_switchEthereumChain",
  "wallet_addEthereumChain",
  "personal_sign",
  "eth_signTypedData_v4",
  "eth_sendTransaction",
]);

class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
  }
}

/** Runs inside every page of the context, before the app's own scripts. It must not use anything from this file. */
function installProvider(args: { binding: string; emit: string; name: string; rdns: string; icon: string; chainId: string }) {
  type Listener = (payload: unknown) => void;
  interface Provider {
    isMetaMask: boolean;
    isHousefulTestWallet: boolean;
    readonly chainId: string;
    readonly selectedAddress: string | null;
    isConnected(): boolean;
    request(payload: { method: string; params?: unknown }): Promise<unknown>;
    enable(): Promise<unknown>;
    on(event: string, listener: Listener): Provider;
    addListener(event: string, listener: Listener): Provider;
    once(event: string, listener: Listener): Provider;
    off(event: string, listener: Listener): Provider;
    removeListener(event: string, listener: Listener): Provider;
    removeAllListeners(event?: string): Provider;
  }

  const win = window as unknown as Record<string, unknown>;
  const call = win[args.binding] as (method: string, params: unknown) => Promise<Reply>;
  const listeners = new Map<string, Set<Listener>>();
  const state = { chainId: args.chainId, accounts: [] as string[], announcedConnect: false };

  const emit = (event: string, payload: unknown) => {
    if (event === "accountsChanged") state.accounts = payload as string[];
    if (event === "chainChanged") state.chainId = payload as string;
    for (const listener of [...(listeners.get(event) ?? [])]) {
      try {
        listener(payload);
      } catch {
        // A listener's bug is the page's business.
      }
    }
  };

  const provider: Provider = {
    isMetaMask: false,
    isHousefulTestWallet: true,
    get chainId() {
      return state.chainId;
    },
    get selectedAddress() {
      return state.accounts[0] ?? null;
    },
    isConnected: () => true,
    async request(payload) {
      const reply = await call(payload.method, payload.params ?? []);
      if (!reply.ok) throw Object.assign(new Error(reply.error.message), { code: reply.error.code, data: reply.error.data });
      if (payload.method === "eth_requestAccounts" && Array.isArray(reply.result)) {
        const accounts = reply.result as string[];
        if (!state.announcedConnect) {
          state.announcedConnect = true;
          emit("connect", { chainId: state.chainId });
        }
        if (accounts.join() !== state.accounts.join()) emit("accountsChanged", accounts);
      }
      return reply.result;
    },
    enable: () => provider.request({ method: "eth_requestAccounts" }),
    on(event, listener) {
      const set = listeners.get(event) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(event, set);
      return provider;
    },
    addListener: (event, listener) => provider.on(event, listener),
    once(event, listener) {
      const wrapper: Listener = (payload) => {
        provider.removeListener(event, wrapper);
        listener(payload);
      };
      return provider.on(event, wrapper);
    },
    off(event, listener) {
      listeners.get(event)?.delete(listener);
      return provider;
    },
    removeListener: (event, listener) => provider.off(event, listener),
    removeAllListeners(event) {
      if (event) listeners.delete(event);
      else listeners.clear();
      return provider;
    },
  };

  Object.defineProperty(window, "ethereum", { value: provider, configurable: true, writable: true });
  win[args.emit] = emit;

  const info = {
    uuid: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `e2e-${Math.random().toString(16).slice(2)}`,
    name: args.name,
    icon: args.icon,
    rdns: args.rdns,
  };
  const announce = () =>
    window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
}

export type WalletRequest = { method: string; params: unknown; forwarded: boolean };

export type FakeWalletOptions = {
  /** Which wallet this is. A new throwaway key is made when it is left out. */
  privateKey?: Hex;
  rpcUrl?: string;
  chainId?: number;
  /** The name a wallet picker would show. */
  name?: string;
};

export class FakeWallet {
  /** Every request the page made, in order. `forwarded` ones went straight to the node. */
  readonly requests: WalletRequest[] = [];

  private account: PrivateKeyAccount;
  private key: Hex;
  private authorized = false;
  private readonly rejections: (string | null)[] = [];
  private rpcId = 0;

  private constructor(
    private readonly context: BrowserContext,
    privateKey: Hex,
    private readonly rpcUrl: string,
    private readonly chainId: number,
  ) {
    this.key = privateKey;
    this.account = privateKeyToAccount(privateKey);
  }

  /** Puts window.ethereum into every page of this browser context, existing and future. */
  static async install(context: BrowserContext, options: FakeWalletOptions = {}): Promise<FakeWallet> {
    const chainId = options.chainId ?? CHAIN_ID;
    const wallet = new FakeWallet(context, options.privateKey ?? generatePrivateKey(), options.rpcUrl ?? URLS.rpc, chainId);
    await context.exposeFunction(BINDING, (method: string, params: unknown) => wallet.dispatch(method, params));
    await context.addInitScript(installProvider, {
      binding: BINDING,
      emit: EMIT,
      name: options.name ?? "Test wallet",
      rdns: "dev.houseful.e2e",
      icon: ICON,
      chainId: toHex(chainId),
    });
    return wallet;
  }

  get address(): Address {
    return this.account.address;
  }

  get privateKey(): Hex {
    return this.key;
  }

  /**
   * The user turns down the next request that asks for approval (connecting, switching chain, signing,
   * sending), or the next `method` request. The page sees error code 4001.
   */
  rejectNext(method?: string): this {
    this.rejections.push(method ?? null);
    return this;
  }

  /** Switch the wallet to another account, as a user does in the extension. Pages hear accountsChanged. */
  async switchTo(privateKey: Hex): Promise<void> {
    this.key = privateKey;
    this.account = privateKeyToAccount(privateKey);
    await this.emit("accountsChanged", this.authorized ? [this.address] : []);
  }

  /** The user disconnects the site. Pages hear accountsChanged with no accounts. */
  async disconnect(): Promise<void> {
    this.authorized = false;
    await this.emit("accountsChanged", []);
  }

  private async emit(event: string, payload: unknown) {
    await Promise.all(
      this.context.pages().map((page) =>
        page
          .evaluate(
            ([name, event_, payload_]) => {
              const emit = (window as unknown as Record<string, unknown>)[name] as ((e: string, p: unknown) => void) | undefined;
              emit?.(event_ as string, payload_);
            },
            [EMIT, event, payload] as const,
          )
          .catch(() => {}),
      ),
    );
  }

  private async dispatch(method: string, params: unknown): Promise<Reply> {
    const list = Array.isArray(params) ? params : [];
    this.requests.push({ method, params, forwarded: !this.handles(method) });
    try {
      const rejected = this.rejections.findIndex((wanted) => (wanted === null ? PROMPTS.has(method) : wanted === method));
      if (rejected !== -1) {
        this.rejections.splice(rejected, 1);
        throw new RpcError(4001, "User rejected the request.");
      }
      return { ok: true, result: await this.run(method, list) };
    } catch (error) {
      if (error instanceof RpcError) return { ok: false, error: { code: error.code, message: error.message, data: error.data } };
      return { ok: false, error: { code: -32603, message: error instanceof Error ? error.message : String(error) } };
    }
  }

  private handles(method: string): boolean {
    return [
      "eth_requestAccounts",
      "eth_accounts",
      "eth_chainId",
      "net_version",
      "wallet_switchEthereumChain",
      "wallet_addEthereumChain",
      "wallet_requestPermissions",
      "wallet_getPermissions",
      "wallet_revokePermissions",
      "wallet_watchAsset",
      "personal_sign",
      "eth_sign",
      "eth_signTypedData",
      "eth_signTypedData_v3",
      "eth_signTypedData_v4",
      "eth_sendTransaction",
    ].includes(method);
  }

  private requireAuthorized() {
    if (!this.authorized) throw new RpcError(4100, "The requested account has not been authorized by the user.");
  }

  private requireMine(address: unknown) {
    if (typeof address !== "string" || address.toLowerCase() !== this.address.toLowerCase()) {
      throw new RpcError(4100, "The requested account has not been authorized by the user.");
    }
  }

  private async run(method: string, params: unknown[]): Promise<unknown> {
    switch (method) {
      case "eth_requestAccounts":
        this.authorized = true;
        return [this.address];
      case "eth_accounts":
        return this.authorized ? [this.address] : [];
      case "eth_chainId":
        return toHex(this.chainId);
      case "net_version":
        return String(this.chainId);
      case "wallet_switchEthereumChain": {
        const wanted = (params[0] as { chainId?: string } | undefined)?.chainId;
        if (wanted !== undefined && Number(wanted) === this.chainId) return null;
        throw new RpcError(4902, `Unrecognized chain ID "${String(wanted)}". Try adding the chain first.`);
      }
      case "wallet_addEthereumChain":
        return null;
      case "wallet_watchAsset":
        return true;
      case "wallet_requestPermissions":
        this.authorized = true;
        return [{ parentCapability: "eth_accounts" }];
      case "wallet_getPermissions":
        return this.authorized ? [{ parentCapability: "eth_accounts" }] : [];
      case "wallet_revokePermissions":
        this.authorized = false;
        return null;
      case "personal_sign": {
        this.requireAuthorized();
        // The standard order is [message, address]. Some older libraries send [address, message].
        const [first, second] = params;
        const [message, signer] = typeof first === "string" && isAddress(first) && !isAddress(String(second)) ? [second, first] : [first, second];
        this.requireMine(signer);
        const text = String(message);
        return this.account.signMessage({ message: /^0x[0-9a-fA-F]*$/.test(text) ? { raw: text as Hex } : text });
      }
      case "eth_signTypedData_v4": {
        this.requireAuthorized();
        this.requireMine(params[0]);
        const typed = (typeof params[1] === "string" ? JSON.parse(params[1]) : params[1]) as {
          domain: Record<string, unknown>;
          types: Record<string, { name: string; type: string }[]>;
          primaryType: string;
          message: Record<string, unknown>;
        };
        // The domain's own type is implied by the domain, and viem works it out itself.
        const types = Object.fromEntries(Object.entries(typed.types).filter(([name]) => name !== "EIP712Domain"));
        return this.account.signTypedData({
          domain: typed.domain,
          types,
          primaryType: typed.primaryType,
          message: typed.message,
        } as never);
      }
      case "eth_sendTransaction": {
        this.requireAuthorized();
        const tx = (params[0] ?? {}) as Record<string, string | undefined>;
        if (tx.from) this.requireMine(tx.from);
        const client = createWalletClient({
          account: this.account,
          chain: defineChain({
            id: this.chainId,
            name: "Local test chain",
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: { default: { http: [this.rpcUrl] } },
          }),
          transport: http(this.rpcUrl),
        });
        return client.sendTransaction({
          to: tx.to as Address | undefined,
          data: tx.data as Hex | undefined,
          value: tx.value ? BigInt(tx.value) : undefined,
          gas: tx.gas ? BigInt(tx.gas) : undefined,
        });
      }
      case "eth_sign":
      case "eth_signTypedData":
      case "eth_signTypedData_v3":
        throw new RpcError(-32601, `${method} is not supported by the test wallet. Use personal_sign or eth_signTypedData_v4.`);
      default:
        return this.forward(method, params);
    }
  }

  private async forward(method: string, params: unknown[]): Promise<unknown> {
    const res = await fetch(this.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++this.rpcId, method, params }),
    });
    const body = (await res.json()) as { result?: unknown; error?: { code: number; message: string; data?: unknown } };
    if (body.error) throw new RpcError(body.error.code, body.error.message, body.error.data);
    return body.result;
  }
}
