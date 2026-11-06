// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Houseful} from "../Houseful.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Reenters Houseful when it receives USDT (via CallbackUSDT) or leftover ETH from buyWithEth.
contract ReentrantHolder {
    enum Mode {
        None,
        ClaimRefund,
        Surrender,
        LeaveWaitlist
    }

    Houseful public immutable houseful;
    Mode public mode;
    uint256 public eventId;
    uint256 public arg;
    uint256 public reentryAttempts;
    uint256 public reentrySuccesses;
    bytes public lastRevert;

    constructor(Houseful houseful_) {
        houseful = houseful_;
    }

    function arm(Mode mode_, uint256 eventId_, uint256 arg_) external {
        mode = mode_;
        eventId = eventId_;
        arg = arg_;
    }

    function buy(uint256 id, uint32 seat, uint256 nullifier, uint256 deadline, bytes calldata sig) external {
        houseful.buy(id, seat, nullifier, deadline, sig);
    }

    function joinWaitlist(uint256 id, uint256 nullifier, uint256 deadline, bytes calldata sig) external {
        houseful.joinWaitlist(id, nullifier, deadline, sig);
    }

    function claimRefund(uint256 id) external {
        houseful.claimRefund(id);
    }

    function surrender(uint256 id, uint256 ticketId) external {
        houseful.surrender(id, ticketId);
    }

    function leaveWaitlist(uint256 id, uint256 position) external {
        houseful.leaveWaitlist(id, position);
    }

    function onTokenReceived(address, uint256) external {
        _reenter();
    }

    receive() external payable {
        _reenter();
    }

    function _reenter() private {
        if (mode == Mode.None) return;
        Mode m = mode;
        mode = Mode.None;
        reentryAttempts++;
        bytes memory data;
        if (m == Mode.ClaimRefund) data = abi.encodeCall(Houseful.claimRefund, (eventId));
        else if (m == Mode.Surrender) data = abi.encodeCall(Houseful.surrender, (eventId, arg));
        else data = abi.encodeCall(Houseful.leaveWaitlist, (eventId, arg));
        (bool ok, bytes memory ret) = address(houseful).call(data);
        if (ok) reentrySuccesses++;
        else lastRevert = ret;
    }
}

/// @dev Mints like TestUSDT but notifies `to` on every transfer.
contract CallbackUSDT {
    string public name = "Callback USDT";
    string public symbol = "USDT";
    uint8 public decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        return _transfer(msg.sender, to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        return _transfer(from, to, amount);
    }

    function _transfer(address from, address to, uint256 amount) private returns (bool) {
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        if (to.code.length > 0) {
            try ReentrantHolder(payable(to)).onTokenReceived(from, amount) {} catch {}
        }
        return true;
    }
}
