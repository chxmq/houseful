// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SaleEscrow} from "./SaleEscrow.sol";

interface ISwapRouter02 {
    struct ExactOutputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountOut;
        uint256 amountInMaximum;
        uint160 sqrtPriceLimitX96;
    }

    function exactOutputSingle(ExactOutputSingleParams calldata params) external payable returns (uint256 amountIn);
    function refundETH() external payable;
    function multicall(bytes[] calldata data) external payable returns (bytes[] memory results);
}

/// @title Houseful
/// @notice Ticket registry where every ticket is bound to one verified human, sold only at face
/// value in USDT, and changes hands only by surrender to the next person on a public waitlist.
/// @dev World ID proofs are verified off-chain. The platform signs an EIP-712 Attestation. Fans may
/// pay in USDT or in ETH swapped through Uniswap SwapRouter02 inside the same transaction.
contract Houseful is SaleEscrow, EIP712, Ownable2Step, ReentrancyGuard {
    enum Purpose {
        None,
        Buy,
        Join,
        Claim,
        Recover
    }

    struct EventParams {
        uint256 faceValue;
        uint256 capacity;
        bool seated;
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
        bool seated;
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
        bool seated;
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
        uint32 seat;
        uint256 nullifier;
        bytes32 doorKey;
    }

    bytes32 public constant ATTESTATION_TYPEHASH =
        keccak256("Attestation(uint256 eventId,uint256 nullifier,address wallet,uint8 purpose,uint256 deadline)");

    /// @notice Most waitlist slots a surrender will step over looking for the next active waiter.
    uint256 public constant WAITLIST_SCAN_LIMIT = 64;

    address public verifier;
    address public immutable usdt;
    address public immutable swapRouter;
    address public immutable weth;
    uint24 public immutable poolFee;
    uint256 public eventCount;

    mapping(uint256 eventId => EventData) private _events;
    mapping(uint256 eventId => mapping(uint256 ticketId => Ticket)) private _tickets;
    mapping(uint256 eventId => mapping(address wallet => uint256)) private _ticketIdPlusOne;
    mapping(uint256 eventId => mapping(uint256 nullifier => bool)) private _nullifierUsed;
    mapping(uint256 eventId => Waiter[]) private _waitlists;
    mapping(uint256 eventId => mapping(address wallet => uint256)) private _waitPositionPlusOne;
    mapping(uint256 eventId => uint256[]) private _returnedIds;
    mapping(uint256 eventId => mapping(uint256 ticketId => uint256)) private _returnedIndexPlusOne;
    mapping(uint256 eventId => mapping(uint32 seat => uint256)) private _seatTicketIdPlusOne;
    mapping(bytes32 digest => bool) private _attestationSpent;

    event VerifierUpdated(address indexed previousVerifier, address indexed newVerifier);
    event EventCreated(
        uint256 indexed eventId,
        address indexed host,
        uint256 faceValue,
        uint256 capacity,
        bool seated,
        uint64 saleStart,
        uint64 surrenderCutoff,
        uint64 endsAt,
        string metadataURI,
        bytes32 metadataHash
    );
    event TicketBought(
        uint256 indexed eventId,
        uint256 indexed ticketId,
        address indexed owner,
        uint32 seat,
        uint256 nullifier
    );
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
    event ReturnedClaimed(
        uint256 indexed eventId,
        uint256 indexed ticketId,
        address indexed owner,
        uint32 seat,
        uint256 nullifier
    );
    event TicketRecovered(
        uint256 indexed eventId,
        uint256 indexed ticketId,
        address indexed to,
        uint256 generation
    );
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
    error AttestationSpent();
    error InvalidAttestation();
    error WaitlistBacklog();
    error SeatTaken(uint32 seat);
    error InvalidSeat(uint32 seat);
    error WrongNullifier();
    error EthTransferFailed();

    modifier onlyHost(uint256 eventId) {
        if (_existing(eventId).host != msg.sender) revert NotHost();
        _;
    }

    constructor(
        address verifier_,
        address usdt_,
        address swapRouter_,
        address weth_,
        uint24 poolFee_
    ) SaleEscrow(usdt_) EIP712("Houseful", "1") Ownable(msg.sender) {
        if (usdt_ == address(0) || swapRouter_ == address(0) || weth_ == address(0)) revert ZeroAddress();
        usdt = usdt_;
        swapRouter = swapRouter_;
        weth = weth_;
        poolFee = poolFee_;
        _setVerifier(verifier_);
    }

    receive() external payable {}

    function setVerifier(address newVerifier) external onlyOwner {
        _setVerifier(newVerifier);
    }

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
        e.seated = p.seated;
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
            p.seated,
            p.saleStart,
            p.surrenderCutoff,
            p.endsAt,
            p.metadataURI,
            p.metadataHash
        );
    }

    function buy(
        uint256 eventId,
        uint32 seat,
        uint256 nullifier,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant returns (uint256 ticketId) {
        EventData storage e = _existing(eventId);
        _requireSaleOpen(e);
        if (e.minted >= e.capacity) revert SoldOut();
        _admit(eventId, nullifier, Purpose.Buy, deadline, signature);
        _collectSale(eventId);
        ticketId = e.minted++;
        e.sold++;
        _assign(eventId, ticketId, msg.sender, nullifier, _requireSeat(e, eventId, seat));
        emit TicketBought(eventId, ticketId, msg.sender, _tickets[eventId][ticketId].seat, nullifier);
    }

    function buyWithEth(
        uint256 eventId,
        uint32 seat,
        uint256 nullifier,
        uint256 deadline,
        bytes calldata signature
    ) external payable nonReentrant returns (uint256 ticketId) {
        EventData storage e = _existing(eventId);
        _requireSaleOpen(e);
        if (e.minted >= e.capacity) revert SoldOut();
        _admit(eventId, nullifier, Purpose.Buy, deadline, signature);
        _swapEthForFaceValue(e.faceValue);
        _collectSaleFromBalance(eventId);
        ticketId = e.minted++;
        e.sold++;
        _assign(eventId, ticketId, msg.sender, nullifier, _requireSeat(e, eventId, seat));
        emit TicketBought(eventId, ticketId, msg.sender, _tickets[eventId][ticketId].seat, nullifier);
    }

    function joinWaitlist(
        uint256 eventId,
        uint256 nullifier,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant returns (uint256 position) {
        EventData storage e = _existing(eventId);
        if (e.cancelled) revert EventIsCancelled();
        if (block.timestamp < e.saleStart || block.timestamp >= e.surrenderCutoff) revert WaitlistClosed();
        if (e.minted < e.capacity || _returnedIds[eventId].length != 0) revert SeatsAvailable();
        _admit(eventId, nullifier, Purpose.Join, deadline, signature);
        _collectEscrow(eventId);
        position = _pushWaiter(eventId, e, nullifier);
    }

    function joinWaitlistWithEth(
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
        _swapEthForFaceValue(e.faceValue);
        _collectEscrowFromBalance(eventId);
        position = _pushWaiter(eventId, e, nullifier);
    }

    function advanceWaitlist(uint256 eventId) external {
        EventData storage e = _existing(eventId);
        Waiter[] storage list = _waitlists[eventId];
        uint256 len = list.length;
        uint256 cursor = e.waitlistCursor;
        uint256 stop = cursor + WAITLIST_SCAN_LIMIT < len ? cursor + WAITLIST_SCAN_LIMIT : len;
        while (cursor < stop && !list[cursor].active) cursor++;
        e.waitlistCursor = cursor;
    }

    function leaveWaitlist(uint256 eventId, uint256 position) external nonReentrant {
        _existing(eventId);
        Waiter[] storage list = _waitlists[eventId];
        if (position >= list.length) revert NotWaitlistSlotOwner();
        Waiter storage w = list[position];
        if (!w.active || w.wallet != msg.sender) revert NotWaitlistSlotOwner();
        uint256 amount = _refundWaiter(eventId, w);
        _nullifierUsed[eventId][w.nullifier] = false;
        emit WaitlistLeft(eventId, position, msg.sender);
        _sendUsdt(msg.sender, amount);
    }

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
            _assign(eventId, ticketId, to, w.nullifier, t.seat);
            emit WaitlistPromoted(eventId, position, ticketId, to);
        } else {
            if (t.seat != 0) delete _seatTicketIdPlusOne[eventId][t.seat];
            t.owner = address(0);
            t.nullifier = 0;
            e.sold--;
            _returnedIds[eventId].push(ticketId);
            _returnedIndexPlusOne[eventId][ticketId] = _returnedIds[eventId].length;
        }
        _debitProceeds(eventId, price);
        emit Surrendered(eventId, ticketId, msg.sender, to, t.generation);
        _sendUsdt(msg.sender, price);
    }

    function claimReturned(
        uint256 eventId,
        uint256 ticketId,
        uint256 nullifier,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant {
        EventData storage e = _existing(eventId);
        _requireSaleOpen(e);
        uint256 indexPlusOne = _returnedIndexPlusOne[eventId][ticketId];
        if (indexPlusOne == 0) revert NotReturned();
        _admit(eventId, nullifier, Purpose.Claim, deadline, signature);
        _collectSale(eventId);
        _removeReturned(eventId, ticketId, indexPlusOne);
        e.sold++;
        uint32 seat = _tickets[eventId][ticketId].seat;
        _assign(eventId, ticketId, msg.sender, nullifier, seat);
        emit ReturnedClaimed(eventId, ticketId, msg.sender, seat, nullifier);
    }

    function claimReturnedWithEth(
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
        _swapEthForFaceValue(e.faceValue);
        _collectSaleFromBalance(eventId);
        _removeReturned(eventId, ticketId, indexPlusOne);
        e.sold++;
        uint32 seat = _tickets[eventId][ticketId].seat;
        _assign(eventId, ticketId, msg.sender, nullifier, seat);
        emit ReturnedClaimed(eventId, ticketId, msg.sender, seat, nullifier);
    }

    function recoverTicket(
        uint256 eventId,
        uint256 ticketId,
        uint256 nullifier,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant {
        _existing(eventId);
        Ticket storage t = _tickets[eventId][ticketId];
        if (ticketId >= _events[eventId].minted) revert UnknownTicket(eventId, ticketId);
        if (t.owner == address(0)) revert UnknownTicket(eventId, ticketId);
        if (t.nullifier != nullifier) revert WrongNullifier();
        if (_ticketIdPlusOne[eventId][msg.sender] != 0) revert WalletHasTicket();
        if (_waitPositionPlusOne[eventId][msg.sender] != 0) revert WalletOnWaitlist();
        if (block.timestamp > deadline) revert AttestationExpired();
        bytes32 digest = attestationDigest(eventId, nullifier, msg.sender, Purpose.Recover, deadline);
        if (_attestationSpent[digest]) revert AttestationSpent();
        (address signer, ECDSA.RecoverError err, ) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError || signer != verifier) revert InvalidAttestation();
        _attestationSpent[digest] = true;

        address previous = t.owner;
        delete _ticketIdPlusOne[eventId][previous];
        t.owner = msg.sender;
        t.generation += 1;
        t.doorKey = bytes32(0);
        _ticketIdPlusOne[eventId][msg.sender] = ticketId + 1;
        emit TicketRecovered(eventId, ticketId, msg.sender, t.generation);
    }

    function setDoorKey(uint256 eventId, uint256 ticketId, bytes32 doorKey) external {
        Ticket storage t = _tickets[eventId][ticketId];
        if (t.owner != msg.sender) revert NotTicketOwner();
        if (t.doorKey != bytes32(0) && t.doorKey != doorKey) t.generation += 1;
        t.doorKey = doorKey;
        emit DoorKeySet(eventId, ticketId, msg.sender, doorKey);
    }

    function cancelEvent(uint256 eventId) external onlyHost(eventId) {
        EventData storage e = _events[eventId];
        if (e.cancelled) revert EventIsCancelled();
        if (block.timestamp >= e.endsAt) revert EventEnded();
        e.cancelled = true;
        emit EventCancelled(eventId);
    }

    function claimRefund(uint256 eventId) external nonReentrant {
        EventData storage e = _existing(eventId);
        if (!e.cancelled) revert EventNotCancelled();
        uint256 amount;
        uint256 ticketIdPlusOne = _ticketIdPlusOne[eventId][msg.sender];
        uint256 positionPlusOne = _waitPositionPlusOne[eventId][msg.sender];
        if (ticketIdPlusOne != 0) {
            Ticket storage t = _tickets[eventId][ticketIdPlusOne - 1];
            delete _ticketIdPlusOne[eventId][msg.sender];
            if (t.seat != 0) delete _seatTicketIdPlusOne[eventId][t.seat];
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
        _sendUsdt(msg.sender, amount);
    }

    function withdrawProceeds(uint256 eventId) external nonReentrant onlyHost(eventId) {
        EventData storage e = _events[eventId];
        if (e.cancelled) revert EventIsCancelled();
        if (block.timestamp < e.endsAt) revert EventNotEnded();
        if (e.proceedsWithdrawn) revert ProceedsAlreadyWithdrawn();
        e.proceedsWithdrawn = true;
        uint256 amount = _drainProceeds(eventId);
        emit ProceedsWithdrawn(eventId, msg.sender, amount);
        _sendUsdt(msg.sender, amount);
    }

    function transferFrom(address, address, uint256) external pure {
        revert SurrenderOnly();
    }

    function safeTransferFrom(address, address, uint256) external pure {
        revert SurrenderOnly();
    }

    function safeTransferFrom(address, address, uint256, bytes calldata) external pure {
        revert SurrenderOnly();
    }

    function approve(address, uint256) external pure {
        revert SurrenderOnly();
    }

    function setApprovalForAll(address, bool) external pure {
        revert SurrenderOnly();
    }

    function getEventInfo(uint256 eventId) external view returns (EventView memory v) {
        EventData storage e = _existing(eventId);
        v.host = e.host;
        v.faceValue = e.faceValue;
        v.capacity = e.capacity;
        v.seated = e.seated;
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

    function getTicket(
        uint256 eventId,
        uint256 ticketId
    ) external view returns (address owner, uint256 nullifier, uint256 generation, bytes32 doorKey, uint32 seat) {
        if (ticketId >= _existing(eventId).minted) revert UnknownTicket(eventId, ticketId);
        Ticket storage t = _tickets[eventId][ticketId];
        return (t.owner, t.nullifier, t.generation, t.doorKey, t.seat);
    }

    function seatsTaken(uint256 eventId, uint32 fromSeat, uint32 count) external view returns (bool[] memory flags) {
        EventData storage e = _existing(eventId);
        flags = new bool[](count);
        for (uint32 i = 0; i < count; i++) {
            uint32 seat = fromSeat + i;
            flags[i] = _seatTicketIdPlusOne[eventId][seat] != 0;
            if (!e.seated) flags[i] = false;
        }
    }

    function ticketOf(uint256 eventId, address wallet) external view returns (bool held, uint256 ticketId) {
        uint256 idPlusOne = _ticketIdPlusOne[eventId][wallet];
        return idPlusOne == 0 ? (false, 0) : (true, idPlusOne - 1);
    }

    function waitlistPositionOf(uint256 eventId, address wallet) external view returns (bool waiting, uint256 position) {
        uint256 posPlusOne = _waitPositionPlusOne[eventId][wallet];
        return posPlusOne == 0 ? (false, 0) : (true, posPlusOne - 1);
    }

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

    function waitlistHead(uint256 eventId) external view returns (bytes32) {
        return _events[eventId].waitlistHead;
    }

    function waitlistLength(uint256 eventId) external view returns (uint256) {
        return _waitlists[eventId].length;
    }

    function soldCount(uint256 eventId) external view returns (uint256) {
        return _events[eventId].sold;
    }

    function returnedCount(uint256 eventId) external view returns (uint256) {
        return _returnedIds[eventId].length;
    }

    function returnedTickets(uint256 eventId) external view returns (uint256[] memory) {
        return _returnedIds[eventId];
    }

    function nullifierUsed(uint256 eventId, uint256 nullifier) external view returns (bool) {
        return _nullifierUsed[eventId][nullifier];
    }

    function ledger(uint256 eventId) external view returns (uint256 proceeds, uint256 escrow) {
        Ledger memory l = _ledger(eventId);
        return (l.proceeds, l.escrow);
    }

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

    function _requireSeat(EventData storage e, uint256 eventId, uint32 seat) private view returns (uint32) {
        if (!e.seated) {
            if (seat != 0) revert InvalidSeat(seat);
            return 0;
        }
        if (seat == 0 || seat > e.capacity) revert InvalidSeat(seat);
        if (_seatTicketIdPlusOne[eventId][seat] != 0) revert SeatTaken(seat);
        return seat;
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
        if (_attestationSpent[digest]) revert AttestationSpent();
        (address signer, ECDSA.RecoverError err, ) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError || signer != verifier) revert InvalidAttestation();
        _attestationSpent[digest] = true;
        _nullifierUsed[eventId][nullifier] = true;
    }

    function _assign(uint256 eventId, uint256 ticketId, address owner, uint256 nullifier, uint32 seat) private {
        Ticket storage t = _tickets[eventId][ticketId];
        t.owner = owner;
        t.nullifier = nullifier;
        t.doorKey = bytes32(0);
        t.seat = seat;
        _ticketIdPlusOne[eventId][owner] = ticketId + 1;
        if (seat != 0) _seatTicketIdPlusOne[eventId][seat] = ticketId + 1;
    }

    function _pushWaiter(uint256 eventId, EventData storage e, uint256 nullifier) private returns (uint256 position) {
        Waiter[] storage list = _waitlists[eventId];
        position = list.length;
        list.push(Waiter({wallet: msg.sender, active: true, nullifier: nullifier}));
        _waitPositionPlusOne[eventId][msg.sender] = position + 1;
        e.waitlistActive++;
        bytes32 head = keccak256(abi.encode(e.waitlistHead, nullifier, msg.sender));
        e.waitlistHead = head;
        emit WaitlistJoined(eventId, position, nullifier, msg.sender, head);
    }

    function _nextWaiter(uint256 eventId, EventData storage e) private returns (bool found, uint256 position) {
        Waiter[] storage list = _waitlists[eventId];
        uint256 len = list.length;
        uint256 cursor = e.waitlistCursor;
        uint256 stop = cursor + WAITLIST_SCAN_LIMIT < len ? cursor + WAITLIST_SCAN_LIMIT : len;
        while (cursor < stop && !list[cursor].active) cursor++;
        if (cursor == stop && stop < len) revert WaitlistBacklog();
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

    function _swapEthForFaceValue(uint256 faceValue) private {
        bytes[] memory data = new bytes[](2);
        data[0] = abi.encodeWithSelector(
            ISwapRouter02.exactOutputSingle.selector,
            ISwapRouter02.ExactOutputSingleParams({
                tokenIn: weth,
                tokenOut: usdt,
                fee: poolFee,
                recipient: address(this),
                amountOut: faceValue,
                amountInMaximum: msg.value,
                sqrtPriceLimitX96: 0
            })
        );
        data[1] = abi.encodeWithSelector(ISwapRouter02.refundETH.selector);
        ISwapRouter02(swapRouter).multicall{value: msg.value}(data);
        uint256 dust = address(this).balance;
        if (dust > 0) {
            (bool ok, ) = payable(msg.sender).call{value: dust}("");
            if (!ok) revert EthTransferFailed();
        }
    }
}
