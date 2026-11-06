// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Houseful} from "../Houseful.sol";

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

    function buy(uint256 id, uint256 nullifier, uint256 deadline, bytes calldata sig) external payable {
        houseful.buy{value: msg.value}(id, nullifier, deadline, sig);
    }

    function joinWaitlist(uint256 id, uint256 nullifier, uint256 deadline, bytes calldata sig) external payable {
        houseful.joinWaitlist{value: msg.value}(id, nullifier, deadline, sig);
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

    receive() external payable {
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
