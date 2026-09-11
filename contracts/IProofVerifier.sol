// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IProofVerifier
/// @notice The pluggable ZK slot. A production backend (SP1 / RISC0 / Halo2)
///         deploys a verifier implementing this interface; `FlyVerifier` calls
///         it to finalize a run instantly, without anyone re-executing the fly.
/// @dev    Until such a backend exists, `FlyVerifier` falls back to OPTIMISTIC
///         settlement (challenge window + re-run + slash). This interface is the
///         seam where the "hello world of verifiable inference" becomes succinct.
interface IProofVerifier {
    /// @return ok true iff `proof` attests that executing the connectome
    ///         committed by `genomeRoot` on the episode committed by
    ///         `episodeHash` produces exactly `transcriptRoot` and `reached`.
    function verifyRun(
        bytes32 genomeRoot,
        bytes32 episodeHash,
        bytes32 transcriptRoot,
        bool reached,
        bytes calldata proof
    ) external view returns (bool ok);
}
