import hre, { ethers } from "hardhat";
import { exportAbi, writeDeployment } from "./lib/exportAbi";

const LOCAL_VERIFIER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

function resolveVerifier(chainId: number): string {
  const explicit = process.env.VERIFIER_ADDRESS;
  if (explicit) return ethers.getAddress(explicit);
  const key = process.env.VERIFIER_PRIVATE_KEY;
  if (key) return new ethers.Wallet(key).address;
  if (chainId === 31337) {
    const address = new ethers.Wallet(LOCAL_VERIFIER_KEY).address;
    console.log(`No verifier configured. Using Hardhat account #1 (${address}) as the local verifier.`);
    console.log(`Set VERIFIER_PRIVATE_KEY=${LOCAL_VERIFIER_KEY} in the web app to sign local attestations.`);
    return address;
  }
  throw new Error("Set VERIFIER_ADDRESS or VERIFIER_PRIVATE_KEY");
}

async function main() {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployer account. Set DEPLOYER_PRIVATE_KEY.");
  const verifier = resolveVerifier(chainId);

  console.log(`Deploying Houseful to chain ${chainId} from ${deployer.address}`);
  const houseful = await ethers.deployContract("Houseful", [verifier], deployer);
  const receipt = await houseful.deploymentTransaction()?.wait();
  await houseful.waitForDeployment();
  const address = await houseful.getAddress();

  const file = await writeDeployment(chainId, {
    address,
    verifier,
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
