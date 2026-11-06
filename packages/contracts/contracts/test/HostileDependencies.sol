// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Test fixtures only. Callback failures may be swallowed or propagated.
contract HostileToken is ERC20 {
    address public callbackTarget;
    bytes public payload;
    bool public attempted;
    bool public entered;
    bytes public callbackResult;
    bool public failTransfers;
    bool public skipTransfers;

    constructor() ERC20("Hostile test token", "BAD") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function configure(address callbackTarget_, bytes calldata payload_, bool fail_, bool skip_) external {
        callbackTarget = callbackTarget_;
        payload = payload_;
        failTransfers = fail_;
        skipTransfers = skip_;
        attempted = false;
        entered = false;
    }
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && callbackTarget != address(0)) {
            require(!failTransfers, "blocked transfer");
            attempted = true;
            (entered, callbackResult) = callbackTarget.call(payload);
            if (skipTransfers) return;
        }
        super._update(from, to, value);
    }
}

contract HostileRouter {
    address public callbackTarget;
    bytes public payload;
    bool public attempted;
    bool public entered;
    bytes public callbackResult;
    bool public failSwap;
    function configure(address callbackTarget_, bytes calldata payload_, bool fail_) external {
        callbackTarget = callbackTarget_;
        payload = payload_;
        failSwap = fail_;
    }
    function multicall(bytes[] calldata) external payable returns (bytes[] memory results) {
        attempted = true;
        (entered, callbackResult) = callbackTarget.call(payload);
        require(!failSwap, "blocked swap");
        // Deliberately retain ETH and deliver no output.
        return new bytes[](2);
    }
}
