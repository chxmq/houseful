import { privateKeyToAddress, generatePrivateKey } from "viem/accounts";
import { expect, test } from "../support/fixtures";

// atTime changes the clock of the shared chain and puts it back, so this runs on its own like the specs that use it.
test("atTime moves the chain clock for the callback and puts it back afterwards", async ({ chain }) => {
  const before = await chain.publicClient.getBlock();
  const target = before.timestamp + 6n * 3600n;

  await chain.atTime(target, async () => {
    const during = await chain.publicClient.getBlock();
    expect(during.timestamp).toBeGreaterThanOrEqual(target);
  });

  // The block is gone, and the next one is stamped close to where the chain was, not six hours on.
  // (A busy chain runs a little ahead of the wall clock, because a block is always a second after the last.)
  const after = await chain.publicClient.getBlock();
  expect(after.number).toBe(before.number);
  await chain.fund(privateKeyToAddress(generatePrivateKey()));
  const next = await chain.publicClient.getBlock();
  expect(next.timestamp - before.timestamp).toBeLessThan(600n);
});

test("atTime puts the chain back when the callback fails", async ({ chain }) => {
  const before = await chain.publicClient.getBlock();

  await expect(
    chain.atTime(before.timestamp + 3600n, async () => {
      throw new Error("the callback failed");
    }),
  ).rejects.toThrow("the callback failed");

  expect((await chain.publicClient.getBlock()).number).toBe(before.number);
});
