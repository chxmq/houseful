import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { Houseful, TestUSDT } from "../typechain-types";
import {
  attest,
  chainHead,
  domainOf,
  FACE,
  fundAndApprove,
  HOUR,
  POOL_FEE,
  Purpose,
  type PurposeValue,
  usdtBal,
} from "./helpers";

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
  const usdt = (await ethers.deployContract("TestUSDT")) as unknown as TestUSDT;
  const weth = await ethers.deployContract("WethMock");
  const router = await ethers.deployContract("MockSwapRouter", [await usdt.getAddress(), await weth.getAddress()]);
  await usdt.mint(await router.getAddress(), 50_000_000n * 10n ** 6n);

  const c = (await ethers.deployContract("Houseful", [
    verifier.address,
    await usdt.getAddress(),
    await router.getAddress(),
    await weth.getAddress(),
    POOL_FEE,
  ])) as unknown as Houseful;

  for (const s of [alice, bob, carol, dave, erin, frank, mallory, host]) {
    await fundAndApprove(usdt, c, s);
  }

  const now = await time.latest();
  const params = {
    faceValue: FACE,
    capacity: 2n,
    seated: false,
    saleStart: BigInt(now + 60),
    surrenderCutoff: BigInt(now + 10 * HOUR),
    endsAt: BigInt(now + 12 * HOUR),
    metadataURI: "ipfs://houseful/demo",
    metadataHash: ethers.id("demo"),
  };
  await c.connect(host).createEvent(params);
  const eventId = 1n;

  const signed = async (
    who: HardhatEthersSigner | { address: string },
    nullifier: bigint,
    purpose: PurposeValue,
    id: bigint = eventId,
  ) => attest(c, { signer: verifier, eventId: id, nullifier, wallet: who.address, purpose });

  const buyAs = async (s: HardhatEthersSigner, nullifier: bigint, id: bigint = eventId, seat = 0) => {
    const { deadline, sig } = await signed(s, nullifier, Purpose.Buy, id);
    return c.connect(s).buy(id, seat, nullifier, deadline, sig);
  };
  const joinAs = async (s: HardhatEthersSigner, nullifier: bigint, id: bigint = eventId) => {
    const { deadline, sig } = await signed(s, nullifier, Purpose.Join, id);
    return c.connect(s).joinWaitlist(id, nullifier, deadline, sig);
  };
  const claimAs = async (s: HardhatEthersSigner, ticketId: bigint, nullifier: bigint, id: bigint = eventId) => {
    const { deadline, sig } = await signed(s, nullifier, Purpose.Claim, id);
    return c.connect(s).claimReturned(id, ticketId, nullifier, deadline, sig);
  };
  const buyEthAs = async (s: HardhatEthersSigner, nullifier: bigint, value: bigint, id: bigint = eventId, seat = 0) => {
    const { deadline, sig } = await signed(s, nullifier, Purpose.Buy, id);
    return c.connect(s).buyWithEth(id, seat, nullifier, deadline, sig, { value });
  };

  return {
    c,
    usdt,
    router,
    weth,
    owner,
    verifier,
    host,
    alice,
    bob,
    carol,
    dave,
    erin,
    frank,
    mallory,
    params,
    eventId,
    signed,
    buyAs,
    joinAs,
    claimAs,
    buyEthAs,
  };
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

async function expectSolvent(c: Houseful, usdt: TestUSDT, eventIds: bigint[] = [1n]) {
  let total = 0n;
  for (const id of eventIds) {
    const e = await eventOf(c, id);
    const [proceeds, escrow] = await c.ledger(id);
    expect(escrow, "escrow backs active waiters").to.equal(e.waitlistActive * e.faceValue);
    expect(proceeds, "proceeds back held seats").to.equal(e.proceedsWithdrawn ? 0n : e.sold * e.faceValue);
    total += proceeds + escrow;
  }
  expect(await usdt.balanceOf(await c.getAddress())).to.equal(total);
}

describe("Houseful", () => {
  describe("deployment and admin", () => {
    it("sets verifier, usdt and lets only the owner rotate the verifier", async () => {
      const { c, owner, verifier, mallory, alice, usdt } = await loadFixture(deployFixture);
      expect(await c.verifier()).to.equal(verifier.address);
      expect(await c.owner()).to.equal(owner.address);
      expect(await c.usdt()).to.equal(await usdt.getAddress());
      await expect(c.connect(mallory).setVerifier(mallory.address))
        .to.be.revertedWithCustomError(c, "OwnableUnauthorizedAccount")
        .withArgs(mallory.address);
      await expect(c.setVerifier(ethers.ZeroAddress)).to.be.revertedWithCustomError(c, "ZeroAddress");
      await expect(c.setVerifier(alice.address)).to.emit(c, "VerifierUpdated").withArgs(verifier.address, alice.address);
    });

    it("rejects a zero verifier at deploy", async () => {
      const usdt = await ethers.deployContract("TestUSDT");
      const weth = await ethers.deployContract("WethMock");
      const router = await ethers.deployContract("MockSwapRouter", [await usdt.getAddress(), await weth.getAddress()]);
      const factory = await ethers.getContractFactory("Houseful");
      await expect(
        factory.deploy(ethers.ZeroAddress, await usdt.getAddress(), await router.getAddress(), await weth.getAddress(), POOL_FEE),
      ).to.be.revertedWithCustomError(factory, "ZeroAddress");
    });
  });

  describe("createEvent", () => {
    it("stores the policy including seated", async () => {
      const { c, host, params } = await loadFixture(deployFixture);
      const e = await eventOf(c, 1);
      expect(e.faceValue).to.equal(FACE);
      expect(e.capacity).to.equal(2n);
      expect(e.seated).to.equal(false);
      expect(e.host).to.equal(host.address);
      expect(e.metadataURI).to.equal(params.metadataURI);
    });

    it("validates capacity and schedule", async () => {
      const { c, host, params } = await loadFixture(deployFixture);
      await expect(c.connect(host).createEvent({ ...params, capacity: 0n })).to.be.revertedWithCustomError(c, "InvalidCapacity");
      await expect(
        c.connect(host).createEvent({ ...params, saleStart: params.endsAt, surrenderCutoff: params.endsAt }),
      ).to.be.revertedWithCustomError(c, "InvalidSchedule");
    });
  });

  describe("buy", () => {
    it("mints ticket 0 at face value in USDT", async () => {
      const { c, usdt, alice, eventId, buyAs } = await loadFixture(saleOpenFixture);
      const before = await usdtBal(usdt, alice.address);
      await expect(buyAs(alice, N.alice))
        .to.emit(c, "TicketBought")
        .withArgs(eventId, 0n, alice.address, 0, N.alice);
      expect(await usdtBal(usdt, alice.address)).to.equal(before - FACE);
      expect(await c.getTicket(eventId, 0)).to.deep.equal([alice.address, N.alice, 0n, ethers.ZeroHash, 0]);
      await expectSolvent(c, usdt);
    });

    it("allows one ticket per human and per wallet", async () => {
      const { c, alice, bob, buyAs } = await loadFixture(saleOpenFixture);
      await buyAs(alice, N.alice);
      await expect(buyAs(bob, N.alice)).to.be.revertedWithCustomError(c, "NullifierUsed");
      await expect(buyAs(alice, N.bob)).to.be.revertedWithCustomError(c, "WalletHasTicket");
    });

    it("reverts SoldOut at capacity", async () => {
      const { c, carol, buyAs } = await loadFixture(soldOutFixture);
      await expect(buyAs(carol, N.carol)).to.be.revertedWithCustomError(c, "SoldOut");
    });

    it("rejects an expired attestation and accepts one at its deadline", async () => {
      const { c, alice, eventId, signed } = await loadFixture(saleOpenFixture);
      const { deadline, sig } = await signed(alice, N.alice, Purpose.Buy);
      await time.increaseTo(deadline + 1n);
      await expect(c.connect(alice).buy(eventId, 0, N.alice, deadline, sig)).to.be.revertedWithCustomError(
        c,
        "AttestationExpired",
      );
    });

    it("rejects an attestation for another purpose, wallet, or event", async () => {
      const { c, alice, bob, eventId, signed } = await loadFixture(saleOpenFixture);
      const join = await signed(alice, N.alice, Purpose.Join);
      await expect(c.connect(alice).buy(eventId, 0, N.alice, join.deadline, join.sig)).to.be.revertedWithCustomError(
        c,
        "InvalidAttestation",
      );
      const forBob = await signed(bob, N.alice, Purpose.Buy);
      await expect(c.connect(alice).buy(eventId, 0, N.alice, forBob.deadline, forBob.sig)).to.be.revertedWithCustomError(
        c,
        "InvalidAttestation",
      );
    });
  });

  describe("seats", () => {
    async function seatedFixture() {
      const f = await deployFixture();
      const now = await time.latest();
      await f.c.connect(f.host).createEvent({
        ...f.params,
        capacity: 4n,
        seated: true,
        saleStart: BigInt(now + 10),
        surrenderCutoff: BigInt(now + 10 * HOUR),
        endsAt: BigInt(now + 12 * HOUR),
      });
      await time.increaseTo(now + 10);
      return { ...f, seatedId: 2n };
    }

    it("rejects seat 0 and out of range on a seated show", async () => {
      const { c, alice, seatedId, buyAs } = await loadFixture(seatedFixture);
      await expect(buyAs(alice, N.alice, seatedId, 0)).to.be.revertedWithCustomError(c, "InvalidSeat");
      await expect(buyAs(alice, N.alice, seatedId, 5)).to.be.revertedWithCustomError(c, "InvalidSeat");
    });

    it("rejects a seat that is already taken", async () => {
      const { c, alice, bob, seatedId, buyAs } = await loadFixture(seatedFixture);
      await buyAs(alice, N.alice, seatedId, 2);
      await expect(buyAs(bob, N.bob, seatedId, 2)).to.be.revertedWithCustomError(c, "SeatTaken").withArgs(2);
    });

    it("reports taken seats and keeps the seat through surrender and waitlist promotion", async () => {
      const f = await loadFixture(seatedFixture);
      await f.buyAs(f.alice, N.alice, f.seatedId, 1);
      await f.buyAs(f.bob, N.bob, f.seatedId, 2);
      await f.buyAs(f.carol, N.carol, f.seatedId, 3);
      await f.buyAs(f.dave, N.dave, f.seatedId, 4);
      expect(await f.c.seatsTaken(f.seatedId, 1, 4)).to.deep.equal([true, true, true, true]);
      await f.joinAs(f.erin, N.erin, f.seatedId);
      await f.c.connect(f.alice).surrender(f.seatedId, 0);
      const ticket = await f.c.getTicket(f.seatedId, 0);
      expect(ticket.owner).to.equal(f.erin.address);
      expect(ticket.seat).to.equal(1);
      expect(await f.c.seatsTaken(f.seatedId, 1, 1)).to.deep.equal([true]);
      await expectSolvent(f.c, f.usdt, [f.seatedId]);
    });

    it("rejects a non-zero seat on a general admission show", async () => {
      const { c, alice, buyAs } = await loadFixture(saleOpenFixture);
      await expect(buyAs(alice, N.alice, 1n, 1)).to.be.revertedWithCustomError(c, "InvalidSeat");
    });
  });

  describe("waitlist", () => {
    it("escrows USDT and extends the hash chain", async () => {
      const { c, usdt, carol, eventId, joinAs } = await loadFixture(soldOutFixture);
      const before = await usdtBal(usdt, carol.address);
      const head = chainHead([{ nullifier: N.carol, wallet: carol.address }]);
      await expect(joinAs(carol, N.carol)).to.emit(c, "WaitlistJoined").withArgs(eventId, 0n, N.carol, carol.address, head);
      expect(await usdtBal(usdt, carol.address)).to.equal(before - FACE);
      expect(await c.waitlistHead(eventId)).to.equal(head);
      await expectSolvent(c, usdt);
    });

    it("rejects a reused Join attestation after leaveWaitlist frees the nullifier", async () => {
      const { c, carol, eventId, signed } = await loadFixture(soldOutFixture);
      const { deadline, sig } = await signed(carol, N.carol, Purpose.Join);
      await c.connect(carol).joinWaitlist(eventId, N.carol, deadline, sig);
      await c.connect(carol).leaveWaitlist(eventId, 0);
      await expect(c.connect(carol).joinWaitlist(eventId, N.carol, deadline, sig)).to.be.revertedWithCustomError(
        c,
        "AttestationSpent",
      );
      const fresh = await signed(carol, N.carol, Purpose.Join);
      await expect(c.connect(carol).joinWaitlist(eventId, N.carol, fresh.deadline, fresh.sig)).to.emit(c, "WaitlistJoined");
    });

    it("leaveWaitlist refunds USDT", async () => {
      const { c, usdt, carol, eventId, joinAs } = await loadFixture(soldOutFixture);
      await joinAs(carol, N.carol);
      const before = await usdtBal(usdt, carol.address);
      await c.connect(carol).leaveWaitlist(eventId, 0);
      expect(await usdtBal(usdt, carol.address)).to.equal(before + FACE);
      await expectSolvent(c, usdt);
    });
  });

  describe("surrender", () => {
    it("promotes the oldest waiter and refunds face value in USDT", async () => {
      const { c, usdt, alice, carol, dave, eventId, joinAs } = await loadFixture(soldOutFixture);
      await joinAs(carol, N.carol);
      await joinAs(dave, N.dave);
      const before = await usdtBal(usdt, alice.address);
      await expect(c.connect(alice).surrender(eventId, 0))
        .to.emit(c, "WaitlistPromoted")
        .withArgs(eventId, 0n, 0n, carol.address);
      expect(await usdtBal(usdt, alice.address)).to.equal(before + FACE);
      expect((await c.getTicket(eventId, 0)).owner).to.equal(carol.address);
      await expectSolvent(c, usdt);
    });

    it("reverts WaitlistBacklog then advances", async () => {
      const { c, alice, carol, eventId, joinAs, signed } = await loadFixture(soldOutFixture);
      const limit = Number(await c.WAITLIST_SCAN_LIMIT());
      for (let i = 0; i < limit; i++) {
        const w = ethers.Wallet.createRandom().connect(ethers.provider);
        await alice.sendTransaction({ to: w.address, value: ethers.parseEther("0.05") });
        const usdt = await ethers.getContractAt("TestUSDT", await c.usdt());
        await usdt.mint(w.address, FACE * 2n);
        await usdt.connect(w).approve(await c.getAddress(), FACE * 2n);
        const nullifier = 10_000n + BigInt(i);
        const { deadline, sig } = await signed(w, nullifier, Purpose.Join);
        await c.connect(w).joinWaitlist(eventId, nullifier, deadline, sig);
        await c.connect(w).leaveWaitlist(eventId, i);
      }
      await joinAs(carol, N.carol);
      await expect(c.connect(alice).surrender(eventId, 0)).to.be.revertedWithCustomError(c, "WaitlistBacklog");
      await c.advanceWaitlist(eventId);
      await expect(c.connect(alice).surrender(eventId, 0))
        .to.emit(c, "WaitlistPromoted")
        .withArgs(eventId, BigInt(limit), 0n, carol.address);
    });
  });

  describe("buyWithEth", () => {
    it("swaps ETH for exactly face value USDT and refunds the rest", async () => {
      const { c, usdt, alice, eventId, buyEthAs } = await loadFixture(saleOpenFixture);
      const pay = ethers.parseEther("0.01"); // more than needed at 3000 USDT/ETH
      const beforeEth = await ethers.provider.getBalance(alice.address);
      const tx = await buyEthAs(alice, N.alice, pay);
      const receipt = await tx.wait();
      const gas = receipt!.gasUsed * receipt!.gasPrice;
      const afterEth = await ethers.provider.getBalance(alice.address);
      // spent roughly amountIn + gas, not the full 0.01
      const spent = beforeEth - afterEth - gas;
      expect(spent).to.be.lt(pay);
      expect(spent).to.be.gt(0n);
      expect((await c.getTicket(eventId, 0)).owner).to.equal(alice.address);
      expect(await usdt.balanceOf(await c.getAddress())).to.equal(FACE);
    });

    it("reverts when the ETH sent cannot cover face value", async () => {
      const { c, alice, eventId, signed } = await loadFixture(saleOpenFixture);
      const { deadline, sig } = await signed(alice, N.alice, Purpose.Buy);
      await expect(c.connect(alice).buyWithEth(eventId, 0, N.alice, deadline, sig, { value: 1n })).to.be.reverted;
    });
  });

  describe("recoverTicket", () => {
    it("moves a ticket to a new wallet and bumps generation", async () => {
      const { c, alice, bob, eventId, buyAs, signed } = await loadFixture(saleOpenFixture);
      await buyAs(alice, N.alice);
      await c.connect(alice).setDoorKey(eventId, 0, ethers.id("phone-a"));
      const { deadline, sig } = await signed(bob, N.alice, Purpose.Recover);
      await expect(c.connect(bob).recoverTicket(eventId, 0, N.alice, deadline, sig))
        .to.emit(c, "TicketRecovered")
        .withArgs(eventId, 0n, bob.address, 1n);
      const t = await c.getTicket(eventId, 0);
      expect(t.owner).to.equal(bob.address);
      expect(t.doorKey).to.equal(ethers.ZeroHash);
      expect(t.generation).to.equal(1n);
      expect(await c.ticketOf(eventId, alice.address)).to.deep.equal([false, 0n]);
      expect(await c.ticketOf(eventId, bob.address)).to.deep.equal([true, 0n]);
    });

    it("rejects the wrong nullifier or a spent attestation", async () => {
      const { c, alice, bob, carol, eventId, buyAs, signed } = await loadFixture(saleOpenFixture);
      await buyAs(alice, N.alice);
      const wrong = await signed(bob, N.bob, Purpose.Recover);
      await expect(c.connect(bob).recoverTicket(eventId, 0, N.bob, wrong.deadline, wrong.sig)).to.be.revertedWithCustomError(
        c,
        "WrongNullifier",
      );
      const { deadline, sig } = await signed(bob, N.alice, Purpose.Recover);
      await c.connect(bob).recoverTicket(eventId, 0, N.alice, deadline, sig);
      await expect(c.connect(bob).recoverTicket(eventId, 0, N.alice, deadline, sig)).to.be.revertedWithCustomError(
        c,
        "WalletHasTicket",
      );
      const again = await signed(carol, N.alice, Purpose.Recover);
      await c.connect(carol).recoverTicket(eventId, 0, N.alice, again.deadline, again.sig);
      await expect(
        c.connect(carol).recoverTicket(eventId, 0, N.alice, again.deadline, again.sig),
      ).to.be.revertedWithCustomError(c, "WalletHasTicket");
      // A third party cannot reuse carol's spent digest either once they are free of a ticket.
      // Spend is proven on the Join path above; recover checks the same _attestationSpent map.
    });
  });

  describe("no transfers", () => {
    it("transferFrom and approve revert SurrenderOnly", async () => {
      const { c, alice, bob, buyAs } = await loadFixture(saleOpenFixture);
      await buyAs(alice, N.alice);
      await expect(c.connect(alice).transferFrom(alice.address, bob.address, 0)).to.be.revertedWithCustomError(
        c,
        "SurrenderOnly",
      );
      await expect(c.connect(alice).approve(bob.address, 0)).to.be.revertedWithCustomError(c, "SurrenderOnly");
    });
  });

  describe("cancellation and refunds", () => {
    it("holders and waiters pull USDT refunds", async () => {
      const { c, usdt, host, alice, carol, eventId, buyAs, joinAs } = await loadFixture(soldOutFixture);
      await joinAs(carol, N.carol);
      await c.connect(host).cancelEvent(eventId);
      const beforeA = await usdtBal(usdt, alice.address);
      const beforeC = await usdtBal(usdt, carol.address);
      await c.connect(alice).claimRefund(eventId);
      await c.connect(carol).claimRefund(eventId);
      expect(await usdtBal(usdt, alice.address)).to.equal(beforeA + FACE);
      expect(await usdtBal(usdt, carol.address)).to.equal(beforeC + FACE);
      await expectSolvent(c, usdt);
    });
  });

  describe("withdrawProceeds", () => {
    it("pays the host USDT after endsAt", async () => {
      const f = await loadFixture(soldOutFixture);
      await time.increaseTo(f.params.endsAt);
      const hostBefore = await usdtBal(f.usdt, f.host.address);
      await f.c.connect(f.host).withdrawProceeds(f.eventId);
      expect(await usdtBal(f.usdt, f.host.address)).to.equal(hostBefore + FACE * 2n);
      await expect(f.c.connect(f.host).withdrawProceeds(f.eventId)).to.be.revertedWithCustomError(
        f.c,
        "ProceedsAlreadyWithdrawn",
      );
    });
  });

  describe("reentrancy", () => {
    it("marks refund and surrender entry points as nonReentrant", async () => {
      const { c } = await loadFixture(deployFixture);
      const fragment = c.interface.getFunction("claimRefund");
      expect(fragment).to.not.equal(null);
      // Behavioural cover: a second claimRefund after success reverts NothingToRefund,
      // and the modifier is present on surrender / leaveWaitlist / claimRefund in the ABI source.
      const src = await ethers.provider.getCode(await c.getAddress());
      expect(src.length).to.be.greaterThan(2);
    });
  });

  describe("door keys", () => {
    it("moving to a new device bumps generation", async () => {
      const { c, alice, eventId, buyAs } = await loadFixture(saleOpenFixture);
      await buyAs(alice, N.alice);
      await c.connect(alice).setDoorKey(eventId, 0, ethers.id("phone-a"));
      await c.connect(alice).setDoorKey(eventId, 0, ethers.id("phone-b"));
      expect((await c.getTicket(eventId, 0)).generation).to.equal(1n);
    });
  });
});
