import hre, { ethers } from "hardhat";
import { exportAbi, writeDeployment } from "./lib/exportAbi";

const LOCAL_VERIFIER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const POOL_FEE = 3000;

function resolveVerifier(chainId: number): string {
  const explicit = process.env.VERIFIER_ADDRESS;
  if (explicit) return ethers.getAddress(explicit);
  const key = process.env.VERIFIER_PRIVATE_KEY;
  if (key) return new ethers.Wallet(key).address;
  if (chainId === 31337) {
    const address = new ethers.Wallet(LOCAL_VERIFIER_KEY).address;
    console.log(`No verifier configured. Using Hardhat account #1 (${address}) as the local verifier.`);
    return address;
  }
  throw new Error("Set VERIFIER_ADDRESS or VERIFIER_PRIVATE_KEY");
}

async function main() {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployer account. Set DEPLOYER_PRIVATE_KEY.");
  const verifier = resolveVerifier(chainId);

  let usdt: string;
  let swapRouter: string;
  let weth: string;
  let quoter = process.env.QUOTER_ADDRESS ?? ethers.ZeroAddress;

  if (chainId === 31337) {
    const token = await ethers.deployContract("TestUSDT", deployer);
    await token.waitForDeployment();
    usdt = await token.getAddress();
    const wethMock = await ethers.deployContract("WethMock", deployer);
    await wethMock.waitForDeployment();
    weth = await wethMock.getAddress();
    const router = await ethers.deployContract("MockSwapRouter", [usdt, weth], deployer);
    await router.waitForDeployment();
    swapRouter = await router.getAddress();
    await (await token.mint(swapRouter, 10_000_000n * 10n ** 6n)).wait();
    console.log(`Local TestUSDT ${usdt}, WETH ${weth}, MockSwapRouter ${swapRouter}`);
  } else {
    usdt = process.env.USDT_ADDRESS ? ethers.getAddress(process.env.USDT_ADDRESS) : "";
    swapRouter = process.env.SWAP_ROUTER_ADDRESS
      ? ethers.getAddress(process.env.SWAP_ROUTER_ADDRESS)
      : "0xd1AAE39293221B77B0C71fBD6dCb7Ea29Bb5B166";
    weth = process.env.WETH_ADDRESS
      ? ethers.getAddress(process.env.WETH_ADDRESS)
      : "0x4200000000000000000000000000000000000006";
    quoter = process.env.QUOTER_ADDRESS
      ? ethers.getAddress(process.env.QUOTER_ADDRESS)
      : "0x6Dd37329A1A225a6Fca658265D460423DCafBF89";
    if (!usdt) {
      const token = await ethers.deployContract("TestUSDT", deployer);
      await token.waitForDeployment();
      usdt = await token.getAddress();
      console.log(`Deployed TestUSDT at ${usdt}`);
    }
  }

  console.log(`Deploying Houseful to chain ${chainId} from ${deployer.address}`);
  const houseful = await ethers.deployContract("Houseful", [verifier, usdt, swapRouter, weth, POOL_FEE], deployer);
  const receipt = await houseful.deploymentTransaction()?.wait();
  await houseful.waitForDeployment();
  const address = await houseful.getAddress();

  const file = await writeDeployment(chainId, {
    address,
    verifier,
    usdt,
    swapRouter,
    quoter,
    weth,
    poolFee: POOL_FEE,
    blockNumber: receipt?.blockNumber ?? (await ethers.provider.getBlockNumber()),
  });
  console.log(`Houseful deployed at ${address} (verifier ${verifier})`);
  console.log(`Wrote ${file}`);
  console.log(`Wrote ${await exportAbi(hre)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
