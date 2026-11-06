import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { attest, FACE, Purpose, type PurposeValue } from "../helpers";
import { seeded } from "./seeded";

async function fixture(tokenName = "TestUSDT", routerName = "MockSwapRouter") {
  const [, verifier, ...fans] = await ethers.getSigners();
  const deployedToken = await ethers.deployContract(tokenName);
  const token = await ethers.getContractAt("HostileToken", await deployedToken.getAddress());
  const weth = await ethers.deployContract("WethMock");
  const deployedRouter = await ethers.deployContract(routerName, routerName === "MockSwapRouter"
    ? [await token.getAddress(), await weth.getAddress()] : []);
  const router = await ethers.getContractAt("HostileRouter", await deployedRouter.getAddress());
  const c = await ethers.deployContract("Houseful", [verifier.address, await token.getAddress(), await router.getAddress(), await weth.getAddress(), 3000]);
  await token.mint(await router.getAddress(), FACE * 10000n);
  for (const fan of fans) {
    await token.mint(fan.address, FACE * 1000n);
    await token.connect(fan).approve(await c.getAddress(), ethers.MaxUint256);
  }
  const now = await time.latest();
  const params = { faceValue: FACE, capacity: 4, seated: true, saleStart: now, surrenderCutoff: now + 10000, endsAt: now + 12000, metadataURI: "", metadataHash: ethers.ZeroHash };
  for (let i = 0; i < 2; i++) await c.createEvent({ ...params, seated: i === 0 });
  let nonce = 0;
  const signed = async (fan: typeof fans[number], id: number, nullifier: bigint, purpose: PurposeValue) =>
    attest(c, { signer: verifier, wallet: fan.address, eventId: id, nullifier, purpose, deadline: params.endsAt + (++nonce) });
  const buy = async (fan: typeof fans[number], id: number, seat: number, nullifier: bigint, eth = false) => {
    const a = await signed(fan, id, nullifier, Purpose.Buy);
    return eth ? c.connect(fan).buyWithEth(id, seat, nullifier, a.deadline, a.sig, { value: ethers.parseEther("0.01") })
      : c.connect(fan).buy(id, seat, nullifier, a.deadline, a.sig);
  };
  return { c, token, router, fans, params, signed, buy };
}

// Assert both the ledger equation and an independent liabilities equation.
async function invariant(f: Awaited<ReturnType<typeof fixture>>) {
  let liabilities = 0n;
  let ledgerTotal = 0n;
  for (const id of [1, 2]) {
    const e = await f.c.getEventInfo(id);
    const [proceeds, escrow] = await f.c.ledger(id);
    ledgerTotal += proceeds + escrow;
    const people = new Set<string>();
    const owners = new Set<string>();
    const seats = new Set<number>();
    let held = 0n;
    for (let ticketId = 0; ticketId < Number(e.minted); ticketId++) {
      const t = await f.c.getTicket(id, ticketId);
      if (t.owner === ethers.ZeroAddress) continue;
      held++;
      expect(owners.has(t.owner), "wallet held twice").to.equal(false);
      expect(people.has(t.nullifier.toString()), "person held twice").to.equal(false);
      owners.add(t.owner);
      people.add(t.nullifier.toString());
      expect(await f.c.ticketOf(id, t.owner)).to.deep.equal([true, BigInt(ticketId)]);
      expect(await f.c.nullifierUsed(id, t.nullifier)).to.equal(true);
      if (e.seated) {
        expect(seats.has(Number(t.seat)), "seat held twice").to.equal(false);
        seats.add(Number(t.seat));
      } else expect(t.seat).to.equal(0n);
    }
    let waiting = 0n;
    const queue = await f.c.getWaitlist(id, 0, e.waitlistLength);
    for (const [position, w] of queue.entries()) {
      if (!w.active) continue;
      waiting++;
      expect(people.has(w.nullifier.toString()), "person held and waiting").to.equal(false);
      expect(owners.has(w.wallet), "wallet held and waiting").to.equal(false);
      people.add(w.nullifier.toString());
      owners.add(w.wallet);
      expect(await f.c.nullifierUsed(id, w.nullifier)).to.equal(true);
      expect(await f.c.waitlistPositionOf(id, w.wallet)).to.deep.equal([true, BigInt(position)]);
    }
    expect(e.sold).to.equal(held);
    expect(e.waitlistActive).to.equal(waiting);
    expect(e.minted).to.be.lte(e.capacity);
    expect(held).to.be.lte(e.capacity);
    expect(escrow).to.equal(waiting * FACE);
    expect(proceeds).to.equal(e.proceedsWithdrawn ? 0n : held * FACE);
    // Cancelled liabilities are unclaimed refunds, already included in the ledger.
    const unclaimedRefunds = e.cancelled ? (held + waiting) * FACE : 0n;
    liabilities += e.cancelled ? unclaimedRefunds : (e.proceedsWithdrawn ? 0n : held * FACE) + waiting * FACE;
    if (e.seated) {
      // Returned tickets keep their seat reserved until claim or cancel-refund (HF-01).
      const reserved = new Set(seats);
      for (const ticketId of await f.c.returnedTickets(id)) {
        const t = await f.c.getTicket(id, ticketId);
        expect(Number(t.seat)).to.be.greaterThan(0);
        expect(reserved.has(Number(t.seat)), "returned seat reserved twice").to.equal(false);
        reserved.add(Number(t.seat));
      }
      expect(await f.c.seatsTaken(id, 1, 4)).to.deep.equal([1, 2, 3, 4].map((s) => reserved.has(s)));
    }
  }
  expect(await f.token.balanceOf(await f.c.getAddress())).to.equal(ledgerTotal);
  expect(ledgerTotal).to.equal(liabilities);
  expect(await ethers.provider.getBalance(await f.c.getAddress())).to.equal(0n);
}

describe("seeded lifecycle invariants", function () {
  this.timeout(120000);
  for (const seed of [1, 42, 20261107, 0xdeadbeef]) {
    it(`reconciles every transition (seed ${seed})`, async () => {
      const f = await fixture();
      const pick = seeded(seed);
      const seenSeats = new Map<string, bigint>();
      for (const id of [1, 2]) for (let i = 0; i < 4; i++) {
        await f.buy(f.fans[i], id, id === 1 ? i + 1 : 0, BigInt(i + 1), pick(2) === 0);
        seenSeats.set(`${id}:${i}`, BigInt(id === 1 ? i + 1 : 0));
      }
      await invariant(f);
      for (let step = 0; step < 90; step++) {
        const id = pick(2) + 1;
        const fan = f.fans[pick(f.fans.length)];
        const action = pick(6);
        const held = await f.c.ticketOf(id, fan.address);
        const waiting = await f.c.waitlistPositionOf(id, fan.address);
        const e = await f.c.getEventInfo(id);
        if (action === 0 && held.held) {
          const queue = await f.c.getWaitlist(id, 0, e.waitlistLength);
          const next = queue.find(waiter => waiter.active);
          const key = ethers.id(`surrender:${seed}:${step}`);
          await f.c.connect(fan).setDoorKey(id, held.ticketId, key);
          const before = await f.c.getTicket(id, held.ticketId);
          expect(before.doorKey).to.equal(key);
          await f.c.connect(fan).surrender(id, held.ticketId);
          const after = await f.c.getTicket(id, held.ticketId);
          expect(after.owner, "oldest active waiter receives the seat").to.equal(next?.wallet ?? ethers.ZeroAddress);
          expect(after.generation).to.equal(before.generation + 1n);
          expect(after.doorKey).to.equal(ethers.ZeroHash);
        } else if (action === 1 && waiting.waiting) {
          await f.c.connect(fan).leaveWaitlist(id, waiting.position);
        } else if (!held.held && !waiting.waiting) {
          const nullifier = BigInt(pick(10) + 1);
          if (await f.c.nullifierUsed(id, nullifier)) {
            const a = await f.signed(fan, id, nullifier, Purpose.Join);
            if (e.returned === 0n) await expect(f.c.connect(fan).joinWaitlist(id, nullifier, a.deadline, a.sig)).to.be.revertedWithCustomError(f.c, "NullifierUsed");
          } else if (action === 2 && e.returned > 0n) {
            const ids = await f.c.returnedTickets(id);
            const ticketId = ids[pick(ids.length)];
            const a = await f.signed(fan, id, nullifier, Purpose.Claim);
            if (pick(2)) await f.c.connect(fan).claimReturned(id, ticketId, nullifier, a.deadline, a.sig);
            else await f.c.connect(fan).claimReturnedWithEth(id, ticketId, nullifier, a.deadline, a.sig, { value: ethers.parseEther("0.01") });
          } else if (action === 3 && e.returned === 0n) {
            const a = await f.signed(fan, id, nullifier, Purpose.Join);
            if (pick(2)) await f.c.connect(fan).joinWaitlist(id, nullifier, a.deadline, a.sig);
            else await f.c.connect(fan).joinWaitlistWithEth(id, nullifier, a.deadline, a.sig, { value: ethers.parseEther("0.01") });
          } else if (action === 4 && e.sold > 0n) {
            const ticketId = pick(4);
            let before = await f.c.getTicket(id, ticketId);
            if (before.owner !== ethers.ZeroAddress) {
              const previousOwner = f.fans.find(owner => owner.address === before.owner)!;
              const key = ethers.id(`recover:${seed}:${step}`);
              await f.c.connect(previousOwner).setDoorKey(id, ticketId, key);
              before = await f.c.getTicket(id, ticketId);
              expect(before.doorKey).to.equal(key);
              const a = await f.signed(fan, id, before.nullifier, Purpose.Recover);
              await f.c.connect(fan).recoverTicket(id, ticketId, before.nullifier, a.deadline, a.sig);
              const after = await f.c.getTicket(id, ticketId);
              expect(after.generation).to.equal(before.generation + 1n);
              expect(after.doorKey).to.equal(ethers.ZeroHash);
            }
          }
        } else if (action === 5) await f.c.advanceWaitlist(id);
        for (const ticketId of [0, 1, 2, 3]) expect((await f.c.getTicket(id, ticketId)).seat).to.equal(seenSeats.get(`${id}:${ticketId}`));
        await invariant(f);
      }
      await f.c.cancelEvent(1);
      for (const fan of f.fans) {
        if ((await f.c.ticketOf(1, fan.address)).held || (await f.c.waitlistPositionOf(1, fan.address)).waiting) await f.c.connect(fan).claimRefund(1);
        await invariant(f);
      }
      await time.increaseTo(f.params.endsAt);
      await f.c.withdrawProceeds(2);
      for (const fan of f.fans) {
        const w = await f.c.waitlistPositionOf(2, fan.address);
        if (w.waiting) await f.c.connect(fan).leaveWaitlist(2, w.position);
      }
      await invariant(f);
      expect(await f.token.balanceOf(await f.c.getAddress())).to.equal(0n);
    });
  }

  it("rejects spent signatures even after recovery frees the original wallet", async () => {
    const f = await fixture();
    await f.buy(f.fans[0], 1, 1, 1n);
    const a = await f.signed(f.fans[1], 1, 1n, Purpose.Recover);
    await f.c.connect(f.fans[1]).recoverTicket(1, 0, 1, a.deadline, a.sig);
    const b = await f.signed(f.fans[2], 1, 1n, Purpose.Recover);
    await f.c.connect(f.fans[2]).recoverTicket(1, 0, 1, b.deadline, b.sig);
    await expect(f.c.connect(f.fans[1]).recoverTicket(1, 0, 1, a.deadline, a.sig)).to.be.revertedWithCustomError(f.c, "AttestationSpent");
  });

  it("bounds skipped waiters and preserves the ticket when the scan hits its limit", async () => {
    const f = await fixture();
    const pick = seeded(8550);
    for (let i = 0; i < 4; i++) await f.buy(f.fans[i], 1, i + 1, BigInt(i + 1));
    const abandoned = 65 + pick(12);
    for (let i = 0; i < abandoned; i++) {
      const a = await f.signed(f.fans[4], 1, 100n, Purpose.Join);
      await f.c.connect(f.fans[4]).joinWaitlist(1, 100, a.deadline, a.sig);
      await f.c.connect(f.fans[4]).leaveWaitlist(1, i);
    }
    const a = await f.signed(f.fans[5], 1, 101n, Purpose.Join);
    await f.c.connect(f.fans[5]).joinWaitlist(1, 101, a.deadline, a.sig);
    const second = await f.signed(f.fans[6], 1, 102n, Purpose.Join);
    await f.c.connect(f.fans[6]).joinWaitlist(1, 102, second.deadline, second.sig);
    const before = await f.c.getTicket(1, 0);
    await expect(f.c.connect(f.fans[0]).surrender(1, 0)).to.be.revertedWithCustomError(f.c, "WaitlistBacklog");
    expect(await f.c.getTicket(1, 0)).to.deep.equal(before);
    await f.c.advanceWaitlist(1);
    expect((await f.c.getEventInfo(1)).waitlistCursor).to.equal(64n);
    await f.c.connect(f.fans[0]).surrender(1, 0);
    expect((await f.c.getTicket(1, 0)).seat).to.equal(before.seat);
    expect((await f.c.getTicket(1, 0)).owner).to.equal(f.fans[5].address);
    expect((await f.c.waitlistPositionOf(1, f.fans[6].address)).waiting).to.equal(true);
    await f.c.connect(f.fans[1]).surrender(1, 1);
    expect((await f.c.getTicket(1, 1)).owner).to.equal(f.fans[6].address);
    await invariant(f);
  });
});

describe("contract review fixes", () => {
  for (const buyEth of [false, true]) for (const claimEth of [false, true]) {
    it(`HF-01: reserves returned seats with ${buyEth ? "ETH" : "USDT"} buys and ${claimEth ? "ETH" : "USDT"} claims`, async () => {
      const f = await fixture();
      await f.buy(f.fans[0], 1, 1, 1n, buyEth);
      await f.c.connect(f.fans[0]).surrender(1, 0);
      expect(await f.c.seatsTaken(1, 1, 1)).to.deep.equal([true]);
      const beforeBalance = await f.token.balanceOf(await f.c.getAddress());
      const beforeRouterBalance = await ethers.provider.getBalance(await f.router.getAddress());
      await expect(f.buy(f.fans[1], 1, 1, 2n, buyEth)).to.be.revertedWithCustomError(f.c, "SeatTaken").withArgs(1);
      expect(await f.token.balanceOf(await f.c.getAddress())).to.equal(beforeBalance);
      expect(await ethers.provider.getBalance(await f.router.getAddress())).to.equal(beforeRouterBalance);
      expect(await f.c.nullifierUsed(1, 2)).to.equal(false);
      await invariant(f);
      await f.buy(f.fans[1], 1, 2, 2n, buyEth);
      const a = await f.signed(f.fans[2], 1, 3n, Purpose.Claim);
      if (claimEth) await f.c.connect(f.fans[2]).claimReturnedWithEth(1, 0, 3, a.deadline, a.sig, { value: ethers.parseEther("0.01") });
      else await f.c.connect(f.fans[2]).claimReturned(1, 0, 3, a.deadline, a.sig);
      const original = await f.c.getTicket(1, 0);
      const other = await f.c.getTicket(1, 1);
      expect(original.owner).to.equal(f.fans[2].address);
      expect(original.seat).to.equal(1n);
      expect(other.owner).to.equal(f.fans[1].address);
      expect(other.seat).to.equal(2n);
      expect(await f.c.returnedTickets(1)).to.deep.equal([]);
      await invariant(f);
    });
  }

  for (const eth of [false, true]) {
    it(`rolls back a failed ${eth ? "ETH" : "USDT"} returned claim and accepts the same attestation on retry`, async () => {
      const f = await fixture();
      await f.buy(f.fans[0], 1, 3, 1n);
      await f.c.connect(f.fans[0]).surrender(1, 0);
      const before = await f.c.getTicket(1, 0);
      const a = await f.signed(f.fans[1], 1, 2n, Purpose.Claim);
      if (eth) {
        await expect(f.c.connect(f.fans[1]).claimReturnedWithEth(1, 0, 2, a.deadline, a.sig, { value: 1n })).to.be.reverted;
      } else {
        await f.token.connect(f.fans[1]).approve(await f.c.getAddress(), 0);
        await expect(f.c.connect(f.fans[1]).claimReturned(1, 0, 2, a.deadline, a.sig)).to.be.reverted;
      }
      expect(await f.c.getTicket(1, 0)).to.deep.equal(before);
      expect(await f.c.returnedTickets(1)).to.deep.equal([0n]);
      expect(await f.c.nullifierUsed(1, 2)).to.equal(false);
      expect(await f.c.ticketOf(1, f.fans[1].address)).to.deep.equal([false, 0n]);
      await invariant(f);
      if (eth) await f.c.connect(f.fans[1]).claimReturnedWithEth(1, 0, 2, a.deadline, a.sig, { value: ethers.parseEther("0.01") });
      else {
        await f.token.connect(f.fans[1]).approve(await f.c.getAddress(), FACE);
        await f.c.connect(f.fans[1]).claimReturned(1, 0, 2, a.deadline, a.sig);
      }
      expect((await f.c.getTicket(1, 0)).seat).to.equal(3n);
      expect((await f.c.getTicket(1, 0)).owner).to.equal(f.fans[1].address);
      await invariant(f);
    });
  }

  it("blocks token reentry and rolls a failed payout back so it can be retried", async () => {
    const f = await fixture("HostileToken");
    const attack = f.c.interface.encodeFunctionData("claimRefund", [1]);
    await f.token.configure(await f.c.getAddress(), attack, false, false);
    await f.buy(f.fans[0], 1, 1, 1n);
    expect(await f.token.attempted()).to.equal(true);
    expect(await f.token.entered()).to.equal(false);
    expect(await f.token.callbackResult()).to.equal(ethers.id("ReentrancyGuardReentrantCall()").slice(0, 10));
    await f.c.cancelEvent(1);
    await f.token.configure(await f.c.getAddress(), attack, true, false);
    await expect(f.c.connect(f.fans[0]).claimRefund(1)).to.be.revertedWith("blocked transfer");
    expect((await f.c.getTicket(1, 0)).owner).to.equal(f.fans[0].address);
    expect((await f.c.ledger(1)).proceeds).to.equal(FACE);
    await f.token.configure(await f.c.getAddress(), attack, false, false);
    await f.c.connect(f.fans[0]).claimRefund(1);
    expect(await f.token.balanceOf(await f.c.getAddress())).to.equal(0n);
    expect(await f.token.entered()).to.equal(false);
    expect(await f.token.callbackResult()).to.equal(ethers.id("ReentrancyGuardReentrantCall()").slice(0, 10));
  });

  it("HF-02: a dishonest swap that retains ETH cannot mint or credit proceeds", async () => {
    const f = await fixture("TestUSDT", "HostileRouter");
    await f.router.configure(await f.c.getAddress(), f.c.interface.encodeFunctionData("claimRefund", [1]), true);
    await expect(f.buy(f.fans[0], 1, 1, 1n, true)).to.be.revertedWith("blocked swap");
    expect((await f.c.getEventInfo(1)).minted).to.equal(0n);
    expect(await ethers.provider.getBalance(await f.router.getAddress())).to.equal(0n);
    await f.router.configure(await f.c.getAddress(), f.c.interface.encodeFunctionData("claimRefund", [1]), false);
    // WrongPayment rolls the whole call back, so router storage also reverts; assert outcomes only.
    await expect(f.buy(f.fans[0], 1, 1, 1n, true)).to.be.revertedWithCustomError(f.c, "WrongPayment");
    expect((await f.c.getEventInfo(1)).minted).to.equal(0n);
    expect((await f.c.ledger(1)).proceeds).to.equal(0n);
    expect(await f.token.balanceOf(await f.c.getAddress())).to.equal(0n);
    expect(await ethers.provider.getBalance(await f.router.getAddress())).to.equal(0n);
    expect(await ethers.provider.getBalance(await f.c.getAddress())).to.equal(0n);
  });

  it("HF-03: a token that reports success without moving funds cannot mint", async () => {
    const f = await fixture("HostileToken");
    await f.token.configure(await f.c.getAddress(), f.c.interface.encodeFunctionData("claimRefund", [1]), false, true);
    await expect(f.buy(f.fans[0], 1, 1, 1n)).to.be.revertedWithCustomError(f.c, "WrongPayment");
    expect((await f.c.getEventInfo(1)).minted).to.equal(0n);
    expect((await f.c.ledger(1)).proceeds).to.equal(0n);
    expect(await f.token.balanceOf(await f.c.getAddress())).to.equal(0n);
  });
});
