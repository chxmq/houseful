import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import { createChain, type Chain } from "./chain";
import { FakeWallet, type FakeWalletOptions } from "./fake-wallet";
import { WorldBridge } from "./world-bridge";
import { WorldVerify } from "./world-verify";

export { expect };
export type { Chain, FakeWallet, WorldBridge, WorldVerify };

/** Another phone: its own browser context, so its own storage and its own built-in wallet. */
export type Device = {
  context: BrowserContext;
  page: Page;
  /** This phone's World App, which answers the World ID prompt. */
  world: WorldBridge;
  /** Put a fake external wallet on this device. */
  wallet: (options?: FakeWalletOptions) => Promise<FakeWallet>;
};

type TestFixtures = {
  /**
   * The World App of this test's browser. It is installed for every test, so no spec can reach the real
   * World bridge by accident. By default one new person approves every prompt.
   */
  world: WorldBridge;
  /** Control of what the app's server hears back from World's verify API. Rules are removed when the test ends. */
  worldVerify: WorldVerify;
  /** Puts a fake external wallet on window.ethereum in this test's browser. Call it with a key to pick which wallet. */
  wallet: (options?: FakeWalletOptions) => Promise<FakeWallet>;
  /** Opens another phone with the same viewport as this project. Give it the same `person` to play one human on two wallets. */
  device: (options?: { person?: string | bigint }) => Promise<Device>;
};

type WorkerFixtures = {
  /** Funding, contract reads and event waits against the local chain. */
  chain: Chain;
};

// The callback each fixture receives is called `provide`, not `use`, so the React hooks lint rule leaves it alone.
export const test = base.extend<TestFixtures, WorkerFixtures>({
  chain: [async ({}, provide) => provide(createChain()), { scope: "worker" }],

  world: [
    async ({ context }, provide) => {
      const world = await WorldBridge.install(context);
      await provide(world);
      world.assertClean();
    },
    { auto: true },
  ],

  worldVerify: async ({}, provide) => {
    const verify = new WorldVerify();
    try {
      await provide(verify);
    } finally {
      await verify.release();
    }
  },

  wallet: async ({ context }, provide) => {
    await provide((options) => FakeWallet.install(context, options));
  },

  device: async (
    { browser, baseURL, viewport, screen, userAgent, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId, reducedMotion },
    provide,
  ) => {
    const opened: { context: BrowserContext; world: WorldBridge }[] = [];
    try {
      await provide(async (options = {}) => {
        const context = await browser.newContext({
          baseURL,
          viewport,
          screen,
          userAgent,
          deviceScaleFactor,
          isMobile,
          hasTouch,
          locale,
          timezoneId,
          reducedMotion,
        });
        const world = await WorldBridge.install(context, { person: options.person });
        opened.push({ context, world });
        const page = await context.newPage();
        return { context, page, world, wallet: (walletOptions) => FakeWallet.install(context, walletOptions) };
      });
      for (const { world } of opened) world.assertClean();
    } finally {
      await Promise.all(opened.map(({ context }) => context.close()));
    }
  },
});
