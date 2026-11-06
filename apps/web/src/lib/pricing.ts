/** USDT has 6 decimals. Whole dollars become base units. */
export const USDT_DECIMALS = 6;
const UNITS_PER_USDT = 10n ** BigInt(USDT_DECIMALS);

/** Face value in USDT base units as a decimal string: priceUsd * 1e6. */
export function usdToUnits(priceUsd: number): string {
  if (!Number.isInteger(priceUsd) || priceUsd < 0) throw new Error(`Invalid USDT price: ${priceUsd}`);
  return (BigInt(priceUsd) * UNITS_PER_USDT).toString();
}
