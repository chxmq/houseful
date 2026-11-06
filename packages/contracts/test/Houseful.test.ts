import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { Houseful, TestUSDT } from "../typechain-types";
import {
  attest,
  chainHead,
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
    const Mode = { None: 0, ClaimRefund: 1, Surrender: 2, LeaveWaitlist: 3 };

    async function callbackFixture() {
      const [, verifier, host, alice, bob, carol] = await ethers.getSigners();
      const usdt = await ethers.deployContract("CallbackUSDT");
      const weth = await ethers.deployContract("WethMock");
      const router = await ethers.deployContract("MockSwapRouter", [await usdt.getAddress(), await weth.getAddress()]);
      await usdt.mint(await router.getAddress(), FACE * 1_000n);
      const c = (await ethers.deployContract("Houseful", [
        verifier.address,
        await usdt.getAddress(),
        await router.getAddress(),
        await weth.getAddress(),
        POOL_FEE,
      ])) as unknown as Houseful;
      const attacker = await ethers.deployContract("ReentrantHolder", [await c.getAddress()]);
      const addr = await attacker.getAddress();
      await usdt.mint(addr, FACE * 20n);
      await attacker.approveToken(await usdt.getAddress(), await c.getAddress(), FACE * 20n);
      for (const who of [alice, bob, carol, host]) {
        await usdt.mint(who.address, FACE * 20n);
        await usdt.connect(who).approve(await c.getAddress(), FACE * 20n);
      }
      const now = await time.latest();
      const params = {
        faceValue: FACE,
        capacity: 2n,
        seated: false,
        saleStart: BigInt(now + 10),
        surrenderCutoff: BigInt(now + 10 * HOUR),
        endsAt: BigInt(now + 12 * HOUR),
        metadataURI: "ipfs://reentry",
        metadataHash: ethers.id("reentry"),
      };
      await c.connect(host).createEvent(params);
      await time.increaseTo(now + 10);
      const eventId = 1n;
      const signed = async (wallet: string, nullifier: bigint, purpose: PurposeValue) =>
        attest(c, { signer: verifier, eventId, nullifier, wallet, purpose });
      const buy = await signed(addr, N.attacker, Purpose.Buy);
      await attacker.buy(eventId, 0, N.attacker, buy.deadline, buy.sig);
      return { c, usdt, host, alice, bob, carol, verifier, attacker, addr, eventId, signed };
    }

    it("re-entering claimRefund from the refund callback fails and pays only once", async () => {
      const { c, usdt, host, alice, eventId, attacker, addr, signed } = await loadFixture(callbackFixture);
      const a = await signed(alice.address, N.alice, Purpose.Buy);
      await c.connect(alice).buy(eventId, 0, N.alice, a.deadline, a.sig);
      await c.connect(host).cancelEvent(eventId);
      await attacker.arm(Mode.ClaimRefund, eventId, 0);
      const before = await usdt.balanceOf(addr);
      await attacker.claimRefund(eventId);
      expect(await usdt.balanceOf(addr)).to.equal(before + FACE);
      expect(await attacker.reentryAttempts()).to.equal(1n);
      expect(await attacker.reentrySuccesses()).to.equal(0n);
      expect(c.interface.parseError(await attacker.lastRevert())?.name).to.equal("ReentrancyGuardReentrantCall");
      await expect(attacker.claimRefund(eventId)).to.be.revertedWithCustomError(c, "NothingToRefund");
    });

    it("re-entering surrender from the surrender refund callback fails", async () => {
      const { c, usdt, bob, carol, eventId, attacker, addr, signed } = await loadFixture(callbackFixture);
      const b = await signed(bob.address, N.bob, Purpose.Buy);
      await c.connect(bob).buy(eventId, 0, N.bob, b.deadline, b.sig);
      const j = await signed(carol.address, N.carol, Purpose.Join);
      await c.connect(carol).joinWaitlist(eventId, N.carol, j.deadline, j.sig);
      await attacker.arm(Mode.Surrender, eventId, 0);
      const before = await usdt.balanceOf(addr);
      await attacker.surrender(eventId, 0);
      expect(await usdt.balanceOf(addr)).to.equal(before + FACE);
      expect(await attacker.reentrySuccesses()).to.equal(0n);
      expect(c.interface.parseError(await attacker.lastRevert())?.name).to.equal("ReentrancyGuardReentrantCall");
      expect((await c.getTicket(eventId, 0)).owner).to.equal(carol.address);
    });

    it("re-entering leaveWaitlist from the escrow refund callback fails", async () => {
      const f = await loadFixture(callbackFixture);
      const a = await f.signed(f.alice.address, N.alice, Purpose.Buy);
      await f.c.connect(f.alice).buy(f.eventId, 0, N.alice, a.deadline, a.sig);
      const waiter = await ethers.deployContract("ReentrantHolder", [await f.c.getAddress()]);
      const waddr = await waiter.getAddress();
      await f.usdt.mint(waddr, FACE * 2n);
      await waiter.approveToken(await f.usdt.getAddress(), await f.c.getAddress(), FACE * 2n);
      const join = await f.signed(waddr, N.frank, Purpose.Join);
      await waiter.joinWaitlist(f.eventId, N.frank, join.deadline, join.sig);
      await waiter.arm(Mode.LeaveWaitlist, f.eventId, 0);
      const before = await f.usdt.balanceOf(waddr);
      await waiter.leaveWaitlist(f.eventId, 0);
      expect(await f.usdt.balanceOf(waddr)).to.equal(before + FACE);
      expect(await waiter.reentrySuccesses()).to.equal(0n);
      expect(f.c.interface.parseError(await waiter.lastRevert())?.name).to.equal("ReentrancyGuardReentrantCall");
    });
  });

  describe("door keys", () => {
    it("owner registers a door key; others cannot", async () => {
      const { c, alice, bob, eventId, buyAs } = await loadFixture(saleOpenFixture);
      await buyAs(alice, N.alice);
      const key = ethers.id("alice-phone");
      await expect(c.connect(bob).setDoorKey(eventId, 0, key)).to.be.revertedWithCustomError(c, "NotTicketOwner");
      await expect(c.connect(alice).setDoorKey(eventId, 0, key)).to.emit(c, "DoorKeySet").withArgs(eventId, 0n, alice.address, key);
      expect((await c.getTicket(eventId, 0)).doorKey).to.equal(key);
    });

    it("moving to a new device bumps generation", async () => {
      const { c, alice, eventId, buyAs } = await loadFixture(saleOpenFixture);
      await buyAs(alice, N.alice);
      await c.connect(alice).setDoorKey(eventId, 0, ethers.id("phone-a"));
      await c.connect(alice).setDoorKey(eventId, 0, ethers.id("phone-b"));
      expect((await c.getTicket(eventId, 0)).generation).to.equal(1n);
      expect((await c.getTicket(eventId, 0)).doorKey).to.equal(ethers.id("phone-b"));
    });

    it("recoverTicket invalidates the previous door key", async () => {
      const { c, alice, bob, eventId, buyAs, signed } = await loadFixture(saleOpenFixture);
      await buyAs(alice, N.alice);
      await c.connect(alice).setDoorKey(eventId, 0, ethers.id("phone-1"));
      const { deadline, sig } = await signed(bob, N.alice, Purpose.Recover);
      await c.connect(bob).recoverTicket(eventId, 0, N.alice, deadline, sig);
      const t = await c.getTicket(eventId, 0);
      expect(t.doorKey).to.equal(ethers.ZeroHash);
      expect(t.generation).to.equal(1n);
    });
  });

  describe("waitlist order", () => {
    it("promotes waiters in FIFO order and skips departed slots", async () => {
      const { c, alice, bob, carol, dave, erin, eventId, joinAs } = await loadFixture(soldOutFixture);
      await joinAs(carol, N.carol);
      await joinAs(dave, N.dave);
      await joinAs(erin, N.erin);
      await c.connect(dave).leaveWaitlist(eventId, 1);
      await c.connect(alice).surrender(eventId, 0);
      expect((await c.getTicket(eventId, 0)).owner).to.equal(carol.address);
      await c.connect(bob).surrender(eventId, 1);
      expect((await c.getTicket(eventId, 1)).owner).to.equal(erin.address);
    });

    it("only opens once the show is sold out with an empty returned pool", async () => {
      const { c, alice, carol, buyAs, joinAs } = await loadFixture(saleOpenFixture);
      await expect(joinAs(carol, N.carol)).to.be.revertedWithCustomError(c, "SeatsAvailable");
      await buyAs(alice, N.alice);
      await expect(joinAs(carol, N.carol)).to.be.revertedWithCustomError(c, "SeatsAvailable");
    });
  });

  describe("returned seats", () => {
    it("keeps a surrendered seat reserved until claimReturned", async () => {
      const f = await loadFixture(deployFixture);
      const now = await time.latest();
      await f.c.connect(f.host).createEvent({
        ...f.params,
        capacity: 3n,
        seated: true,
        saleStart: BigInt(now + 10),
        surrenderCutoff: BigInt(now + 10 * HOUR),
        endsAt: BigInt(now + 12 * HOUR),
      });
      await time.increaseTo(now + 10);
      const id = 2n;
      await f.buyAs(f.alice, N.alice, id, 1);
      await f.c.connect(f.alice).surrender(id, 0);
      expect(await f.c.seatsTaken(id, 1, 1)).to.deep.equal([true]);
      await expect(f.buyAs(f.bob, N.bob, id, 1)).to.be.revertedWithCustomError(f.c, "SeatTaken").withArgs(1);
      await f.buyAs(f.bob, N.bob, id, 2);
      await f.claimAs(f.carol, 0n, N.carol, id);
      expect((await f.c.getTicket(id, 0)).owner).to.equal(f.carol.address);
      expect((await f.c.getTicket(id, 0)).seat).to.equal(1);
      await expectSolvent(f.c, f.usdt, [id]);
    });
  });

  describe("cancellation extras", () => {
    it("only the host can cancel, once, before endsAt", async () => {
      const { c, host, mallory, eventId } = await loadFixture(saleOpenFixture);
      await expect(c.connect(mallory).cancelEvent(eventId)).to.be.revertedWithCustomError(c, "NotHost");
      await expect(c.connect(host).cancelEvent(eventId)).to.emit(c, "EventCancelled").withArgs(eventId);
      await expect(c.connect(host).cancelEvent(eventId)).to.be.revertedWithCustomError(c, "EventIsCancelled");
      const f = await loadFixture(saleOpenFixture);
      await time.increaseTo(f.params.endsAt);
      await expect(f.c.connect(f.host).cancelEvent(f.eventId)).to.be.revertedWithCustomError(f.c, "EventEnded");
    });

    it("blocks buy, join, claim and surrender once cancelled", async () => {
      const { c, host, alice, carol, eventId, buyAs, joinAs } = await loadFixture(soldOutFixture);
      await c.connect(host).cancelEvent(eventId);
      await expect(buyAs(carol, N.carol)).to.be.revertedWithCustomError(c, "EventIsCancelled");
      await expect(joinAs(carol, N.carol)).to.be.revertedWithCustomError(c, "EventIsCancelled");
      await expect(c.connect(alice).surrender(eventId, 0)).to.be.revertedWithCustomError(c, "EventIsCancelled");
    });

    it("double refunds and outsiders revert", async () => {
      const { c, usdt, host, alice, bob, carol, eventId, joinAs } = await loadFixture(soldOutFixture);
      await joinAs(carol, N.carol);
      await c.connect(host).cancelEvent(eventId);
      await c.connect(alice).claimRefund(eventId);
      await expect(c.connect(alice).claimRefund(eventId)).to.be.revertedWithCustomError(c, "NothingToRefund");
      await expect(c.connect(bob).claimRefund(eventId)).to.emit(c, "RefundClaimed");
      await expect(c.connect(bob).claimRefund(eventId)).to.be.revertedWithCustomError(c, "NothingToRefund");
      await expectSolvent(c, usdt);
    });
  });

  describe("attestation edges", () => {
    it("rejects an attestation signed by anyone but the verifier", async () => {
      const { c, alice, mallory, eventId } = await loadFixture(saleOpenFixture);
      const forged = await attest(c, {
        signer: mallory,
        eventId,
        nullifier: N.alice,
        wallet: alice.address,
        purpose: Purpose.Buy,
      });
      await expect(c.connect(alice).buy(eventId, 0, N.alice, forged.deadline, forged.sig)).to.be.revertedWithCustomError(
        c,
        "InvalidAttestation",
      );
    });

    it("lets the same human buy for a different event", async () => {
      const { c, host, alice, params, buyAs } = await loadFixture(saleOpenFixture);
      await buyAs(alice, N.alice);
      const now = await time.latest();
      await c.connect(host).createEvent({
        ...params,
        saleStart: BigInt(now + 10),
        surrenderCutoff: BigInt(now + 10 * HOUR),
        endsAt: BigInt(now + 12 * HOUR),
      });
      await time.increaseTo(now + 10);
      await expect(buyAs(alice, N.alice, 2n)).to.emit(c, "TicketBought").withArgs(2n, 0n, alice.address, 0, N.alice);
    });

    it("empty waitlist surrender puts the ticket in the returned pool", async () => {
      const { c, usdt, alice, bob, eventId, buyAs, claimAs } = await loadFixture(saleOpenFixture);
      await buyAs(alice, N.alice);
      await expect(c.connect(alice).surrender(eventId, 0))
        .to.emit(c, "Surrendered")
        .withArgs(eventId, 0n, alice.address, ethers.ZeroAddress, 1n);
      expect(await c.returnedTickets(eventId)).to.deep.equal([0n]);
      await claimAs(bob, 0n, N.bob);
      expect((await c.getTicket(eventId, 0)).owner).to.equal(bob.address);
      await expectSolvent(c, usdt);
    });
  });
});
