// VERIFLY — commitment + proof pipeline.
//
// Turns a deterministic FlyRun into a verifiable claim:
//
//   genomeRoot  = sha256( connectome structure )      -> the canonical fly id
//   stateCommit = sha256( neuron state + world pose )  -> per tick
//   transcript  = hash-chain over every tick commit    -> one 32-byte receipt
//
// A RunClaim is what gets posted on-chain (see contracts/FlyVerifier.sol). It is
// tiny (a few hashes + the episode params). Anyone can VERIFY it by re-running
// the identical deterministic engine and checking the transcript root matches —
// that is the optimistic path, live today. The ZK path (verifyZk) swaps the
// re-run for a succinct validity proof; its verifier is a pluggable slot.

import { buildConnectome, defaultEpisode, defaultGenome, FlyRun } from "./engine";
import type { Episode, Genome } from "./engine";

// sha256 over bytes -> 0x-prefixed hex. Web Crypto is present in modern
// browsers AND Node >= 18 (globalThis.crypto.subtle), so one path works in both.
async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  const b = new Uint8Array(digest);
  let s = "0x";
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
  return s;
}

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

// big-endian int32 (two's complement) — matches Solidity abi.encodePacked(int32[])
function encodeInt32Array(arr: Int32Array): Uint8Array {
  const out = new Uint8Array(arr.length * 4);
  const dv = new DataView(out.buffer);
  for (let i = 0; i < arr.length; i++) dv.setInt32(i * 4, arr[i], false);
  return out;
}

// ----------------------------------------------------------------------------
// genomeRoot — canonical identity of a fly's wiring.
// ----------------------------------------------------------------------------
export async function genomeRoot(genome: Genome): Promise<string> {
  const c = buildConnectome(genome);
  const header = Int32Array.from([
    genome.seed | 0,
    genome.nSensory,
    genome.nInter,
    genome.nMotor,
    genome.fanIn,
    c.N,
  ]);
  const bytes = concat(
    concat(encodeInt32Array(header), encodeInt32Array(c.postPtr)),
    concat(encodeInt32Array(c.edgeSrc), encodeInt32Array(c.edgeW))
  );
  return sha256(bytes);
}

// per-tick commitment over the full neuron state + the world pose.
async function stateCommit(run: FlyRun): Promise<string> {
  const pose = Int32Array.from([run.x, run.y, run.heading, run.tick]);
  return sha256(concat(encodeInt32Array(run.state), encodeInt32Array(pose)));
}

export interface ProofBundle {
  version: string;
  genomeRoot: string;
  episode: Episode;
  startCommit: string;
  endCommit: string;
  transcriptRoot: string; // hash-chain over all tick commits
  ticksUsed: number;
  reached: boolean; // did the fly reach the food?
  finalDist: number;
  // the zk slot — empty under optimistic mode; filled by a real prover backend.
  zk: { scheme: string; proof: string; ready: boolean };
}

export interface ProveProgress {
  tick: number;
  maxTicks: number;
}

// Build a full proof bundle by running the episode headless and hash-chaining
// every tick commitment. onTick lets the UI animate while this runs.
export async function proveEpisode(
  ep: Episode,
  onTick?: (p: ProveProgress) => void
): Promise<ProofBundle> {
  const run = new FlyRun(ep);
  const gRoot = await genomeRoot(ep.genome);

  const startCommit = await stateCommit(run);
  // chain seed binds the genome + start state
  let chain = await sha256(concat(hexToBytes(gRoot), hexToBytes(startCommit)));

  while (!run.done) {
    run.step();
    const c = await stateCommit(run);
    chain = await sha256(concat(hexToBytes(chain), hexToBytes(c)));
    if (onTick) onTick({ tick: run.tick, maxTicks: ep.maxTicks });
  }

  const endCommit = await stateCommit(run);
  return {
    version: "verifly/1",
    genomeRoot: gRoot,
    episode: ep,
    startCommit,
    endCommit,
    transcriptRoot: chain,
    ticksUsed: run.tick,
    reached: run.reached,
    finalDist: run.dist,
    zk: { scheme: "none", proof: "0x", ready: false },
  };
}

export interface VerifyResult {
  ok: boolean;
  recomputedRoot: string;
  claimedRoot: string;
  reachedMatches: boolean;
  reason: string;
}

// OPTIMISTIC verification (live today): re-run the identical deterministic
// engine from the bundle's episode and confirm the transcript root matches.
// This is what a challenger does on-chain to slash a false claim.
export async function verifyEpisode(bundle: ProofBundle): Promise<VerifyResult> {
  const fresh = await proveEpisode(bundle.episode);
  const ok = fresh.transcriptRoot === bundle.transcriptRoot;
  const reachedMatches = fresh.reached === bundle.reached;
  return {
    ok: ok && reachedMatches,
    recomputedRoot: fresh.transcriptRoot,
    claimedRoot: bundle.transcriptRoot,
    reachedMatches,
    reason: !ok
      ? "transcript root mismatch, claimed run does not reproduce"
      : !reachedMatches
      ? "outcome flag does not match the rerun"
      : "reran the whole thing, commitments match",
  };
}

// ZK verification — the pluggable slot. A real backend (SP1 / RISC0 / Halo2)
// produces bundle.zk.proof and a Groth16/Plonk verifier checks it in O(1)
// without re-running the fly. Until that backend is wired, this reports that
// the succinct path is not yet available and the optimistic path must be used.
// It deliberately does NOT fake a passing proof.
export async function verifyZk(bundle: ProofBundle): Promise<VerifyResult> {
  const claimed = bundle.transcriptRoot;
  if (!bundle.zk.ready || bundle.zk.scheme === "none") {
    return {
      ok: false,
      recomputedRoot: "0x",
      claimedRoot: claimed,
      reachedMatches: false,
      reason: "zk backend not wired, use optimistic verification (rerun + slash)",
    };
  }
  // when a backend exists, call it here and return its boolean.
  throw new Error("zk backend registered but not implemented in this build");
}

// convenience: a ready-to-run canonical episode for a given seed.
export function episodeForSeed(seed: number): Episode {
  return defaultEpisode(defaultGenome(seed));
}
