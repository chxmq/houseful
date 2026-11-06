export type Assurance = "selfie" | "human";

export type AssuranceInput = {
  status: string;
  capacity: number;
  priceInr: number;
};

/**
 * The minimum credential that makes cheating cost more than it earns.
 *
 * A face-value, surrender-only ticket has no on-chain resale margin, so for most
 * shows a Selfie Check is enough to stop one person farming many wallets. The
 * private key can still be sold off-platform. Shows where demand already exceeds
 * supply attract organised buying, so they ask for World's strongest uniqueness
 * guarantee.
 */
export function assuranceFor(event: AssuranceInput): Assurance {
  if (event.status === "sold_out") return "human";
  if (event.capacity >= 5000 && event.priceInr >= 1500) return "human";
  return "selfie";
}

export const assuranceCopy: Record<Assurance, { label: string; why: string }> = {
  selfie: {
    label: "Selfie Check",
    why: "Enough to stop one person buying through many wallets. No document or Orb visit needed.",
  },
  human: {
    label: "Proof of Human",
    why: "Demand is higher than the seats, so this show asks for World's strongest one-person guarantee.",
  },
};

export function worldActionFor(eventId: string) {
  return `ticket:${eventId}`;
}
