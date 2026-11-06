// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title MockSwapRouter
/// @notice Test-only SwapRouter02 stand-in at a fixed 1 ETH = 3,000 USDT (6 decimals).
/// @dev Fund this contract with USDT before swaps. `multicall` accepts native ETH and runs
/// `exactOutputSingle` then `refundETH`, matching the production Houseful path.
contract MockSwapRouter {
    using SafeERC20 for IERC20;

    uint256 public constant USDT_PER_ETH = 3_000e6;

    struct ExactOutputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountOut;
        uint256 amountInMaximum;
        uint160 sqrtPriceLimitX96;
    }

    IERC20 public immutable usdt;
    address public immutable weth;

    error InsufficientOutputLiquidity();
    error ExcessiveInputAmount();
    error EthTransferFailed();
    error UnknownCall();

    constructor(address usdt_, address weth_) {
        usdt = IERC20(usdt_);
        weth = weth_;
    }

    receive() external payable {}

    function exactOutputSingle(ExactOutputSingleParams calldata) external payable returns (uint256) {
        revert UnknownCall();
    }

    function refundETH() external payable {
        revert UnknownCall();
    }

    function multicall(bytes[] calldata data) external payable returns (bytes[] memory results) {
        results = new bytes[](data.length);
        uint256 ethLeft = msg.value;
        for (uint256 i = 0; i < data.length; i++) {
            bytes4 sel = bytes4(data[i]);
            if (sel == this.exactOutputSingle.selector) {
                ExactOutputSingleParams memory params = abi.decode(data[i][4:], (ExactOutputSingleParams));
                uint256 amountIn = _ethInForUsdtOut(params.amountOut);
                if (amountIn > params.amountInMaximum || amountIn > ethLeft) revert ExcessiveInputAmount();
                if (usdt.balanceOf(address(this)) < params.amountOut) revert InsufficientOutputLiquidity();
                usdt.safeTransfer(params.recipient, params.amountOut);
                ethLeft -= amountIn;
                results[i] = abi.encode(amountIn);
            } else if (sel == this.refundETH.selector) {
                uint256 amount = ethLeft;
                ethLeft = 0;
                if (amount > 0) {
                    (bool ok, ) = payable(msg.sender).call{value: amount}("");
                    if (!ok) revert EthTransferFailed();
                }
                results[i] = bytes("");
            } else {
                revert UnknownCall();
            }
        }
        if (ethLeft > 0) {
            (bool ok, ) = payable(msg.sender).call{value: ethLeft}("");
            if (!ok) revert EthTransferFailed();
        }
    }

    function _ethInForUsdtOut(uint256 amountOut) private pure returns (uint256) {
        return (amountOut * 1e18 + USDT_PER_ETH - 1) / USDT_PER_ETH;
    }
}
