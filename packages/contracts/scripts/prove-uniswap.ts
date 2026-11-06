/**
 * Live proof: create a tiny seated=false event, buyWithEth through SwapRouter02,
 * print the Uniscan link. Requires deployments/1301.json and a funded deployer.
 */
import hre, { ethers } from "hardhat";
import { readDeployments } from "./lib/exportAbi";

const EXPLORER = "https://sepolia.uniscan.xyz";

async function main() {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const d = (await readDeployments())[chainId];
  if (!d?.address || !d.usdt || !d.quoter || !d.weth) {
    throw new Error(`Missing deployment for chain ${chainId}`);
  }

  const [buyer] = await ethers.getSigners();
  if (!buyer) throw new Error("No signer");
  const houseful = await ethers.getContractAt("Houseful", d.address, buyer);
  const usdt = await ethers.getContractAt("TestUSDT", d.usdt, buyer);

  const faceValue = 10n * 10n ** 6n; // 10 USDT
  const now = Math.floor(Date.now() / 1000);
  const createTx = await houseful.createEvent({
    faceValue,
    capacity: 5,
    seated: false,
    saleStart: now - 60,
    surrenderCutoff: now + 7 * 86_400,
    endsAt: now + 14 * 86_400,
    metadataURI: "houseful:prove-uniswap",
    metadataHash: ethers.ZeroHash,
  });
  const createReceipt = await createTx.wait();
  const created = createReceipt!.logs
    .map((log) => {
      try {
        return houseful.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((p) => p?.name === "EventCreated");
  const eventId = created!.args.eventId as bigint;
  console.log(`created event #${eventId}`);

  // Attestation from verifier key (env) or Hardhat-style key matching deployment verifier.
  const verifierKey = process.env.VERIFIER_PRIVATE_KEY ?? process.env.ATTESTER_PRIVATE_KEY;
  if (!verifierKey) throw new Error("Set VERIFIER_PRIVATE_KEY or ATTESTER_PRIVATE_KEY");
  const verifier = new ethers.Wallet(verifierKey, ethers.provider);
  if ((await houseful.verifier()).toLowerCase() !== verifier.address.toLowerCase()) {
    throw new Error(`Verifier mismatch: contract ${await houseful.verifier()} vs key ${verifier.address}`);
  }

  const nullifier = BigInt(ethers.hexlify(ethers.randomBytes(31)));
  const deadline = BigInt(now + 600);
  const domain = {
    name: "Houseful",
    version: "1",
    chainId,
    verifyingContract: d.address,
  };
  const types = {
    Attestation: [
      { name: "eventId", type: "uint256" },
      { name: "nullifier", type: "uint256" },
      { name: "wallet", type: "address" },
      { name: "purpose", type: "uint8" },
      { name: "deadline", type: "uint256" },
    ],
  };
  const sig = await verifier.signTypedData(domain, types, {
    eventId,
    nullifier,
    wallet: buyer.address,
    purpose: 1,
    deadline,
  });

  // Quote via QuoterV2
  const quoter = new ethers.Contract(
    d.quoter,
    [
      "function quoteExactOutputSingle((address tokenIn, address tokenOut, uint256 amount, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountIn, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
    ],
    ethers.provider,
  );
  let amountIn: bigint;
  try {
    const result = await quoter.quoteExactOutputSingle.staticCall({
      tokenIn: d.weth,
      tokenOut: d.usdt,
      amount: faceValue,
      fee: d.poolFee ?? 3000,
      sqrtPriceLimitX96: 0,
    });
    amountIn = result[0] as bigint;
    console.log(`QuoterV2 amountIn ${ethers.formatEther(amountIn)} ETH for ${faceValue} USDT units`);
  } catch (err) {
    console.error("QuoterV2 failed", err);
    throw err;
  }

  const value = amountIn + (amountIn * 2n) / 100n;
  const before = await usdt.balanceOf(d.address);
  const tx = await houseful.buyWithEth(eventId, 0, nullifier, deadline, sig, { value });
  const receipt = await tx.wait();
  if (receipt!.status !== 1) throw new Error("buyWithEth reverted");
  const after = await usdt.balanceOf(d.address);
  console.log(`buyWithEth tx ${receipt!.hash}`);
  console.log(`Houseful USDT before ${before} after ${after}`);
  console.log(`explorer ${EXPLORER}/tx/${receipt!.hash}`);

  const bought = receipt!.logs
    .map((log) => {
      try {
        return houseful.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((p) => p?.name === "TicketBought");
  if (!bought) throw new Error("buyWithEth mined but TicketBought was missing");
  console.log(
    `ticket ${bought.args.ticketId} owner ${bought.args.owner} seat ${bought.args.seat} (+${after - before} USDT units)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
