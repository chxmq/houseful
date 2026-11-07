# @houseful/pass

Offline door passes for Houseful tickets. A ticket holder's phone shows a QR code that changes every 20 seconds. A venue scanner checks it with no network connection, using only the issuer public key, its own clock, and a revocation list it synced before doors opened.

The library runs in browsers and in Node. It uses `@noble/curves` (ed25519) and `@noble/hashes` (sha256) and has no other runtime dependencies.

## How it works

1. **Issue.** The platform reads the ticket's current owner and ownership generation from chain. It signs a `DoorCredential` that binds the event, the ticket id, the generation, the holder's device public key, and an expiry time. The generation goes up on chain every time a ticket is surrendered.
2. **Hold.** The holder's phone keeps the signed credential and a device secret key that never leaves the phone. Every 20 second window, the phone signs `(event, ticket, generation, window)` with that key and packs both signatures into a QR payload.
3. **Verify.** The scanner checks the issuer signature, the expiry, the revocation list, the window, and the holder signature, in that order. It then records the ticket as admitted so the same device will not let it in twice.

## Usage

```ts
import {
  issueCredential,
  generateHolderKey,
  buildDoorPayload,
  secondsUntilRotation,
  buildRevocationMap,
  Verifier,
} from "@houseful/pass";

// Phone, once per device. Store secretKey on the device only.
const holder = generateHolderKey();

// Server, after reading owner and generation from chain.
const signed = issueCredential(
  { v: 1, event: "mumbai-fest", ticket: 7, gen: 0, holderKey: holder.publicKey, exp: 1_800_086_400 },
  issuerSecretKey,
);

// Phone, rendered on a timer.
const now = Date.now() / 1000;
const qr = buildDoorPayload(signed, holder.secretKey, now);
const ring = secondsUntilRotation(now);

// Scanner, before doors open, while online.
const minGenerations = buildRevocationMap(chainRows); // [{ ticket, generation }], bigint is fine
const door = new Verifier({ issuerPublicKey, event: "mumbai-fest", minGenerations });

// Scanner, at the door, offline.
const result = door.check(scannedText, Date.now() / 1000);
if (result.ok) admit(result.ticket);
else showReason(result.reason);

// Scanners, when they reconnect to each other.
doorA.importState(doorB.exportState());
```

## Rejection reasons

| Reason | Meaning |
| --- | --- |
| `malformed` | Not a payload this library produced, or an unknown payload version. |
| `wrong-event` | A real payload for a different event. |
| `bad-issuer-signature` | The credential was not signed by the issuer, or a signed field was changed. |
| `expired` | The scanner clock is past the credential expiry. |
| `revoked` | The ticket was surrendered and this generation is older than the synced minimum. |
| `stale` | The payload was made more than one window away from the scanner clock. |
| `bad-holder-signature` | The rotating signature was not made by the device key in the credential. |
| `already-admitted` | This scanner already admitted this ticket. |

## Payload format

The payload is 185 bytes, encoded as 247 characters of unpadded base64url. The length is fixed and does not depend on the event id, because the event id is not sent. The payload carries an 8 byte tag of the event id, and the scanner rebuilds both signed messages from the event id it was configured with.

```
version(1) eventTag(8) ticket(4) gen(4) holderKey(32) exp(4) issuerSig(64) window(4) holderSig(64)
```

Integers are big-endian unsigned 32 bit. Signed messages are domain separated and length prefixed, so a credential signature can never be confused with a door signature. Signatures are checked with strict RFC 8032 rules. The base64url decoder is strict, so each payload has exactly one valid text form.

## Threat model

The scanner trusts the issuer public key, its own clock, and the revocation list it synced. It trusts nothing in the payload until the signatures check out.

What this stops:

- **Forged tickets.** Without the issuer secret key, nobody can make a credential the scanner accepts. Changing any signed field, such as the holder key, the generation, or the expiry, breaks the issuer signature.
- **Stolen or forwarded credentials.** A copy of the signed credential is not enough. Each payload also needs a fresh signature from the holder's device key, which stays on the phone.
- **Old screenshots.** A screenshot is tied to the 20 second window it was taken in. Once the scanner clock is more than one window past it, the scanner rejects it as `stale`. Editing the window number in a screenshot breaks the holder signature.
- **Surrendered tickets.** After a surrender, the new owner gets a credential with a higher generation. A scanner that synced the new generation rejects the old one as `revoked`.
- **Entering twice at the same door.** Each scanner remembers admitted ticket ids. Admission is tracked per ticket, not per generation, so a ticket cannot be used to get in, surrendered, and then used again by someone else at the same door.

## Known limits

These are real gaps. The tests demonstrate both of them on purpose.

**A screenshot can be replayed on another scanner within the rotation window.** A scanner only knows what it has seen itself. If someone sends a live screenshot to a friend at a different door, that door accepts it while the window is still valid. The scanner allows one window of clock skew either side, so a screenshot stays usable for roughly 20 to 40 seconds after it is taken. The same scanner always rejects the second scan. To reduce this risk, scanners should share state with `exportState` and `importState` whenever they can reach each other, and door staff should look at the holder's live screen rather than a static image.

**A scanner that has not synced admits a surrendered generation.** Revocation is only as fresh as the scanner's last sync. If a ticket is surrendered after the scanner synced, or the scanner never synced, the old holder's credential still passes. Scanners should call `buildRevocationMap` and `syncRevocations` as late as possible before doors open, and again whenever they are online. Scanners also pass minimum generations to each other through `importState`, so one up to date scanner can update the rest.

Two more points follow from the design:

- Clocks matter. A scanner clock that is wrong by more than about 20 seconds will reject good payloads as `stale`. A badly wrong clock also changes when `expired` applies.
- Admitted state lives in memory. If the scanner app reloads, it forgets who it admitted unless the app saves `exportState()` and restores it with `importState()`.

## Scripts

```
pnpm test        # vitest run
pnpm typecheck   # tsc --noEmit
```
