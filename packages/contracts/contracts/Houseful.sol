// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SaleEscrow} from "./SaleEscrow.sol";

/// @title Houseful
/// @notice Ticket registry where every ticket is bound to one verified human, is sold only at face
/// value, and changes hands only by surrender to the next person on a public waitlist.
/// @dev World ID proofs are verified off-chain by the platform, which then signs an EIP-712
/// `Attestation` with the `verifier` key. Ticket ids are per-event indices starting at 0.
contract Houseful is SaleEscrow, EIP712, Ownable2Step, ReentrancyGuard {
    enum Purpose {
        None,
        Buy,
        Join,
        Claim
    }

    struct EventParams {
        uint256 faceValue;
        uint256 capacity;
        uint64 saleStart;
        uint64 surrenderCutoff;
        uint64 endsAt;
        string metadataURI;
        bytes32 metadataHash;
    }

    struct EventView {
        address host;
        uint256 faceValue;
        uint256 capacity;
        uint64 saleStart;
        uint64 surrenderCutoff;
        uint64 endsAt;
        string metadataURI;
        bytes32 metadataHash;
        uint256 minted;
        uint256 sold;
        uint256 returned;
        uint256 waitlistLength;
        uint256 waitlistActive;
        uint256 waitlistCursor;
        bytes32 waitlistHead;
        bool cancelled;
        bool proceedsWithdrawn;
    }

    struct Waiter {
        address wallet;
        bool active;
        uint256 nullifier;
    }

    struct EventData {
        address host;
        uint64 saleStart;
        uint64 surrenderCutoff;
        uint64 endsAt;
        bool cancelled;
        bool proceedsWithdrawn;
        uint256 faceValue;
        uint256 capacity;
        uint256 minted;
        uint256 sold;
        uint256 waitlistActive;
        uint256 waitlistCursor;
        bytes32 waitlistHead;
        bytes32 metadataHash;
        string metadataURI;
    }

    struct Ticket {
        address owner;
        uint64 generation;
        uint256 nullifier;
        bytes32 doorKey;
    }

    bytes32 public constant ATTESTATION_TYPEHASH =
        keccak256("Attestation(uint256 eventId,uint256 nullifier,address wallet,uint8 purpose,uint256 deadline)");

    address public verifier;
    uint256 public eventCount;

    mapping(uint256 eventId => EventData) private _events;
    mapping(uint256 eventId => mapping(uint256 ticketId => Ticket)) private _tickets;
    mapping(uint256 eventId => mapping(address wallet => uint256)) private _ticketIdPlusOne;
    mapping(uint256 eventId => mapping(uint256 nullifier => bool)) private _nullifierUsed;
    mapping(uint256 eventId => Waiter[]) private _waitlists;
    mapping(uint256 eventId => mapping(address wallet => uint256)) private _waitPositionPlusOne;
    mapping(uint256 eventId => uint256[]) private _returnedIds;
    mapping(uint256 eventId => mapping(uint256 ticketId => uint256)) private _returnedIndexPlusOne;

    event VerifierUpdated(address indexed previousVerifier, address indexed newVerifier);
    event EventCreated(
        uint256 indexed eventId,
        address indexed host,
        uint256 faceValue,
        uint256 capacity,
        uint64 saleStart,
        uint64 surrenderCutoff,
        uint64 endsAt,
        string metadataURI,
        bytes32 metadataHash
    );
    event TicketBought(uint256 indexed eventId, uint256 indexed ticketId, address indexed owner, uint256 nullifier);
    event WaitlistJoined(
        uint256 indexed eventId,
        uint256 indexed position,
        uint256 nullifier,
        address indexed wallet,
        bytes32 head
    );
    event WaitlistLeft(uint256 indexed eventId, uint256 indexed position, address indexed wallet);
    event WaitlistPromoted(uint256 indexed eventId, uint256 indexed position, uint256 indexed ticketId, address wallet);
    event Surrendered(
        uint256 indexed eventId,
        uint256 indexed ticketId,
        address indexed from,
        address to,
        uint256 generation
    );
    event ReturnedClaimed(uint256 indexed eventId, uint256 indexed ticketId, address indexed owner, uint256 nullifier);
    event DoorKeySet(uint256 indexed eventId, uint256 indexed ticketId, address indexed owner, bytes32 doorKey);
    event EventCancelled(uint256 indexed eventId);
    event RefundClaimed(uint256 indexed eventId, address indexed wallet, uint256 amount);
    event ProceedsWithdrawn(uint256 indexed eventId, address indexed host, uint256 amount);

    error SurrenderOnly();
    error ZeroAddress();
    error InvalidCapacity();
    error InvalidSchedule();
    error UnknownEvent(uint256 eventId);
    error UnknownTicket(uint256 eventId, uint256 ticketId);
    error NotHost();
    error NotTicketOwner();
    error NotWaitlistSlotOwner();
    error SaleNotOpen();
    error SoldOut();
    error SeatsAvailable();
    error WaitlistClosed();
    error SurrenderClosed();
    error NotReturned();
    error EventIsCancelled();
    error EventNotCancelled();
    error EventEnded();
    error EventNotEnded();
    error ProceedsAlreadyWithdrawn();
    error NothingToRefund();
    error NullifierUsed();
    error WalletHasTicket();
    error WalletOnWaitlist();
    error AttestationExpired();
    error InvalidAttestation();

    modifier onlyHost(uint256 eventId) {
        if (_existing(eventId).host != msg.sender) revert NotHost();
        _;
    }

    constructor(address verifier_) EIP712("Houseful", "1") Ownable(msg.sender) {
        _setVerifier(verifier_);
    }

    /// @notice Rotates the platform key that signs World ID attestations.
    function setVerifier(address newVerifier) external onlyOwner {
        _setVerifier(newVerifier);
    }

    /// @notice Creates an event. Every policy field is fixed forever once this returns.
    /// @return eventId Sequential id starting at 1.
    function createEvent(EventParams calldata p) external returns (uint256 eventId) {
        if (p.capacity == 0) revert InvalidCapacity();
        if (p.saleStart >= p.surrenderCutoff || p.surrenderCutoff > p.endsAt || p.endsAt <= block.timestamp) {
            revert InvalidSchedule();
        }
        eventId = ++eventCount;
        EventData storage e = _events[eventId];
        e.host = msg.sender;
        e.faceValue = p.faceValue;
        e.capacity = p.capacity;
        e.saleStart = p.saleStart;
        e.surrenderCutoff = p.surrenderCutoff;
        e.endsAt = p.endsAt;
        e.metadataURI = p.metadataURI;
        e.metadataHash = p.metadataHash;
        emit EventCreated(
            eventId,
            msg.sender,
            p.faceValue,
            p.capacity,
            p.saleStart,
            p.surrenderCutoff,
            p.endsAt,
            p.metadataURI,
            p.metadataHash
        );
    }

    /// @notice Buys the next unminted seat at exactly face value.
    /// @param nullifier World ID nullifier hash for this event's action.
    /// @param deadline Last timestamp at which the attestation is valid.
    /// @param signature Verifier EIP-712 signature with purpose Buy.
    function buy(
        uint256 eventId,
        uint256 nullifier,
        uint256 deadline,
        bytes calldata signature
    ) external payable nonReentrant returns (uint256 ticketId) {
        EventData storage e = _existing(eventId);
        _requireSaleOpen(e);
        if (e.minted >= e.capacity) revert SoldOut();
        _admit(eventId, nullifier, Purpose.Buy, deadline, signature);
        _collectSale(eventId);
        ticketId = e.minted++;
        e.sold++;
        _assign(eventId, ticketId, msg.sender, nullifier);
        emit TicketBought(eventId, ticketId, msg.sender, nullifier);
    }

    /// @notice Joins the public waitlist of a sold-out event by escrowing face value.
    /// @param signature Verifier EIP-712 signature with purpose Join.
    function joinWaitlist(
        uint256 eventId,
        uint256 nullifier,
        uint256 deadline,
        bytes calldata signature
    ) external payable nonReentrant returns (uint256 position) {
        EventData storage e = _existing(eventId);
        if (e.cancelled) revert EventIsCancelled();
        if (block.timestamp < e.saleStart || block.timestamp >= e.surrenderCutoff) revert WaitlistClosed();
        if (e.minted < e.capacity || _returnedIds[eventId].length != 0) revert SeatsAvailable();
        _admit(eventId, nullifier, Purpose.Join, deadline, signature);
        _collectEscrow(eventId);
        Waiter[] storage list = _waitlists[eventId];
        position = list.length;
        list.push(Waiter({wallet: msg.sender, active: true, nullifier: nullifier}));
        _waitPositionPlusOne[eventId][msg.sender] = position + 1;
        e.waitlistActive++;
        bytes32 head = keccak256(abi.encode(e.waitlistHead, nullifier, msg.sender));
        e.waitlistHead = head;
        emit WaitlistJoined(eventId, position, nullifier, msg.sender, head);
    }

    /// @notice Leaves the waitlist and refunds the escrowed face value. Works at any time,
    /// including after cancellation or after the event has ended.
    function leaveWaitlist(uint256 eventId, uint256 position) external nonReentrant {
        _existing(eventId);
        Waiter[] storage list = _waitlists[eventId];
        if (position >= list.length) revert NotWaitlistSlotOwner();
        Waiter storage w = list[position];
        if (!w.active || w.wallet != msg.sender) revert NotWaitlistSlotOwner();
        uint256 amount = _refundWaiter(eventId, w);
        _nullifierUsed[eventId][w.nullifier] = false;
        emit WaitlistLeft(eventId, position, msg.sender);
        _send(msg.sender, amount);
    }

    /// @notice Hands a ticket back to the contract for exactly face value. If anyone is waiting,
    /// the oldest active waiter becomes the owner in this same transaction and their escrow funds
    /// the refund. Otherwise the seat joins the returned pool.
    function surrender(uint256 eventId, uint256 ticketId) external nonReentrant {
        EventData storage e = _existing(eventId);
        if (e.cancelled) revert EventIsCancelled();
        if (block.timestamp >= e.surrenderCutoff) revert SurrenderClosed();
        Ticket storage t = _tickets[eventId][ticketId];
        if (t.owner != msg.sender) revert NotTicketOwner();

        uint256 price = _salePrice(eventId);
        delete _ticketIdPlusOne[eventId][msg.sender];
        _nullifierUsed[eventId][t.nullifier] = false;
        t.generation += 1;
        t.doorKey = bytes32(0);

        address to;
        (bool found, uint256 position) = _nextWaiter(eventId, e);
        if (found) {
            Waiter storage w = _waitlists[eventId][position];
            to = w.wallet;
            _deactivateWaiter(eventId, w);
            _escrowToProceeds(eventId, price);
            _assign(eventId, ticketId, to, w.nullifier);
            emit WaitlistPromoted(eventId, position, ticketId, to);
        } else {
            t.owner = address(0);
            t.nullifier = 0;
            e.sold--;
            _returnedIds[eventId].push(ticketId);
            _returnedIndexPlusOne[eventId][ticketId] = _returnedIds[eventId].length;
        }
        _debitProceeds(eventId, price);
        emit Surrendered(eventId, ticketId, msg.sender, to, t.generation);
        _send(msg.sender, price);
    }

    /// @notice Buys a seat from the returned pool at exactly face value.
    /// @param signature Verifier EIP-712 signature with purpose Claim.
    function claimReturned(
        uint256 eventId,
        uint256 ticketId,
        uint256 nullifier,
        uint256 deadline,
        bytes calldata signature
    ) external payable nonReentrant {
        EventData storage e = _existing(eventId);
        _requireSaleOpen(e);
        uint256 indexPlusOne = _returnedIndexPlusOne[eventId][ticketId];
        if (indexPlusOne == 0) revert NotReturned();
        _admit(eventId, nullifier, Purpose.Claim, deadline, signature);
        _collectSale(eventId);
        _removeReturned(eventId, ticketId, indexPlusOne);
        e.sold++;
        _assign(eventId, ticketId, msg.sender, nullifier);
        emit ReturnedClaimed(eventId, ticketId, msg.sender, nullifier);
    }

    /// @notice Registers the ed25519 public key of the device that shows the rotating door QR.
    function setDoorKey(uint256 eventId, uint256 ticketId, bytes32 doorKey) external {
        Ticket storage t = _tickets[eventId][ticketId];
        if (t.owner != msg.sender) revert NotTicketOwner();
        t.doorKey = doorKey;
        emit DoorKeySet(eventId, ticketId, msg.sender, doorKey);
    }

    /// @notice Cancels an event before it ends. Holders and active waiters then pull refunds.
    function cancelEvent(uint256 eventId) external onlyHost(eventId) {
        EventData storage e = _events[eventId];
        if (e.cancelled) revert EventIsCancelled();
        if (block.timestamp >= e.endsAt) revert EventEnded();
        e.cancelled = true;
        emit EventCancelled(eventId);
    }

    /// @notice Pulls the face value refund for the caller's ticket or active waitlist slot on a
    /// cancelled event. Nobody, including the host and the platform, can block it.
    function claimRefund(uint256 eventId) external nonReentrant {
        EventData storage e = _existing(eventId);
        if (!e.cancelled) revert EventNotCancelled();
        uint256 amount;
        uint256 ticketIdPlusOne = _ticketIdPlusOne[eventId][msg.sender];
        uint256 positionPlusOne = _waitPositionPlusOne[eventId][msg.sender];
        if (ticketIdPlusOne != 0) {
            Ticket storage t = _tickets[eventId][ticketIdPlusOne - 1];
            delete _ticketIdPlusOne[eventId][msg.sender];
            t.owner = address(0);
            t.doorKey = bytes32(0);
            t.generation += 1;
            e.sold--;
            amount = _salePrice(eventId);
            _debitProceeds(eventId, amount);
        } else if (positionPlusOne != 0) {
            amount = _refundWaiter(eventId, _waitlists[eventId][positionPlusOne - 1]);
        } else {
            revert NothingToRefund();
        }
        emit RefundClaimed(eventId, msg.sender, amount);
        _send(msg.sender, amount);
    }

    /// @notice Pays the host face value for every seat held at the end of the event. Waitlist
    /// escrow is never included.
    function withdrawProceeds(uint256 eventId) external nonReentrant onlyHost(eventId) {
        EventData storage e = _events[eventId];
        if (e.cancelled) revert EventIsCancelled();
        if (block.timestamp < e.endsAt) revert EventNotEnded();
        if (e.proceedsWithdrawn) revert ProceedsAlreadyWithdrawn();
        e.proceedsWithdrawn = true;
        uint256 amount = _drainProceeds(eventId);
        emit ProceedsWithdrawn(eventId, msg.sender, amount);
        _send(msg.sender, amount);
    }

    /// @notice Tickets cannot be transferred. Use surrender.
    function transferFrom(address, address, uint256) external pure {
        revert SurrenderOnly();
    }

    /// @notice Tickets cannot be transferred. Use surrender.
    function safeTransferFrom(address, address, uint256) external pure {
        revert SurrenderOnly();
    }

    /// @notice Tickets cannot be transferred. Use surrender.
    function safeTransferFrom(address, address, uint256, bytes calldata) external pure {
        revert SurrenderOnly();
    }

    /// @notice Tickets cannot be approved for transfer. Use surrender.
    function approve(address, uint256) external pure {
        revert SurrenderOnly();
    }

    /// @notice Tickets cannot be approved for transfer. Use surrender.
    function setApprovalForAll(address, bool) external pure {
        revert SurrenderOnly();
    }

    /// @notice Full event policy and live counters.
    function getEventInfo(uint256 eventId) external view returns (EventView memory v) {
        EventData storage e = _existing(eventId);
        v.host = e.host;
        v.faceValue = e.faceValue;
        v.capacity = e.capacity;
        v.saleStart = e.saleStart;
        v.surrenderCutoff = e.surrenderCutoff;
        v.endsAt = e.endsAt;
        v.metadataURI = e.metadataURI;
        v.metadataHash = e.metadataHash;
        v.minted = e.minted;
        v.sold = e.sold;
        v.returned = _returnedIds[eventId].length;
        v.waitlistLength = _waitlists[eventId].length;
        v.waitlistActive = e.waitlistActive;
        v.waitlistCursor = e.waitlistCursor;
        v.waitlistHead = e.waitlistHead;
        v.cancelled = e.cancelled;
        v.proceedsWithdrawn = e.proceedsWithdrawn;
    }

    /// @notice Ticket state. `generation` increases on every surrender or refund and revokes older
    /// door credentials. A zero owner means the seat is in the returned pool or was refunded.
    function getTicket(
        uint256 eventId,
        uint256 ticketId
    ) external view returns (address owner, uint256 nullifier, uint256 generation, bytes32 doorKey) {
        if (ticketId >= _existing(eventId).minted) revert UnknownTicket(eventId, ticketId);
        Ticket storage t = _tickets[eventId][ticketId];
        return (t.owner, t.nullifier, t.generation, t.doorKey);
    }

    /// @notice The ticket a wallet holds for an event, if any.
    function ticketOf(uint256 eventId, address wallet) external view returns (bool held, uint256 ticketId) {
        uint256 idPlusOne = _ticketIdPlusOne[eventId][wallet];
        return idPlusOne == 0 ? (false, 0) : (true, idPlusOne - 1);
    }

    /// @notice The active waitlist slot a wallet occupies for an event, if any.
    function waitlistPositionOf(uint256 eventId, address wallet) external view returns (bool waiting, uint256 position) {
        uint256 posPlusOne = _waitPositionPlusOne[eventId][wallet];
        return posPlusOne == 0 ? (false, 0) : (true, posPlusOne - 1);
    }

    /// @notice A page of the waitlist in join order, including inactive slots.
    function getWaitlist(uint256 eventId, uint256 offset, uint256 limit) external view returns (Waiter[] memory page) {
        Waiter[] storage list = _waitlists[eventId];
        uint256 len = list.length;
        if (offset >= len) return new Waiter[](0);
        uint256 end = offset + limit > len ? len : offset + limit;
        page = new Waiter[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = list[i];
        }
    }

    /// @notice Hash chain over every join: head = keccak256(abi.encode(prevHead, nullifier, wallet)).
    function waitlistHead(uint256 eventId) external view returns (bytes32) {
        return _events[eventId].waitlistHead;
    }

    function waitlistLength(uint256 eventId) external view returns (uint256) {
        return _waitlists[eventId].length;
    }

    /// @notice Seats currently held by a wallet.
    function soldCount(uint256 eventId) external view returns (uint256) {
        return _events[eventId].sold;
    }

    /// @notice Seats in the returned pool, claimable via claimReturned.
    function returnedCount(uint256 eventId) external view returns (uint256) {
        return _returnedIds[eventId].length;
    }

    function returnedTickets(uint256 eventId) external view returns (uint256[] memory) {
        return _returnedIds[eventId];
    }

    /// @notice True while the nullifier holds a ticket or an active waitlist slot for the event.
    function nullifierUsed(uint256 eventId, uint256 nullifier) external view returns (bool) {
        return _nullifierUsed[eventId][nullifier];
    }

    /// @notice ETH backing held seats (`proceeds`) and waitlist deposits (`escrow`) for an event.
    function ledger(uint256 eventId) external view returns (uint256 proceeds, uint256 escrow) {
        Ledger memory l = _ledger(eventId);
        return (l.proceeds, l.escrow);
    }

    /// @notice EIP-712 digest the verifier signs for an attestation.
    function attestationDigest(
        uint256 eventId,
        uint256 nullifier,
        address wallet,
        Purpose purpose,
        uint256 deadline
    ) public view returns (bytes32) {
        return
            _hashTypedDataV4(
                keccak256(abi.encode(ATTESTATION_TYPEHASH, eventId, nullifier, wallet, uint8(purpose), deadline))
            );
    }

    function _salePrice(uint256 eventId) internal view override returns (uint256) {
        return _events[eventId].faceValue;
    }

    function _setVerifier(address newVerifier) private {
        if (newVerifier == address(0)) revert ZeroAddress();
        emit VerifierUpdated(verifier, newVerifier);
        verifier = newVerifier;
    }

    function _existing(uint256 eventId) private view returns (EventData storage e) {
        e = _events[eventId];
        if (e.host == address(0)) revert UnknownEvent(eventId);
    }

    function _requireSaleOpen(EventData storage e) private view {
        if (e.cancelled) revert EventIsCancelled();
        if (block.timestamp < e.saleStart || block.timestamp >= e.endsAt) revert SaleNotOpen();
    }

    function _admit(
        uint256 eventId,
        uint256 nullifier,
        Purpose purpose,
        uint256 deadline,
        bytes calldata signature
    ) private {
        if (block.timestamp > deadline) revert AttestationExpired();
        if (_nullifierUsed[eventId][nullifier]) revert NullifierUsed();
        if (_ticketIdPlusOne[eventId][msg.sender] != 0) revert WalletHasTicket();
        if (_waitPositionPlusOne[eventId][msg.sender] != 0) revert WalletOnWaitlist();
        bytes32 digest = attestationDigest(eventId, nullifier, msg.sender, purpose, deadline);
        (address signer, ECDSA.RecoverError err, ) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError || signer != verifier) revert InvalidAttestation();
        _nullifierUsed[eventId][nullifier] = true;
    }

    function _assign(uint256 eventId, uint256 ticketId, address owner, uint256 nullifier) private {
        Ticket storage t = _tickets[eventId][ticketId];
        t.owner = owner;
        t.nullifier = nullifier;
        t.doorKey = bytes32(0);
        _ticketIdPlusOne[eventId][owner] = ticketId + 1;
    }

    function _nextWaiter(uint256 eventId, EventData storage e) private returns (bool found, uint256 position) {
        Waiter[] storage list = _waitlists[eventId];
        uint256 len = list.length;
        uint256 cursor = e.waitlistCursor;
        while (cursor < len && !list[cursor].active) cursor++;
        found = cursor < len;
        position = cursor;
        e.waitlistCursor = found ? cursor + 1 : cursor;
    }

    function _deactivateWaiter(uint256 eventId, Waiter storage w) private {
        w.active = false;
        delete _waitPositionPlusOne[eventId][w.wallet];
        _events[eventId].waitlistActive--;
    }

    function _refundWaiter(uint256 eventId, Waiter storage w) private returns (uint256 amount) {
        _deactivateWaiter(eventId, w);
        amount = _salePrice(eventId);
        _debitEscrow(eventId, amount);
    }

    function _removeReturned(uint256 eventId, uint256 ticketId, uint256 indexPlusOne) private {
        uint256[] storage ids = _returnedIds[eventId];
        uint256 lastId = ids[ids.length - 1];
        ids[indexPlusOne - 1] = lastId;
        _returnedIndexPlusOne[eventId][lastId] = indexPlusOne;
        ids.pop();
        delete _returnedIndexPlusOne[eventId][ticketId];
    }
}
