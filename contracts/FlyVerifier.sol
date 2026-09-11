// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IProofVerifier} from "./IProofVerifier.sol";

/// @title FlyVerifier
/// @notice On-chain registry for verifiable CIPHERFLY inference runs.
///
/// A "run" is a claim that executing a deterministic connectome (`genomeRoot`)
/// on a committed task (`episodeHash`) yields a specific hash-chain of per-tick
/// state commitments (`transcriptRoot`) and a specific outcome (`reached`).
///
/// The compute itself never happens on-chain — it is far too large. This
/// contract settles *which claims are true*, two ways:
///
///   1. OPTIMISTIC (live today): a claimer bonds a stake. Anyone can re-run the
///      identical deterministic engine off-chain; if the transcript differs,
///      they `challenge()` with a bond. Disputes are resolved by a succinct
///      proof when available, else by the arbiter during the training-wheels
///      phase. Unchallenged claims finalize after `challengePeriod` and the
///      bond is returned. Liars are slashed.
///
///   2. SUCCINCT (when `proofVerifier` is set): a claimer or challenger submits
///      a ZK proof; `IProofVerifier` checks it in O(1) and the claim finalizes
///      immediately. This is the endgame that removes the arbiter entirely.
contract FlyVerifier {
    enum Status {
        None,
        Pending, // bonded, inside challenge window
        Challenged, // disputed, awaiting resolution
        Finalized, // accepted as true
        Rejected // proven false; claimer slashed
    }

    struct Run {
        address claimer;
        bytes32 genomeRoot;
        bytes32 episodeHash;
        bytes32 transcriptRoot;
        bool reached;
        uint96 bond;
        uint64 submittedAt;
        Status status;
        address challenger;
        uint96 challengeBond;
        bytes32 counterRoot; // challenger's recomputed transcript
    }

    address public immutable arbiter; // training-wheels dispute resolver
    IProofVerifier public proofVerifier; // address(0) until a ZK backend exists
    uint256 public challengePeriod = 1 hours;
    uint256 public minBond = 0.001 ether;

    uint256 public nextRunId;
    mapping(uint256 => Run) public runs;

    event RunSubmitted(
        uint256 indexed runId,
        address indexed claimer,
        bytes32 genomeRoot,
        bytes32 episodeHash,
        bytes32 transcriptRoot,
        bool reached
    );
    event RunChallenged(uint256 indexed runId, address indexed challenger, bytes32 counterRoot);
    event RunFinalized(uint256 indexed runId, bool reached, bool viaProof);
    event RunRejected(uint256 indexed runId, address loser);
    event ProofVerifierSet(address verifier);

    error BadBond();
    error BadStatus();
    error TooEarly();
    error NotArbiter();
    error NoVerifier();
    error ProofInvalid();
    error SameRoot();

    constructor(address _arbiter) {
        arbiter = _arbiter;
    }

    /// @notice Register a run claim, bonding `msg.value >= minBond`.
    function submitRun(
        bytes32 genomeRoot,
        bytes32 episodeHash,
        bytes32 transcriptRoot,
        bool reached
    ) external payable returns (uint256 runId) {
        if (msg.value < minBond) revert BadBond();
        runId = nextRunId++;
        runs[runId] = Run({
            claimer: msg.sender,
            genomeRoot: genomeRoot,
            episodeHash: episodeHash,
            transcriptRoot: transcriptRoot,
            reached: reached,
            bond: uint96(msg.value),
            submittedAt: uint64(block.timestamp),
            status: Status.Pending,
            challenger: address(0),
            challengeBond: 0,
            counterRoot: bytes32(0)
        });
        emit RunSubmitted(runId, msg.sender, genomeRoot, episodeHash, transcriptRoot, reached);
    }

    /// @notice Dispute a pending run by posting your own recomputed transcript
    ///         root and a matching bond. You got `counterRoot` by re-running the
    ///         same deterministic engine; if it differs from the claim, one of
    ///         you is wrong and resolution will slash them.
    function challenge(uint256 runId, bytes32 counterRoot) external payable {
        Run storage r = runs[runId];
        if (r.status != Status.Pending) revert BadStatus();
        if (block.timestamp > r.submittedAt + challengePeriod) revert TooEarly(); // window closed
        if (msg.value < r.bond) revert BadBond();
        if (counterRoot == r.transcriptRoot) revert SameRoot();
        r.status = Status.Challenged;
        r.challenger = msg.sender;
        r.challengeBond = uint96(msg.value);
        r.counterRoot = counterRoot;
        emit RunChallenged(runId, msg.sender, counterRoot);
    }

    /// @notice Finalize an unchallenged run after the window; returns the bond.
    function finalize(uint256 runId) external {
        Run storage r = runs[runId];
        if (r.status != Status.Pending) revert BadStatus();
        if (block.timestamp <= r.submittedAt + challengePeriod) revert TooEarly();
        r.status = Status.Finalized;
        _pay(r.claimer, r.bond);
        emit RunFinalized(runId, r.reached, false);
    }

    /// @notice Settle any run (pending or challenged) with a succinct proof.
    ///         Requires a wired `proofVerifier`. The proof decides truth; the
    ///         honest party collects both bonds.
    function resolveWithProof(uint256 runId, bytes calldata proof) external {
        Run storage r = runs[runId];
        if (r.status != Status.Pending && r.status != Status.Challenged) revert BadStatus();
        if (address(proofVerifier) == address(0)) revert NoVerifier();
        bool claimTrue = proofVerifier.verifyRun(
            r.genomeRoot,
            r.episodeHash,
            r.transcriptRoot,
            r.reached,
            proof
        );
        if (claimTrue) {
            r.status = Status.Finalized;
            _pay(r.claimer, uint256(r.bond) + r.challengeBond);
            emit RunFinalized(runId, r.reached, true);
        } else {
            r.status = Status.Rejected;
            // challenger (if any) is vindicated and takes the pot
            address winner = r.challenger == address(0) ? arbiter : r.challenger;
            _pay(winner, uint256(r.bond) + r.challengeBond);
            emit RunRejected(runId, r.claimer);
        }
    }

    /// @notice Training-wheels resolver for a challenged run, used only while no
    ///         ZK backend is wired. `claimerWins` says whose transcript the
    ///         arbiter re-ran and confirmed. Removed once `proofVerifier` is set.
    function resolveByArbiter(uint256 runId, bool claimerWins) external {
        if (msg.sender != arbiter) revert NotArbiter();
        if (address(proofVerifier) != address(0)) revert BadStatus(); // use proofs instead
        Run storage r = runs[runId];
        if (r.status != Status.Challenged) revert BadStatus();
        uint256 pot = uint256(r.bond) + r.challengeBond;
        if (claimerWins) {
            r.status = Status.Finalized;
            _pay(r.claimer, pot);
            emit RunFinalized(runId, r.reached, false);
        } else {
            r.status = Status.Rejected;
            _pay(r.challenger, pot);
            emit RunRejected(runId, r.claimer);
        }
    }

    /// @notice Wire (or upgrade) the succinct verifier. Only the arbiter, who is
    ///         expected to be a governance/multisig, can do this. Setting it is
    ///         the moment the system sheds its training wheels.
    function setProofVerifier(address v) external {
        if (msg.sender != arbiter) revert NotArbiter();
        proofVerifier = IProofVerifier(v);
        emit ProofVerifierSet(v);
    }

    function getRun(uint256 runId) external view returns (Run memory) {
        return runs[runId];
    }

    function _pay(address to, uint256 amount) private {
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "pay failed");
    }
}
