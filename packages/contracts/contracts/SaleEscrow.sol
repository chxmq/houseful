// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SaleEscrow
/// @notice Per-event ETH ledger shared by every Houseful sale mechanism.
/// @dev Splits each event's balance into two buckets. `proceeds` backs seats that are currently held
/// and is the only bucket a host can ever withdraw. `escrow` backs waitlist deposits and only ever
/// flows back to waiters or funds a seat handed over by surrender. A different primary sale (for
/// example a continuous clearing auction) only needs to override `_salePrice` and call `_collectSale`.
abstract contract SaleEscrow {
    struct Ledger {
        uint256 proceeds;
        uint256 escrow;
    }

    error WrongPayment(uint256 expected, uint256 received);
    error EthTransferFailed();

    mapping(uint256 eventId => Ledger) private _ledgers;

    function _salePrice(uint256 eventId) internal view virtual returns (uint256);

    function _collectSale(uint256 eventId) internal returns (uint256 price) {
        price = _salePrice(eventId);
        if (msg.value != price) revert WrongPayment(price, msg.value);
        _ledgers[eventId].proceeds += price;
    }

    function _collectEscrow(uint256 eventId) internal returns (uint256 amount) {
        amount = _salePrice(eventId);
        if (msg.value != amount) revert WrongPayment(amount, msg.value);
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

    function _send(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, ) = payable(to).call{value: amount}("");
        if (!ok) revert EthTransferFailed();
    }
}
