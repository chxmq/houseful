import "dotenv/config";
import "@nomicfoundation/hardhat-toolbox";
import type { HardhatUserConfig } from "hardhat/config";

const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: { chainId: 31337 },
    localhost: { url: process.env.LOCAL_RPC_URL ?? "http://127.0.0.1:8545", chainId: 31337 },
    worldchainSepolia: {
      url: process.env.WORLDCHAIN_SEPOLIA_RPC_URL ?? "https://worldchain-sepolia.g.alchemy.com/public",
      chainId: 4801,
      accounts: deployerKey ? [deployerKey] : [],
    },
    unichainSepolia: {
      url: process.env.UNICHAIN_SEPOLIA_RPC_URL ?? "https://sepolia.unichain.org",
      chainId: 1301,
      accounts: deployerKey ? [deployerKey] : [],
    },
  },
  gasReporter: { enabled: process.env.REPORT_GAS === "true" },
  typechain: { outDir: "typechain-types", target: "ethers-v6" },
};

export default config;
