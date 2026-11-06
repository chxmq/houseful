/**
 * Create and seed a WETH/USDT 0.3% Uniswap v3 pool at 1 ETH = 3,000 USDT
 * through NonfungiblePositionManager on Unichain Sepolia.
 */
import { ethers } from "hardhat";

const NPM = "0xB7F724d6dDDFd008eFf5cc2834edDE5F9eF0d075";
const FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
const WETH = "0x4200000000000000000000000000000000000006";
const FEE = 3000;

function sqrtBig(value: bigint): bigint {
  if (value < 0n) throw new Error("negative");
  if (value < 2n) return value;
  let z = value;
  let x = value / 2n + 1n;
  while (x < z) {
    z = x;
    x = (value / x + x) / 2n;
  }
  return z;
}

/** sqrt(amount1/amount0) * 2^96 */
function encodeSqrtRatioX96(amount1: bigint, amount0: bigint): bigint {
  return sqrtBig((amount1 << 192n) / amount0);
}

const npmAbi = [
  "function createAndInitializePoolIfNecessary(address token0, address token1, uint24 fee, uint160 sqrtPriceX96) payable returns (address pool)",
  "function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
];

const factoryAbi = ["function getPool(address,address,uint24) view returns (address)"];
const erc20Abi = [
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function mint(address,uint256)",
  "function decimals() view returns (uint8)",
];
const wethAbi = ["function deposit() payable", "function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"];

async function main() {
  const usdtAddr = process.env.USDT_ADDRESS;
  if (!usdtAddr) throw new Error("Set USDT_ADDRESS to the deployed TestUSDT");

  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployer");

  const tokenA = ethers.getAddress(WETH);
  const tokenB = ethers.getAddress(usdtAddr);
  const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA];

  // Seed sizes: 1 ETH and 3,000 USDT.
  const ethAmount = ethers.parseEther("1");
  const usdtAmount = 3000n * 10n ** 6n;

  let amount0Desired: bigint;
  let amount1Desired: bigint;
  let sqrtPriceX96: bigint;
  if (token0 === tokenA) {
    // token0 = WETH, token1 = USDT. price = USDT/WETH raw = 3000e6 / 1e18
    amount0Desired = ethAmount;
    amount1Desired = usdtAmount;
    sqrtPriceX96 = encodeSqrtRatioX96(usdtAmount, ethAmount);
  } else {
    // token0 = USDT, token1 = WETH. price = WETH/USDT raw = 1e18 / 3000e6
    amount0Desired = usdtAmount;
    amount1Desired = ethAmount;
    sqrtPriceX96 = encodeSqrtRatioX96(ethAmount, usdtAmount);
  }

  console.log({ token0, token1, sqrtPriceX96: sqrtPriceX96.toString(), amount0Desired: amount0Desired.toString(), amount1Desired: amount1Desired.toString() });

  const factory = new ethers.Contract(FACTORY, factoryAbi, deployer);
  let pool: string = await factory.getPool(token0, token1, FEE);
  console.log("existing pool", pool);

  const npm = new ethers.Contract(NPM, npmAbi, deployer);
  if (pool === ethers.ZeroAddress) {
    const tx = await npm.createAndInitializePoolIfNecessary(token0, token1, FEE, sqrtPriceX96);
    const receipt = await tx.wait();
    for (let i = 0; i < 10; i++) {
      pool = await factory.getPool(token0, token1, FEE);
      if (pool !== ethers.ZeroAddress) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    console.log("created pool", pool, "tx", receipt.hash);
  }

  const usdt = new ethers.Contract(usdtAddr, erc20Abi, deployer);
  const weth = new ethers.Contract(WETH, wethAbi, deployer);

  // Ensure balances.
  const usdtBal = await usdt.balanceOf(deployer.address);
  if (usdtBal < usdtAmount) {
    await (await usdt.mint(deployer.address, usdtAmount - usdtBal)).wait();
  }
  const wethBal = await weth.balanceOf(deployer.address);
  if (wethBal < ethAmount) {
    await (await weth.deposit({ value: ethAmount - wethBal })).wait();
  }

  await (await usdt.approve(NPM, usdtAmount)).wait();
  await (await weth.approve(NPM, ethAmount)).wait();

  // Full range ticks for 0.3% fee (tick spacing 60): -887220 to 887220
  const tickLower = -887220;
  const tickUpper = 887220;
  const deadline = Math.floor(Date.now() / 1000) + 600;

  const mintTx = await npm.mint({
    token0,
    token1,
    fee: FEE,
    tickLower,
    tickUpper,
    amount0Desired,
    amount1Desired,
    amount0Min: 0,
    amount1Min: 0,
    recipient: deployer.address,
    deadline,
  });
  const mintReceipt = await mintTx.wait();
  console.log("minted liquidity tx", mintReceipt.hash);
  console.log("pool", pool);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
