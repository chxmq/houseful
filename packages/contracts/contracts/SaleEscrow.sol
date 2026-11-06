// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title SaleEscrow
/// @notice Per-event USDT ledger shared by every Houseful sale mechanism.
/// @dev `proceeds` backs held seats and is the only bucket a host can withdraw.
/// `escrow` backs waitlist deposits and only flows back to waiters or funds a
/// seat handed over by surrender.
abstract contract SaleEscrow {
    using SafeERC20 for IERC20;

    struct Ledger {
        uint256 proceeds;
        uint256 escrow;
    }

    error WrongPayment(uint256 expected, uint256 received);

    IERC20 internal immutable _usdt;
    mapping(uint256 eventId => Ledger) private _ledgers;

    constructor(address usdt_) {
        _usdt = IERC20(usdt_);
    }

    function _salePrice(uint256 eventId) internal view virtual returns (uint256);

    function _collectSale(uint256 eventId) internal returns (uint256 price) {
        price = _salePrice(eventId);
        _usdt.safeTransferFrom(msg.sender, address(this), price);
        _ledgers[eventId].proceeds += price;
    }

    function _collectSaleFromBalance(uint256 eventId) internal returns (uint256 price) {
        price = _salePrice(eventId);
        _ledgers[eventId].proceeds += price;
    }

    function _collectEscrow(uint256 eventId) internal returns (uint256 amount) {
        amount = _salePrice(eventId);
        _usdt.safeTransferFrom(msg.sender, address(this), amount);
        _ledgers[eventId].escrow += amount;
    }

    function _collectEscrowFromBalance(uint256 eventId) internal returns (uint256 amount) {
        amount = _salePrice(eventId);
        _ledgers[eventId].escrow += amount;
    }

    function _escrowToProceeds(uint256 eventId, uint256 amount) internal {
        Ledger storage l = _ledgers[eventId];
        l.escrow -= amount;
        l.proceeds += amount;
    }

    function _debitProceeds(uint256 eventId, uint256 amount) internal {
        _ledgers[eventId].proceeds -= amount;
    }

    function _debitEscrow(uint256 eventId, uint256 amount) internal {
        _ledgers[eventId].escrow -= amount;
    }

    function _drainProceeds(uint256 eventId) internal returns (uint256 amount) {
        amount = _ledgers[eventId].proceeds;
        _ledgers[eventId].proceeds = 0;
    }

    function _ledger(uint256 eventId) internal view returns (Ledger memory) {
        return _ledgers[eventId];
    }

    function _sendUsdt(address to, uint256 amount) internal {
        if (amount == 0) return;
        _usdt.safeTransfer(to, amount);
    }
}
