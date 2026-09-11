// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {FlyVerifier} from "./FlyVerifier.sol";

/// @title FlyMarket
/// @notice A parimutuel market on a verifiable fly run: "will this genome reach
///         the food on this task?" Bettors stake on YES / NO before the run is
///         finalized. Settlement reads the TRUTH from `FlyVerifier` — the same
///         `reached` flag that was committed and (optimistically or succinctly)
///         verified — so the market cannot be settled on a result nobody can
///         reproduce. Winners split the whole pool pro-rata.
///
/// @dev    This is the "bet on the fly" layer fused with the "verifiable
///         inference" layer: the oracle is not a person, it is a reproducible
///         computation whose outcome is slashing-backed on-chain.
contract FlyMarket {
    FlyVerifier public immutable verifier;
    uint256 public constant FEE_BPS = 200; // 2% to treasury
    address public immutable treasury;

    struct Pool {
        uint128 yes; // total staked on "reached == true"
        uint128 no; // total staked on "reached == false"
        bool settled;
        bool outcome; // final reached value
    }

    mapping(uint256 => Pool) public pools; // runId => pool
    mapping(uint256 => mapping(address => uint256)) public yesStake;
    mapping(uint256 => mapping(address => uint256)) public noStake;
    mapping(uint256 => mapping(address => bool)) public claimed;

    event Bet(uint256 indexed runId, address indexed who, bool side, uint256 amount);
    event Settled(uint256 indexed runId, bool outcome, uint256 pool);
    event Claimed(uint256 indexed runId, address indexed who, uint256 payout);

    error Closed();
    error NotFinal();
    error Nothing();
    error AlreadyClaimed();

    constructor(FlyVerifier _verifier, address _treasury) {
        verifier = _verifier;
        treasury = _treasury;
    }

    /// @notice Stake on whether the run will be found to have reached the food.
    ///         Only allowed while the underlying run is still Pending/Challenged.
    function bet(uint256 runId, bool side) external payable {
        require(msg.value > 0, "zero");
        FlyVerifier.Run memory r = verifier.getRun(runId);
        // betting closes once the claim is resolved either way
        if (
            r.status == FlyVerifier.Status.Finalized ||
            r.status == FlyVerifier.Status.Rejected
        ) revert Closed();
        Pool storage p = pools[runId];
        if (side) {
            p.yes += uint128(msg.value);
            yesStake[runId][msg.sender] += msg.value;
        } else {
            p.no += uint128(msg.value);
            noStake[runId][msg.sender] += msg.value;
        }
        emit Bet(runId, msg.sender, side, msg.value);
    }

    /// @notice Lock in the outcome from the verifier once the run is Finalized.
    function settle(uint256 runId) external {
        Pool storage p = pools[runId];
        require(!p.settled, "done");
        FlyVerifier.Run memory r = verifier.getRun(runId);
        if (r.status != FlyVerifier.Status.Finalized) revert NotFinal();
        p.settled = true;
        p.outcome = r.reached;
        emit Settled(runId, r.reached, uint256(p.yes) + p.no);
    }

    /// @notice Claim winnings pro-rata from the pool after settlement.
    function claim(uint256 runId) external {
        Pool storage p = pools[runId];
        if (!p.settled) revert NotFinal();
        if (claimed[runId][msg.sender]) revert AlreadyClaimed();

        uint256 mine = p.outcome ? yesStake[runId][msg.sender] : noStake[runId][msg.sender];
        if (mine == 0) revert Nothing();

        uint256 winningPool = p.outcome ? p.yes : p.no;
        uint256 total = uint256(p.yes) + p.no;
        uint256 gross = (total * mine) / winningPool;
        uint256 fee = (gross * FEE_BPS) / 10_000;
        uint256 payout = gross - fee;

        claimed[runId][msg.sender] = true;
        if (fee > 0) {
            (bool f, ) = treasury.call{value: fee}("");
            require(f, "fee");
        }
        (bool ok, ) = msg.sender.call{value: payout}("");
        require(ok, "pay");
        emit Claimed(runId, msg.sender, payout);
    }

    function odds(uint256 runId) external view returns (uint256 yes, uint256 no) {
        Pool memory p = pools[runId];
        return (p.yes, p.no);
    }
}
