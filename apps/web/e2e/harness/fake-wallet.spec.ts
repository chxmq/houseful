import type { Page } from "@playwright/test";
import { isAddress, parseEther, toHex, verifyMessage, verifyTypedData, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";
import { expect, test } from "../support/fixtures";

/**
 * Checks of the fake injected wallet: it must behave like a browser wallet to any page that talks EIP-1193,
 * sign with its own key, and use the local node for everything else. The pages here are the app's own, but
 * any page would do, because the wallet is installed before the page's scripts run.
 */

type Outcome = { ok: true; result: unknown } | { ok: false; code?: number; message?: string };

function ask(page: Page, method: string, params: unknown[] = []): Promise<Outcome> {
  return page.evaluate(
    async ({ method, params }) => {
      const provider = (window as unknown as { ethereum: { request(args: { method: string; params: unknown[] }): Promise<unknown> } }).ethereum;
      try {
        return { ok: true as const, result: await provider.request({ method, params }) };
      } catch (error) {
        const failure = error as { code?: number; message?: string };
        return { ok: false as const, code: failure.code, message: failure.message };
      }
    },
    { method, params },
  );
}

async function result(page: Page, method: string, params: unknown[] = []): Promise<unknown> {
  const outcome = await ask(page, method, params);
  if (!outcome.ok) throw new Error(`${method} failed with ${outcome.code}: ${outcome.message}`);
  return outcome.result;
}

test("a page connects, and the wallet signs messages and typed data with its own key", async ({ page, wallet }) => {
  const external = await wallet();
  await page.goto("/how-it-works");

  // Nothing is shared until the page asks, and nothing is signed before then.
  expect(await result(page, "eth_accounts")).toEqual([]);
  const early = await ask(page, "personal_sign", [toHex("hello"), external.address]);
  expect(early).toMatchObject({ ok: false, code: 4100 });

  expect(await result(page, "eth_requestAccounts")).toEqual([external.address]);
  expect(await result(page, "eth_accounts")).toEqual([external.address]);
  expect(await result(page, "eth_chainId")).toBe("0x7a69");

  const message = "Link this wallet to my Houseful account";
  const signature = (await result(page, "personal_sign", [toHex(message), external.address])) as Hex;
  expect(await verifyMessage({ address: external.address, message, signature })).toBe(true);

  const typed = {
    domain: { name: "Houseful", version: "1", chainId: 31337, verifyingContract: "0x5FbDB2315678afecb367f032d93F642f64180aa3" },
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      Link: [
        { name: "wallet", type: "address" },
        { name: "account", type: "string" },
      ],
    },
    primaryType: "Link",
    message: { wallet: external.address, account: "acct_123" },
  } as const;
  const typedSignature = (await result(page, "eth_signTypedData_v4", [external.address, JSON.stringify(typed)])) as Hex;
  expect(
    await verifyTypedData({
      address: external.address,
      domain: typed.domain,
      types: { Link: typed.types.Link },
      primaryType: "Link",
      message: typed.message,
      signature: typedSignature,
    }),
  ).toBe(true);

  // A signature for somebody else's address is refused, as a real wallet does.
  const stranger = privateKeyToAddress(generatePrivateKey());
  expect(await ask(page, "personal_sign", [toHex(message), stranger])).toMatchObject({ ok: false, code: 4100 });
});

test("the wallet sends transactions and passes reads to the local node", async ({ page, wallet, chain }) => {
  const external = await wallet();
  await page.goto("/how-it-works");
  await result(page, "eth_requestAccounts");

  // Reads go to the node, so the page sees the same chain the test does.
  expect(await result(page, "eth_blockNumber")).toBe(toHex(await chain.blockNumber()));
  await chain.fund(external.address, "0.01");
  expect(BigInt((await result(page, "eth_getBalance", [external.address, "latest"])) as string)).toBe(await chain.balanceOf(external.address));

  // A transfer signed by the wallet's key lands on chain.
  const to: Address = privateKeyToAddress(generatePrivateKey());
  const hash = (await result(page, "eth_sendTransaction", [
    { from: external.address, to, value: toHex(parseEther("0.001")) },
  ])) as Hex;
  expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  const receipt = (await result(page, "eth_getTransactionReceipt", [hash])) as { status: string; from: string };
  expect(receipt.status).toBe("0x1");
  expect(receipt.from.toLowerCase()).toBe(external.address.toLowerCase());
  expect(await chain.balanceOf(to)).toBe(parseEther("0.001"));

  // Switching to a chain it is not on is refused the way wallets refuse it.
  expect(await ask(page, "wallet_switchEthereumChain", [{ chainId: "0x1" }])).toMatchObject({ ok: false, code: 4902 });
  expect(await result(page, "wallet_switchEthereumChain", [{ chainId: "0x7a69" }])).toBeNull();
});

test("the user can turn a request down, and the wallet announces itself", async ({ page, wallet }) => {
  const external = await wallet({ name: "Second wallet" });
  await page.goto("/how-it-works");

  external.rejectNext("eth_requestAccounts");
  expect(await ask(page, "eth_requestAccounts")).toMatchObject({ ok: false, code: 4001 });
  // Only that one request was turned down.
  expect(await result(page, "eth_requestAccounts")).toEqual([external.address]);

  const announced = await page.evaluate(
    () =>
      new Promise<{ name: string; rdns: string; icon: string }>((resolve) => {
        window.addEventListener("eip6963:announceProvider", (event) => resolve((event as CustomEvent).detail.info), { once: true });
        window.dispatchEvent(new Event("eip6963:requestProvider"));
      }),
  );
  expect(announced).toMatchObject({ name: "Second wallet", rdns: "dev.houseful.e2e" });
  expect(announced.icon).toMatch(/^data:image\/svg\+xml;base64,/);
  expect(external.requests.map((request) => request.method)).toContain("eth_requestAccounts");
});

test("two phones can hold two different external wallets", async ({ page, wallet, device }) => {
  const first = await wallet();
  const phone = await device();
  const second = await phone.wallet({ privateKey: generatePrivateKey() });
  expect(isAddress(second.address)).toBe(true);
  expect(second.address).not.toBe(first.address);

  await page.goto("/how-it-works");
  await phone.page.goto("/how-it-works");
  expect(await result(page, "eth_requestAccounts")).toEqual([first.address]);
  expect(await result(phone.page, "eth_requestAccounts")).toEqual([second.address]);

  // The same phone can also change account, and the page hears about it.
  type Heard = { ethereum: { on(event: string, listener: (accounts: string[]) => void): void }; heard: string[][] };
  await phone.page.evaluate(() => {
    const win = window as unknown as Heard;
    win.heard = [];
    win.ethereum.on("accountsChanged", (accounts) => win.heard.push(accounts));
  });
  const third = generatePrivateKey();
  await second.switchTo(third);
  await expect.poll(() => phone.page.evaluate(() => (window as unknown as Heard).heard)).toEqual([[privateKeyToAddress(third)]]);
});
