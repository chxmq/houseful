import { assertU32 } from "./bytes";

/** ticket id -> minimum generation the door accepts. Tickets absent from the map accept any generation. */
export type RevocationMap = ReadonlyMap<number, number>;

export interface ChainGeneration {
  ticket: number | bigint;
  generation: number | bigint;
}

function toU32(name: string, value: number | bigint): number {
  const n = typeof value === "bigint" ? (value <= 0xffff_ffffn && value >= 0n ? Number(value) : -1) : value;
  assertU32(name, n);
  return n;
}

/** Builds the map from the current on-chain generation of each ticket. Duplicates keep the highest generation. */
export function buildRevocationMap(entries: Iterable<ChainGeneration>): Map<number, number> {
  const map = new Map<number, number>();
  for (const entry of entries) {
    const ticket = toU32("ticket", entry.ticket);
    const generation = toU32("generation", entry.generation);
    if (generation > (map.get(ticket) ?? -1)) map.set(ticket, generation);
  }
  return map;
}

export function mergeRevocationMaps(...maps: RevocationMap[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const map of maps) {
    for (const [ticket, generation] of map) {
      if (generation > (out.get(ticket) ?? -1)) out.set(ticket, generation);
    }
  }
  return out;
}
