import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { Houseful } from "../typechain-types";
import { attest, chainHead, domainOf, FACE, HOUR, Purpose, type PurposeValue } from "./helpers";

const N = {
  alice: 1001n,
  bob: 1002n,
  carol: 1003n,
  dave: 1004n,
  erin: 1005n,
  frank: 1006n,
  attacker: 1666n,
};

async function deployFixture() {
  const [owner, verifier, host, alice, bob, carol, dave, erin, frank, mallory] = await ethers.getSigners();
  const c = (await ethers.deployContract("Houseful", [verifier.address])) as unknown as Houseful;
  const now = await time.latest();
  const params = {
    faceValue: FACE,
    capacity: 2n,
    saleStart: BigInt(now + 60),
    surrenderCutoff: BigInt(now + 10 * HOUR),
    endsAt: BigInt(now + 12 * HOUR),
    metadataURI: "ipfs://houseful/prateek-kuhad-nesco",
    metadataHash: ethers.id("prateek-kuhad-nesco"),
  };
  await c.connect(host).createEvent(params);
  const eventId = 1n;

  const signed = async (
    who: HardhatEthersSigner | { address: string },
    nullifier: bigint,
    purpose: PurposeValue,
    id: bigint = eventId,
  ) => attest(c, { signer: verifier, eventId: id, nullifier, wallet: who.address, purpose });

  const buyAs = async (s: HardhatEthersSigner, nullifier: bigint, id: bigint = eventId) => {
    const { deadline, sig } = await signed(s, nullifier, Purpose.Buy, id);
    return c.connect(s).buy(id, nullifier, deadline, sig, { value: FACE });
  };
  const joinAs = async (s: HardhatEthersSigner, nullifier: bigint, id: bigint = eventId) => {
    const { deadline, sig } = await signed(s, nullifier, Purpose.Join, id);
    return c.connect(s).joinWaitlist(id, nullifier, deadline, sig, { value: FACE });
  };
  const claimAs = async (s: HardhatEthersSigner, ticketId: bigint, nullifier: bigint, id: bigint = eventId) => {
    const { deadline, sig } = await signed(s, nullifier, Purpose.Claim, id);
    return c.connect(s).claimReturned(id, ticketId, nullifier, deadline, sig, { value: FACE });
  };

  return { c, owner, verifier, host, alice, bob, carol, dave, erin, frank, mallory, params, eventId, signed, buyAs, joinAs, claimAs };
}

async function saleOpenFixture() {
  const f = await deployFixture();
  await time.increaseTo(f.params.saleStart);
  return f;
}

async function soldOutFixture() {
  const f = await saleOpenFixture();
  await f.buyAs(f.alice, N.alice);
  await f.buyAs(f.bob, N.bob);
  return f;
}

const eventOf = (c: Houseful, id: bigint | number) => c.getEventInfo(id);

async function expectSolvent(c: Houseful, eventIds: bigint[] = [1n]) {
  let total = 0n;
  for (const id of eventIds) {
    const e = await eventOf(c, id);
    const [proceeds, escrow] = await c.ledger(id);
    expect(escrow, "escrow backs active waiters").to.equal(e.waitlistActive * e.faceValue);
    expect(proceeds, "proceeds back held seats").to.equal(e.proceedsWithdrawn ? 0n : e.sold * e.faceValue);
    total += proceeds + escrow;
  }
  expect(await ethers.provider.getBalance(await c.getAddress())).to.equal(total);
}

describe("Houseful", () => {
  describe("deployment and admin", () => {
    it("sets verifier and owner, and lets only the owner rotate the verifier", async () => {
      const { c, owner, verifier, mallory, alice } = await loadFixture(deployFixture);
      expect(await c.verifier()).to.equal(verifier.address);
      expect(await c.owner()).to.equal(owner.address);
      await expect(c.connect(mallory).setVerifier(mallory.address))
        .to.be.revertedWithCustomError(c, "OwnableUnauthorizedAccount")
        .withArgs(mallory.address);
      await expect(c.setVerifier(ethers.ZeroAddress)).to.be.revertedWithCustomError(c, "ZeroAddress");
      await expect(c.setVerifier(alice.address)).to.emit(c, "VerifierUpdated").withArgs(verifier.address, alice.address);
      expect(await c.verifier()).to.equal(alice.address);
    });

    it("rejects a zero verifier at deploy", async () => {
      const factory = await ethers.getContractFactory("Houseful");
      await expect(factory.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(factory, "ZeroAddress");
    });

    it("uses two-step ownership transfer", async () => {
      const { c, alice } = await loadFixture(deployFixture);
      await c.transferOwnership(alice.address);
      expect(await c.pendingOwner()).to.equal(alice.address);
      await c.connect(alice).acceptOwnership();
      expect(await c.owner()).to.equal(alice.address);
    });

    it("old attestations stop working once the verifier is rotated", async () => {
      const { c, alice, bob, eventId, signed } = await loadFixture(saleOpenFixture);
      const { deadline, sig } = await signed(alice, N.alice, Purpose.Buy);
      await c.setVerifier(bob.address);
      await expect(
        c.connect(alice).buy(eventId, N.alice, deadline, sig, { value: FACE }),
      ).to.be.revertedWithCustomError(c, "InvalidAttestation");
    });
  });

  describe("createEvent", () => {
    it("stores the policy, emits EventCreated and numbers events from 1", async () => {
      const { c, host, params } = await loadFixture(deployFixture);
      const e = await eventOf(c, 1);
      expect(e.host).to.equal(host.address);
      expect(e.faceValue).to.equal(params.faceValue);
      expect(e.capacity).to.equal(params.capacity);
      expect(e.saleStart).to.equal(params.saleStart);
      expect(e.surrenderCutoff).to.equal(params.surrenderCutoff);
      expect(e.endsAt).to.equal(params.endsAt);
      expect(e.metadataURI).to.equal(params.metadataURI);
      expect(e.metadataHash).to.equal(params.metadataHash);
      expect(e.waitlistHead).to.equal(ethers.ZeroHash);
      expect(e.cancelled).to.equal(false);

      await expect(c.connect(host).createEvent({ ...params, capacity: 5n }))
        .to.emit(c, "EventCreated")
        .withArgs(2n, host.address, params.faceValue, 5n, params.saleStart, params.surrenderCutoff, params.endsAt, params.metadataURI, params.metadataHash);
      expect(await c.eventCount()).to.equal(2n);
    });

    it("validates capacity and schedule", async () => {
      const { c, host, params } = await loadFixture(deployFixture);
      await expect(c.connect(host).createEvent({ ...params, capacity: 0n })).to.be.revertedWithCustomError(c, "InvalidCapacity");
      await expect(
        c.connect(host).createEvent({ ...params, saleStart: params.surrenderCutoff }),
      ).to.be.revertedWithCustomError(c, "InvalidSchedule");
      await expect(
        c.connect(host).createEvent({ ...params, surrenderCutoff: params.endsAt + 1n }),
      ).to.be.revertedWithCustomError(c, "InvalidSchedule");
      const now = BigInt(await time.latest());
      await expect(
        c.connect(host).createEvent({ ...params, saleStart: now - 100n, surrenderCutoff: now - 50n, endsAt: now }),
      ).to.be.revertedWithCustomError(c, "InvalidSchedule");
    });

    it("reverts on unknown events", async () => {
      const { c } = await loadFixture(deployFixture);
      await expect(eventOf(c, 99)).to.be.revertedWithCustomError(c, "UnknownEvent").withArgs(99);
      await expect(c.getTicket(1, 0)).to.be.revertedWithCustomError(c, "UnknownTicket").withArgs(1, 0);
    });

    it("exposes no function that can change an event's policy", async () => {
      const { c } = await loadFixture(deployFixture);
      const mutating = c.interface.fragments
        .filter((f): f is import("ethers").FunctionFragment => f.type === "function")
        .filter((f) => f.stateMutability !== "view" && f.stateMutability !== "pure")
        .map((f) => f.name)
        .sort();
      expect(mutating).to.deep.equal([
        "acceptOwnership",
        "buy",
        "cancelEvent",
        "claimRefund",
        "claimReturned",
        "createEvent",
        "joinWaitlist",
        "leaveWaitlist",
        "renounceOwnership",
        "setDoorKey",
        "setVerifier",
        "surrender",
        "transferOwnership",
        "withdrawProceeds",
      ]);
    });
  });

  describe("buy", () => {
    it("mints ticket 0 at face value to a verified human", async () => {
      const { c, alice, eventId, buyAs } = await loadFixture(saleOpenFixture);
      const tx = buyAs(alice, N.alice);
      await expect(tx).to.emit(c, "TicketBought").withArgs(eventId, 0n, alice.address, N.alice);
      await expect(tx).to.changeEtherBalances([alice, c], [-FACE, FACE]);
      expect(await c.getTicket(eventId, 0)).to.deep.equal([alice.address, N.alice, 0n, ethers.ZeroHash]);
      expect(await c.ticketOf(eventId, alice.address)).to.deep.equal([true, 0n]);
      expect(await c.soldCount(eventId)).to.equal(1n);
      expect(await c.nullifierUsed(eventId, N.alice)).to.equal(true);
      expect(await c.ledger(eventId)).to.deep.equal([FACE, 0n]);
      await expectSolvent(c);
    });

    it("requires exactly face value", async () => {
      const { c, alice, eventId, signed } = await loadFixture(saleOpenFixture);
      const { deadline, sig } = await signed(alice, N.alice, Purpose.Buy);
      for (const value of [FACE - 1n, FACE + 1n, FACE * 5n, 0n]) {
        await expect(c.connect(alice).buy(eventId, N.alice, deadline, sig, { value }))
          .to.be.revertedWithCustomError(c, "WrongPayment")
          .withArgs(FACE, value);
      }
    });

    it("is closed before saleStart and after endsAt", async () => {
      const { c, alice, params, buyAs } = await loadFixture(deployFixture);
      await expect(buyAs(alice, N.alice)).to.be.revertedWithCustomError(c, "SaleNotOpen");
      await time.increaseTo(params.endsAt);
      await expect(buyAs(alice, N.alice)).to.be.revertedWithCustomError(c, "SaleNotOpen");
    });

    it("rejects an attestation signed by anyone but the verifier", async () => {
      const { c, alice, mallory, eventId } = await loadFixture(saleOpenFixture);
      const { deadline, sig } = await attest(c, { signer: mallory, eventId, nullifier: N.alice, wallet: alice.address, purpose: Purpose.Buy });
      await expect(c.connect(alice).buy(eventId, N.alice, deadline, sig, { value: FACE })).to.be.revertedWithCustomError(c, "InvalidAttestation");
    });

    it("rejects malformed signatures without leaking ECDSA errors", async () => {
      const { c, alice, eventId } = await loadFixture(saleOpenFixture);
      const deadline = BigInt(await time.latest()) + 600n;
      for (const sig of ["0x", "0x1234", "0x" + "00".repeat(65)]) {
        await expect(c.connect(alice).buy(eventId, N.alice, deadline, sig, { value: FACE })).to.be.revertedWithCustomError(c, "InvalidAttestation");
      }
    });

    it("rejects an expired attestation and accepts one exactly at its deadline", async () => {
      const { c, alice, bob, verifier, eventId } = await loadFixture(saleOpenFixture);
      const now = BigInt(await time.latest());
      const expired = await attest(c, { signer: verifier, eventId, nullifier: N.alice, wallet: alice.address, purpose: Purpose.Buy, deadline: now });
      await expect(
        c.connect(alice).buy(eventId, N.alice, expired.deadline, expired.sig, { value: FACE }),
      ).to.be.revertedWithCustomError(c, "AttestationExpired");

      const edge = await attest(c, { signer: verifier, eventId, nullifier: N.bob, wallet: bob.address, purpose: Purpose.Buy, deadline: now + 5n });
      await time.setNextBlockTimestamp(now + 5n);
      await expect(c.connect(bob).buy(eventId, N.bob, edge.deadline, edge.sig, { value: FACE })).to.emit(c, "TicketBought");
    });

    it("rejects an attestation issued to a different wallet", async () => {
      const { c, alice, mallory, eventId, signed } = await loadFixture(saleOpenFixture);
      const { deadline, sig } = await signed(alice, N.alice, Purpose.Buy);
      await expect(c.connect(mallory).buy(eventId, N.alice, deadline, sig, { value: FACE })).to.be.revertedWithCustomError(c, "InvalidAttestation");
    });

    it("rejects an attestation issued for a different purpose", async () => {
      const { c, alice, eventId, signed } = await loadFixture(saleOpenFixture);
      for (const purpose of [Purpose.Join, Purpose.Claim, Purpose.None]) {
        const { deadline, sig } = await signed(alice, N.alice, purpose);
        await expect(c.connect(alice).buy(eventId, N.alice, deadline, sig, { value: FACE })).to.be.revertedWithCustomError(c, "InvalidAttestation");
      }
    });

    it("rejects an attestation for another event, nullifier, deadline, chain or contract", async () => {
      const { c, host, alice, verifier, params, eventId, signed } = await loadFixture(saleOpenFixture);
      await c.connect(host).createEvent(params);
      const other = await signed(alice, N.alice, Purpose.Buy, 2n);
      await expect(c.connect(alice).buy(eventId, N.alice, other.deadline, other.sig, { value: FACE })).to.be.revertedWithCustomError(c, "InvalidAttestation");

      const good = await signed(alice, N.alice, Purpose.Buy);
      await expect(c.connect(alice).buy(eventId, N.bob, good.deadline, good.sig, { value: FACE })).to.be.revertedWithCustomError(c, "InvalidAttestation");
      await expect(c.connect(alice).buy(eventId, N.alice, good.deadline + 1n, good.sig, { value: FACE })).to.be.revertedWithCustomError(c, "InvalidAttestation");

      const domain = await domainOf(c);
      for (const d of [{ ...domain, chainId: 4801n }, { ...domain, verifyingContract: verifier.address }, { ...domain, version: "2" }]) {
        const bad = await attest(c, { signer: verifier, eventId, nullifier: N.alice, wallet: alice.address, purpose: Purpose.Buy, domain: d });
        await expect(c.connect(alice).buy(eventId, N.alice, bad.deadline, bad.sig, { value: FACE })).to.be.revertedWithCustomError(c, "InvalidAttestation");
      }
    });

    it("matches the on-chain digest with ethers TypedDataEncoder", async () => {
      const { c, alice, eventId } = await loadFixture(saleOpenFixture);
      const { ATTESTATION_TYPES } = await import("./helpers");
      const value = { eventId, nullifier: N.alice, wallet: alice.address, purpose: Purpose.Buy, deadline: 123n };
      const expected = ethers.TypedDataEncoder.hash(await domainOf(c), ATTESTATION_TYPES, value);
      expect(await c.attestationDigest(eventId, N.alice, alice.address, Purpose.Buy, 123n)).to.equal(expected);
    });

    it("allows one ticket per human per event even across two wallets", async () => {
      const { c, alice, mallory, eventId, buyAs } = await loadFixture(saleOpenFixture);
      await buyAs(alice, N.alice);
      await expect(buyAs(mallory, N.alice)).to.be.revertedWithCustomError(c, "NullifierUsed");
    });

    it("allows one ticket per wallet per event", async () => {
      const { c, alice, eventId, buyAs } = await loadFixture(saleOpenFixture);
      await buyAs(alice, N.alice);
      await expect(buyAs(alice, N.bob)).to.be.revertedWithCustomError(c, "WalletHasTicket");
    });

    it("lets the same human buy for a different event", async () => {
      const { c, host, alice, params, buyAs } = await loadFixture(saleOpenFixture);
      await c.connect(host).createEvent(params);
      await buyAs(alice, N.alice);
      await expect(buyAs(alice, N.alice, 2n)).to.emit(c, "TicketBought").withArgs(2n, 0n, alice.address, N.alice);
    });

    it("reverts SoldOut at capacity", async () => {
      const { c, carol, buyAs } = await loadFixture(soldOutFixture);
      await expect(buyAs(carol, N.carol)).to.be.revertedWithCustomError(c, "SoldOut");
    });
  });

  describe("waitlist", () => {
    it("only opens once the event is sold out", async () => {
      const { c, alice, carol, buyAs, joinAs } = await loadFixture(saleOpenFixture);
      await expect(joinAs(carol, N.carol)).to.be.revertedWithCustomError(c, "SeatsAvailable");
      await buyAs(alice, N.alice);
      await expect(joinAs(carol, N.carol)).to.be.revertedWithCustomError(c, "SeatsAvailable");
    });

    it("escrows face value, records the slot and extends the hash chain", async () => {
      const { c, carol, eventId, joinAs } = await loadFixture(soldOutFixture);
      const head = chainHead([{ nullifier: N.carol, wallet: carol.address }]);
      const tx = joinAs(carol, N.carol);
      await expect(tx).to.emit(c, "WaitlistJoined").withArgs(eventId, 0n, N.carol, carol.address, head);
      await expect(tx).to.changeEtherBalances([carol, c], [-FACE, FACE]);
      expect(await c.waitlistHead(eventId)).to.equal(head);
      expect(await c.waitlistLength(eventId)).to.equal(1n);
      expect(await c.waitlistPositionOf(eventId, carol.address)).to.deep.equal([true, 0n]);
      expect(await c.getWaitlist(eventId, 0, 10)).to.deep.equal([[carol.address, true, N.carol]]);
      expect(await c.ledger(eventId)).to.deep.equal([FACE * 2n, FACE]);
      await expectSolvent(c);
    });

    it("requires exact escrow and a Join attestation", async () => {
      const { c, carol, eventId, signed } = await loadFixture(soldOutFixture);
      const join = await signed(carol, N.carol, Purpose.Join);
      await expect(c.connect(carol).joinWaitlist(eventId, N.carol, join.deadline, join.sig, { value: FACE - 1n })).to.be.revertedWithCustomError(c, "WrongPayment");
      const buy = await signed(carol, N.carol, Purpose.Buy);
      await expect(c.connect(carol).joinWaitlist(eventId, N.carol, buy.deadline, buy.sig, { value: FACE })).to.be.revertedWithCustomError(c, "InvalidAttestation");
    });

    it("keeps one slot per human and per wallet, and bars current holders", async () => {
      const { c, alice, carol, mallory, joinAs } = await loadFixture(soldOutFixture);
      await joinAs(carol, N.carol);
      await expect(joinAs(mallory, N.carol)).to.be.revertedWithCustomError(c, "NullifierUsed");
      await expect(joinAs(carol, N.dave)).to.be.revertedWithCustomError(c, "WalletOnWaitlist");
      await expect(joinAs(mallory, N.alice)).to.be.revertedWithCustomError(c, "NullifierUsed");
      await expect(joinAs(alice, N.erin)).to.be.revertedWithCustomError(c, "WalletHasTicket");
    });

    it("closes at the surrender cutoff", async () => {
      const { c, carol, params, joinAs } = await loadFixture(soldOutFixture);
      await time.increaseTo(params.surrenderCutoff);
      await expect(joinAs(carol, N.carol)).to.be.revertedWithCustomError(c, "WaitlistClosed");
    });

    it("pages through the waitlist", async () => {
      const { c, carol, dave, erin, eventId, joinAs } = await loadFixture(soldOutFixture);
      await joinAs(carol, N.carol);
      await joinAs(dave, N.dave);
      await joinAs(erin, N.erin);
      expect((await c.getWaitlist(eventId, 1, 1)).map((w) => w.wallet)).to.deep.equal([dave.address]);
      expect((await c.getWaitlist(eventId, 1, 50)).map((w) => w.wallet)).to.deep.equal([dave.address, erin.address]);
      expect(await c.getWaitlist(eventId, 3, 5)).to.deep.equal([]);
    });

    it("leaveWaitlist refunds escrow, frees the human and keeps the slot visible but inactive", async () => {
      const { c, carol, eventId, joinAs } = await loadFixture(soldOutFixture);
      await joinAs(carol, N.carol);
      const headBefore = await c.waitlistHead(eventId);
      const tx = c.connect(carol).leaveWaitlist(eventId, 0);
      await expect(tx).to.emit(c, "WaitlistLeft").withArgs(eventId, 0n, carol.address);
      await expect(tx).to.changeEtherBalances([carol, c], [FACE, -FACE]);
      expect(await c.waitlistHead(eventId)).to.equal(headBefore);
      expect(await c.getWaitlist(eventId, 0, 1)).to.deep.equal([[carol.address, false, N.carol]]);
      expect(await c.waitlistPositionOf(eventId, carol.address)).to.deep.equal([false, 0n]);
      expect(await c.nullifierUsed(eventId, N.carol)).to.equal(false);
      await expectSolvent(c);
    });

    it("only the slot owner can leave, and only once", async () => {
      const { c, carol, mallory, eventId, joinAs } = await loadFixture(soldOutFixture);
      await joinAs(carol, N.carol);
      await expect(c.connect(mallory).leaveWaitlist(eventId, 0)).to.be.revertedWithCustomError(c, "NotWaitlistSlotOwner");
      await expect(c.connect(carol).leaveWaitlist(eventId, 7)).to.be.revertedWithCustomError(c, "NotWaitlistSlotOwner");
      await c.connect(carol).leaveWaitlist(eventId, 0);
      await expect(c.connect(carol).leaveWaitlist(eventId, 0)).to.be.revertedWithCustomError(c, "NotWaitlistSlotOwner");
    });

    it("hash chain is re-derivable from emitted WaitlistJoined events, including after leaves and rejoins", async () => {
      const { c, carol, dave, erin, eventId, joinAs } = await loadFixture(soldOutFixture);
      await joinAs(carol, N.carol);
      await joinAs(dave, N.dave);
      await c.connect(carol).leaveWaitlist(eventId, 0);
      await joinAs(erin, N.erin);
      await joinAs(carol, N.carol);

      const logs = await c.queryFilter(c.filters.WaitlistJoined(eventId));
      expect(logs.map((l) => l.args.position)).to.deep.equal([0n, 1n, 2n, 3n]);
      let head = ethers.ZeroHash;
      for (const log of logs) {
        const next = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "uint256", "address"], [head, log.args.nullifier, log.args.wallet]),
        );
        expect(log.args.head).to.equal(next);
        head = next;
      }
      expect(await c.waitlistHead(eventId)).to.equal(head);
      expect(head).to.equal(
        chainHead([
          { nullifier: N.carol, wallet: carol.address },
          { nullifier: N.dave, wallet: dave.address },
          { nullifier: N.erin, wallet: erin.address },
          { nullifier: N.carol, wallet: carol.address },
        ]),
      );
    });
  });

  describe("surrender", () => {
    it("with a waitlist: atomically moves the seat to the oldest waiter, refunds exactly face value and bumps generation", async () => {
      const { c, alice, carol, dave, eventId, joinAs } = await loadFixture(soldOutFixture);
      await joinAs(carol, N.carol);
      await joinAs(dave, N.dave);
      const doorKey = ethers.id("alice-phone");
      await c.connect(alice).setDoorKey(eventId, 0, doorKey);

      const tx = c.connect(alice).surrender(eventId, 0);
      await expect(tx).to.changeEtherBalances([alice, carol, dave, c], [FACE, 0n, 0n, -FACE]);
      await expect(tx)
        .to.emit(c, "Surrendered")
        .withArgs(eventId, 0n, alice.address, carol.address, 1n)
        .and.to.emit(c, "WaitlistPromoted")
        .withArgs(eventId, 0n, 0n, carol.address);

      expect(await c.getTicket(eventId, 0)).to.deep.equal([carol.address, N.carol, 1n, ethers.ZeroHash]);
      expect(await c.ticketOf(eventId, alice.address)).to.deep.equal([false, 0n]);
      expect(await c.ticketOf(eventId, carol.address)).to.deep.equal([true, 0n]);
      expect(await c.waitlistPositionOf(eventId, carol.address)).to.deep.equal([false, 0n]);
      expect(await c.nullifierUsed(eventId, N.alice)).to.equal(false);
      expect(await c.nullifierUsed(eventId, N.carol)).to.equal(true);
      expect(await c.soldCount(eventId)).to.equal(2n);
      expect(await c.returnedCount(eventId)).to.equal(0n);
      const e = await eventOf(c, eventId);
      expect(e.waitlistActive).to.equal(1n);
      expect(e.waitlistCursor).to.equal(1n);
      expect(await c.ledger(eventId)).to.deep.equal([FACE * 2n, FACE]);
      await expectSolvent(c);
    });

    it("chains: the promoted holder can surrender to the next waiter, generation keeps climbing", async () => {
      const { c, alice, carol, dave, eventId, joinAs } = await loadFixture(soldOutFixture);
      await joinAs(carol, N.carol);
      await joinAs(dave, N.dave);
      await c.connect(alice).surrender(eventId, 0);
      await expect(c.connect(carol).surrender(eventId, 0))
        .to.emit(c, "Surrendered")
        .withArgs(eventId, 0n, carol.address, dave.address, 2n);
      expect((await c.getTicket(eventId, 0)).owner).to.equal(dave.address);
      await expectSolvent(c);
    });

    it("skips waiters who left", async () => {
      const { c, alice, carol, dave, erin, eventId, joinAs } = await loadFixture(soldOutFixture);
      await joinAs(carol, N.carol);
      await joinAs(dave, N.dave);
      await joinAs(erin, N.erin);
      await c.connect(carol).leaveWaitlist(eventId, 0);
      await c.connect(dave).leaveWaitlist(eventId, 1);
      await expect(c.connect(alice).surrender(eventId, 0))
        .to.emit(c, "WaitlistPromoted")
        .withArgs(eventId, 2n, 0n, erin.address);
      expect((await eventOf(c, eventId)).waitlistCursor).to.equal(3n);
      await expectSolvent(c);
    });

    it("lets the surrenderer rejoin the back of the line", async () => {
      const { c, alice, carol, eventId, joinAs } = await loadFixture(soldOutFixture);
      await joinAs(carol, N.carol);
      await c.connect(alice).surrender(eventId, 0);
      await expect(joinAs(alice, N.alice)).to.emit(c, "WaitlistJoined").withArgs(eventId, 1n, N.alice, alice.address, await anyHead(c, eventId, alice.address, N.alice));
    });

    it("with an empty waitlist: seat goes to the returned pool and is refunded from proceeds", async () => {
      const { c, alice, eventId } = await loadFixture(soldOutFixture);
      await c.connect(alice).setDoorKey(eventId, 0, ethers.id("k"));
      const tx = c.connect(alice).surrender(eventId, 0);
      await expect(tx).to.emit(c, "Surrendered").withArgs(eventId, 0n, alice.address, ethers.ZeroAddress, 1n);
      await expect(tx).to.changeEtherBalances([alice, c], [FACE, -FACE]);
      expect(await c.getTicket(eventId, 0)).to.deep.equal([ethers.ZeroAddress, 0n, 1n, ethers.ZeroHash]);
      expect(await c.soldCount(eventId)).to.equal(1n);
      expect(await c.returnedCount(eventId)).to.equal(1n);
      expect(await c.returnedTickets(eventId)).to.deep.equal([0n]);
      expect(await c.ledger(eventId)).to.deep.equal([FACE, 0n]);
      await expectSolvent(c);
    });

    it("returned pool: waitlist stays shut, buy stays sold out, claimReturned sells at face value with a Claim attestation", async () => {
      const { c, alice, bob, carol, dave, eventId, signed, buyAs, joinAs, claimAs } = await loadFixture(soldOutFixture);
      await c.connect(alice).surrender(eventId, 0);
      await expect(joinAs(carol, N.carol)).to.be.revertedWithCustomError(c, "SeatsAvailable");
      await expect(buyAs(carol, N.carol)).to.be.revertedWithCustomError(c, "SoldOut");
      await expect(claimAs(carol, 1n, N.carol)).to.be.revertedWithCustomError(c, "NotReturned");
      await expect(claimAs(bob, 0n, N.dave)).to.be.revertedWithCustomError(c, "WalletHasTicket");

      const wrong = await signed(carol, N.carol, Purpose.Buy);
      await expect(c.connect(carol).claimReturned(eventId, 0, N.carol, wrong.deadline, wrong.sig, { value: FACE })).to.be.revertedWithCustomError(c, "InvalidAttestation");
      const right = await signed(carol, N.carol, Purpose.Claim);
      await expect(c.connect(carol).claimReturned(eventId, 0, N.carol, right.deadline, right.sig, { value: FACE * 5n })).to.be.revertedWithCustomError(c, "WrongPayment");

      const tx = claimAs(carol, 0n, N.carol);
      await expect(tx).to.emit(c, "ReturnedClaimed").withArgs(eventId, 0n, carol.address, N.carol);
      await expect(tx).to.changeEtherBalances([carol, c], [-FACE, FACE]);
      expect(await c.getTicket(eventId, 0)).to.deep.equal([carol.address, N.carol, 1n, ethers.ZeroHash]);
      expect(await c.returnedCount(eventId)).to.equal(0n);
      expect(await c.soldCount(eventId)).to.equal(2n);
      await expect(claimAs(dave, 0n, N.dave)).to.be.revertedWithCustomError(c, "NotReturned");
      await expect(joinAs(dave, N.dave)).to.emit(c, "WaitlistJoined");
      await expectSolvent(c);
    });

    it("returned pool keeps a consistent set across several returns and claims", async () => {
      const { c, alice, bob, carol, eventId, claimAs } = await loadFixture(soldOutFixture);
      await c.connect(alice).surrender(eventId, 0);
      await c.connect(bob).surrender(eventId, 1);
      expect(await c.returnedTickets(eventId)).to.deep.equal([0n, 1n]);
      await claimAs(carol, 0n, N.carol);
      expect(await c.returnedTickets(eventId)).to.deep.equal([1n]);
      await expectSolvent(c);
    });

    it("only the owner can surrender, and a surrendered ticket cannot be surrendered again", async () => {
      const { c, alice, mallory, eventId } = await loadFixture(soldOutFixture);
      await expect(c.connect(mallory).surrender(eventId, 0)).to.be.revertedWithCustomError(c, "NotTicketOwner");
      await expect(c.connect(alice).surrender(eventId, 1)).to.be.revertedWithCustomError(c, "NotTicketOwner");
      await expect(c.connect(alice).surrender(eventId, 99)).to.be.revertedWithCustomError(c, "NotTicketOwner");
      await c.connect(alice).surrender(eventId, 0);
      await expect(c.connect(alice).surrender(eventId, 0)).to.be.revertedWithCustomError(c, "NotTicketOwner");
    });

    it("reverts at and after the surrender cutoff", async () => {
      const { c, alice, params, eventId } = await loadFixture(soldOutFixture);
      await time.setNextBlockTimestamp(params.surrenderCutoff - 1n);
      await expect(c.connect(alice).surrender(eventId, 0)).to.emit(c, "Surrendered");
      const f = await loadFixture(soldOutFixture);
      await time.increaseTo(f.params.surrenderCutoff);
      await expect(f.c.connect(f.alice).surrender(f.eventId, 0)).to.be.revertedWithCustomError(f.c, "SurrenderClosed");
    });
  });

  describe("no transfers", () => {
    it("transferFrom, safeTransferFrom, approve and setApprovalForAll revert SurrenderOnly", async () => {
      const { c, alice, bob } = await loadFixture(soldOutFixture);
      await expect(c.connect(alice).transferFrom(alice.address, bob.address, 0)).to.be.revertedWithCustomError(c, "SurrenderOnly");
      await expect(c.connect(alice)["safeTransferFrom(address,address,uint256)"](alice.address, bob.address, 0)).to.be.revertedWithCustomError(c, "SurrenderOnly");
      await expect(c.connect(alice)["safeTransferFrom(address,address,uint256,bytes)"](alice.address, bob.address, 0, "0x")).to.be.revertedWithCustomError(c, "SurrenderOnly");
      await expect(c.connect(alice).approve(bob.address, 0)).to.be.revertedWithCustomError(c, "SurrenderOnly");
      await expect(c.connect(alice).setApprovalForAll(bob.address, true)).to.be.revertedWithCustomError(c, "SurrenderOnly");
    });

    it("a marketplace selling at 5x face value cannot move the ticket", async () => {
      const { c, alice, mallory, eventId } = await loadFixture(soldOutFixture);
      const market = await ethers.deployContract("ScalperMarket");
      await expect(
        market.connect(mallory).buyListing(await c.getAddress(), alice.address, 0, { value: FACE * 5n }),
      ).to.be.revertedWithCustomError(c, "SurrenderOnly");
      expect((await c.getTicket(eventId, 0)).owner).to.equal(alice.address);
    });
  });

  describe("door keys", () => {
    it("owner registers a door key; others cannot", async () => {
      const { c, alice, mallory, eventId } = await loadFixture(soldOutFixture);
      const key = ethers.id("ed25519-pub");
      await expect(c.connect(alice).setDoorKey(eventId, 0, key)).to.emit(c, "DoorKeySet").withArgs(eventId, 0n, alice.address, key);
      expect((await c.getTicket(eventId, 0)).doorKey).to.equal(key);
      await expect(c.connect(mallory).setDoorKey(eventId, 0, key)).to.be.revertedWithCustomError(c, "NotTicketOwner");
      await expect(c.connect(alice).setDoorKey(eventId, 5, key)).to.be.revertedWithCustomError(c, "NotTicketOwner");
    });

    it("moving to a new device revokes the old one's credentials", async () => {
      const { c, alice, eventId } = await loadFixture(soldOutFixture);
      const first = ethers.id("phone-1");
      await c.connect(alice).setDoorKey(eventId, 0, first);
      expect((await c.getTicket(eventId, 0)).generation).to.equal(0n);

      await c.connect(alice).setDoorKey(eventId, 0, first);
      expect((await c.getTicket(eventId, 0)).generation).to.equal(0n);

      await c.connect(alice).setDoorKey(eventId, 0, ethers.id("phone-2"));
      const t = await c.getTicket(eventId, 0);
      expect(t.generation).to.equal(1n);
      expect(t.doorKey).to.equal(ethers.id("phone-2"));
    });
  });

  describe("cancellation and refunds", () => {
    it("only the host can cancel, once, before endsAt", async () => {
      const { c, host, mallory, params, eventId } = await loadFixture(soldOutFixture);
      await expect(c.connect(mallory).cancelEvent(eventId)).to.be.revertedWithCustomError(c, "NotHost");
      await expect(c.connect(host).cancelEvent(99)).to.be.revertedWithCustomError(c, "UnknownEvent");
      await expect(c.connect(host).cancelEvent(eventId)).to.emit(c, "EventCancelled").withArgs(eventId);
      await expect(c.connect(host).cancelEvent(eventId)).to.be.revertedWithCustomError(c, "EventIsCancelled");
      const f = await loadFixture(soldOutFixture);
      await time.increaseTo(params.endsAt);
      await expect(f.c.connect(f.host).cancelEvent(f.eventId)).to.be.revertedWithCustomError(f.c, "EventEnded");
    });

    it("holders and active waiters each pull exactly face value; double refunds and outsiders revert", async () => {
      const { c, host, alice, bob, carol, dave, mallory, eventId, joinAs } = await loadFixture(soldOutFixture);
      await joinAs(carol, N.carol);
      await joinAs(dave, N.dave);
      await c.connect(dave).leaveWaitlist(eventId, 1);
      await expect(c.connect(alice).claimRefund(eventId)).to.be.revertedWithCustomError(c, "EventNotCancelled");
      await c.connect(host).cancelEvent(eventId);

      const tx = c.connect(alice).claimRefund(eventId);
      await expect(tx).to.emit(c, "RefundClaimed").withArgs(eventId, alice.address, FACE);
      await expect(tx).to.changeEtherBalances([alice, c], [FACE, -FACE]);
      await expect(c.connect(carol).claimRefund(eventId)).to.changeEtherBalances([carol, c], [FACE, -FACE]);
      await expect(c.connect(bob).claimRefund(eventId)).to.changeEtherBalances([bob, c], [FACE, -FACE]);

      for (const s of [alice, bob, carol, dave, mallory]) {
        await expect(c.connect(s).claimRefund(eventId)).to.be.revertedWithCustomError(c, "NothingToRefund");
      }
      expect(await ethers.provider.getBalance(await c.getAddress())).to.equal(0n);
      const t = await c.getTicket(eventId, 0);
      expect(t.owner).to.equal(ethers.ZeroAddress);
      expect(t.generation).to.equal(1n);
      await expectSolvent(c);
    });

    it("refunds remain available after endsAt and cannot be blocked by host or platform", async () => {
      const { c, owner, host, alice, params, eventId } = await loadFixture(soldOutFixture);
      await c.connect(host).cancelEvent(eventId);
      await c.connect(owner).setVerifier(host.address);
      await c.connect(owner).renounceOwnership();
      await expect(c.connect(host).withdrawProceeds(eventId)).to.be.revertedWithCustomError(c, "EventIsCancelled");
      await time.increaseTo(params.endsAt + 30n * 24n * 3600n);
      await expect(c.connect(host).withdrawProceeds(eventId)).to.be.revertedWithCustomError(c, "EventIsCancelled");
      await expect(c.connect(alice).claimRefund(eventId)).to.changeEtherBalance(alice, FACE);
    });

    it("blocks buy, join, claim and surrender once cancelled", async () => {
      const { c, host, alice, carol, eventId, buyAs, joinAs, claimAs } = await loadFixture(soldOutFixture);
      await c.connect(host).cancelEvent(eventId);
      await expect(buyAs(carol, N.carol)).to.be.revertedWithCustomError(c, "EventIsCancelled");
      await expect(joinAs(carol, N.carol)).to.be.revertedWithCustomError(c, "EventIsCancelled");
      await expect(claimAs(carol, 0n, N.carol)).to.be.revertedWithCustomError(c, "EventIsCancelled");
      await expect(c.connect(alice).surrender(eventId, 0)).to.be.revertedWithCustomError(c, "EventIsCancelled");
    });

    it("a waiter can still leave after cancellation instead of claiming", async () => {
      const { c, host, carol, eventId, joinAs } = await loadFixture(soldOutFixture);
      await joinAs(carol, N.carol);
      await c.connect(host).cancelEvent(eventId);
      await expect(c.connect(carol).leaveWaitlist(eventId, 0)).to.changeEtherBalance(carol, FACE);
      await expect(c.connect(carol).claimRefund(eventId)).to.be.revertedWithCustomError(c, "NothingToRefund");
      await expectSolvent(c);
    });
  });

  describe("withdrawProceeds", () => {
    it("only the host, only after endsAt, exactly sold x face, never touching waitlist escrow, only once", async () => {
      const { c, host, alice, carol, dave, mallory, params, eventId, joinAs } = await loadFixture(soldOutFixture);
      await joinAs(carol, N.carol);
      await joinAs(dave, N.dave);
      await c.connect(alice).surrender(eventId, 0);

      await expect(c.connect(host).withdrawProceeds(eventId)).to.be.revertedWithCustomError(c, "EventNotEnded");
      await time.setNextBlockTimestamp(params.endsAt - 1n);
      await expect(c.connect(host).withdrawProceeds(eventId)).to.be.revertedWithCustomError(c, "EventNotEnded");
      await time.increaseTo(params.endsAt);
      await expect(c.connect(mallory).withdrawProceeds(eventId)).to.be.revertedWithCustomError(c, "NotHost");

      const sold = await c.soldCount(eventId);
      expect(sold).to.equal(2n);
      const tx = c.connect(host).withdrawProceeds(eventId);
      await expect(tx).to.emit(c, "ProceedsWithdrawn").withArgs(eventId, host.address, sold * FACE);
      await expect(tx).to.changeEtherBalances([host, c], [sold * FACE, -sold * FACE]);
      await expect(c.connect(host).withdrawProceeds(eventId)).to.be.revertedWithCustomError(c, "ProceedsAlreadyWithdrawn");

      expect(await ethers.provider.getBalance(await c.getAddress())).to.equal(FACE);
      await expect(c.connect(dave).leaveWaitlist(eventId, 1)).to.changeEtherBalance(dave, FACE);
      expect(await ethers.provider.getBalance(await c.getAddress())).to.equal(0n);
      await expectSolvent(c);
    });

    it("pays only for seats still held when some were returned and never reclaimed", async () => {
      const { c, host, alice, params, eventId } = await loadFixture(soldOutFixture);
      await c.connect(alice).surrender(eventId, 0);
      await time.increaseTo(params.endsAt);
      await expect(c.connect(host).withdrawProceeds(eventId)).to.changeEtherBalance(host, FACE);
    });

    it("keeps events isolated", async () => {
      const { c, host, alice, bob, params, eventId, buyAs } = await loadFixture(soldOutFixture);
      await c.connect(host).createEvent({ ...params, endsAt: params.endsAt + 1000n, surrenderCutoff: params.surrenderCutoff + 1000n });
      await buyAs(alice, N.alice, 2n);
      await buyAs(bob, N.bob, 2n);
      await time.increaseTo(params.endsAt);
      await expect(c.connect(host).withdrawProceeds(eventId)).to.changeEtherBalance(host, FACE * 2n);
      await expect(c.connect(host).withdrawProceeds(2n)).to.be.revertedWithCustomError(c, "EventNotEnded");
      await expectSolvent(c, [1n, 2n]);
    });
  });

  describe("reentrancy", () => {
    async function attackerFixture() {
      const f = await saleOpenFixture();
      const attacker = await ethers.deployContract("ReentrantHolder", [await f.c.getAddress()]);
      const addr = await attacker.getAddress();
      const buy = await f.signed({ address: addr }, N.attacker, Purpose.Buy);
      await attacker.buy(f.eventId, N.attacker, buy.deadline, buy.sig, { value: FACE });
      return { ...f, attacker, addr };
    }

    const Mode = { None: 0, ClaimRefund: 1, Surrender: 2, LeaveWaitlist: 3 };

    it("re-entering claimRefund from the refund callback fails and pays only once", async () => {
      const { c, host, alice, eventId, attacker, addr, buyAs } = await loadFixture(attackerFixture);
      await buyAs(alice, N.alice);
      await c.connect(host).cancelEvent(eventId);
      await attacker.arm(Mode.ClaimRefund, eventId, 0);
      await expect(attacker.claimRefund(eventId)).to.changeEtherBalances([addr, c], [FACE, -FACE]);
      expect(await attacker.reentryAttempts()).to.equal(1n);
      expect(await attacker.reentrySuccesses()).to.equal(0n);
      expect(c.interface.parseError(await attacker.lastRevert())?.name).to.equal("ReentrancyGuardReentrantCall");
      await expect(attacker.claimRefund(eventId)).to.be.revertedWithCustomError(c, "NothingToRefund");
      expect(await ethers.provider.getBalance(await c.getAddress())).to.equal(FACE);
      await expectSolvent(c);
    });

    it("re-entering surrender from the surrender refund callback fails", async () => {
      const { c, bob, carol, eventId, attacker, addr, buyAs, joinAs } = await loadFixture(attackerFixture);
      await buyAs(bob, N.bob);
      await joinAs(carol, N.carol);
      await attacker.arm(Mode.Surrender, eventId, 0);
      await expect(attacker.surrender(eventId, 0)).to.changeEtherBalances([addr, c], [FACE, -FACE]);
      expect(await attacker.reentrySuccesses()).to.equal(0n);
      expect(c.interface.parseError(await attacker.lastRevert())?.name).to.equal("ReentrancyGuardReentrantCall");
      expect((await c.getTicket(eventId, 0)).owner).to.equal(carol.address);
      await expectSolvent(c);
    });

    it("re-entering leaveWaitlist from the escrow refund callback fails", async () => {
      const f = await loadFixture(attackerFixture);
      await f.buyAs(f.alice, N.alice);
      const waiter = await ethers.deployContract("ReentrantHolder", [await f.c.getAddress()]);
      const waddr = await waiter.getAddress();
      const join = await f.signed({ address: waddr }, N.frank, Purpose.Join);
      await waiter.joinWaitlist(f.eventId, N.frank, join.deadline, join.sig, { value: FACE });
      await waiter.arm(Mode.LeaveWaitlist, f.eventId, 0);
      await expect(waiter.leaveWaitlist(f.eventId, 0)).to.changeEtherBalance(waddr, FACE);
      expect(await waiter.reentrySuccesses()).to.equal(0n);
      expect(f.c.interface.parseError(await waiter.lastRevert())?.name).to.equal("ReentrancyGuardReentrantCall");
      await expectSolvent(f.c);
    });
  });
});

async function anyHead(c: Houseful, eventId: bigint, wallet: string, nullifier: bigint): Promise<string> {
  const prev = await c.waitlistHead(eventId);
  return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "uint256", "address"], [prev, nullifier, wallet]));
}
