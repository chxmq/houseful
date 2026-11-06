// Fixed demo rate. The contracts seed must use the same formula so on-chain face values match the catalog.
export const DEMO_INR_PER_ETH = 300_000;

const WEI_PER_ETH = BigInt("1000000000000000000");

/** Face value in wei as a decimal string: floor(priceInr * 1e18 / 300000). */
export function inrToWei(priceInr: number): string {
  if (!Number.isInteger(priceInr) || priceInr < 0) throw new Error(`Invalid INR price: ${priceInr}`);
  return ((BigInt(priceInr) * WEI_PER_ETH) / BigInt(DEMO_INR_PER_ETH)).toString();
}
