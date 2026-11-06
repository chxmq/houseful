import hre from "hardhat";
import { exportAbi } from "./lib/exportAbi";

async function main() {
  await hre.run("compile", { quiet: true });
  const file = await exportAbi(hre);
  console.log(`Wrote ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
