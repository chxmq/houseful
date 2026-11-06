/**
 * The seeded shows the specs lean on, in one place so a change to the seed data is a change to one file.
 * Chain ids follow the seed order: the Mumbai shows are listed on chain in the order they are seeded.
 */
export const SHOWS = {
  /** Plenty of seats and a Selfie Check bar, so specs can buy from it again and again. */
  open: {
    slug: "second-shelf-winter-flea-mehboob",
    title: "Second Shelf Winter Flea",
    chainEventId: 12,
    price: /₹\s?299\b/,
  },
  /** Sold out apart from one seat, and asks for Proof of Human. Read it, do not take its last seat. */
  flagship: {
    slug: "the-last-local-nsci-dome",
    title: "The Last Local",
    chainEventId: 1,
    price: /₹\s?1,?499\b/,
  },
} as const;
