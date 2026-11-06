// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Minimal WETH address placeholder for local tests. The mock router treats native ETH as input.
contract WethMock {
    string public name = "Wrapped Ether";
    string public symbol = "WETH";
    uint8 public decimals = 18;
    receive() external payable {}
}
