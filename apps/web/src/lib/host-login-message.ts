/** Shared with the host login client; keep in sync with server/auth/store hostLoginMessage. */
export function hostLoginMessage(input: {
  origin: string;
  address: string;
  challenge: string;
  issuedAt: string;
  expirationTime: string;
}): string {
  return [
    "Houseful host sign-in",
    `URI: ${input.origin}`,
    `Address: ${input.address.toLowerCase()}`,
    `Nonce: ${input.challenge}`,
    `Issued At: ${input.issuedAt}`,
    `Expiration Time: ${input.expirationTime}`,
  ].join("\n");
}
