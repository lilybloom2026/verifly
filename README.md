# VERIFLY — Proof-of-Brain

**The meme is "we deployed the fly brain." The moat is _proving a run of it actually happened._**

X: [@verifly_labs](https://x.com/verifly_labs)

We run a real fruit-fly brain on a task. Every run produces a **fingerprint** (a
hash receipt) that anyone can independently re-check — so nobody can fake the
result. That's **proof-of-brain**: the "hello world" of _verifiable neural
inference_.

The UI is strict **black & white**; the only color on the whole site lives in the
**fly's brain** (the 3D connectome, the arena) — cyan/magenta neurons, gold
sensors — so the living neural activity is what pops.

---

## Why it matters (use cases)

Verifiable inference — cheap, public proof that a specific AI computation actually
ran the way it's claimed — unlocks:

- **Verifiable AI agents** — prove an agent ran the model it claims, not a cheaper one.
- **On-chain games / autonomous worlds** — provably-fair NPC behavior, no cheating.
- **Trustless prediction markets** — settle bets from a reproducible computation, not a human oracle.
- **Decentralized compute markets** — pay for inference, cryptographically confirm you got the real result.
- **Auditable model outputs** — a user or regulator can re-run a decision and confirm it.
- **The benchmark itself** — the fly is small enough to prove end-to-end, so it's the reference workload for the whole stack.

---

## How the proof works

```
RUN    a deterministic connectome does the task (reach food on an integer grid)
HASH   every tick's brain-state is hashed and chained → one 32-byte transcript root
POST   whoever ran it posts { genomeRoot, transcriptRoot, reached } + a bond on-chain
VERIFY anyone re-runs the identical engine; a mismatch slashes the liar's bond
```

The compute never runs on-chain (too big). The chain only settles _which claims
are true_ — via re-execution today (optimistic), via a succinct zk-proof next.

---

## Real vs. scaffolded (no LARPing)

| Piece | Status |
|---|---|
| Deterministic fixed-point connectome engine (`lib/engine.ts`) | ✅ Real. Integer math, no floats/RNG. Byte-identical in Node, the browser, and the server. |
| SHA-256 per-tick commitment + transcript hash-chain (`lib/prover.ts`) | ✅ Real. |
| **Prover API** (`app/api/*`) — prove / verify / runs / health | ✅ Real. Server-side, deterministic. |
| **Postgres registry** (`lib/db.ts`) | ✅ Real, with a zero-config in-memory fallback. |
| Optimistic on-chain verification + slashing (`contracts/FlyVerifier.sol`) | ✅ Real, compiles. |
| Genome NFT + on-chain breeding (`contracts/FlyGenome.sol`) | ✅ Real, compiles. |
| Parimutuel market settled from the proof (`contracts/FlyMarket.sol`) | ✅ Real, compiles. |
| **Succinct zk-SNARK** (verify without re-running) | 🔌 Pluggable slot, NOT faked (`contracts/IProofVerifier.sol`, `lib/prover.ts::verifyZk`). |
| FlyWire connectome weights | 🔶 Deterministic stand-in until the FlyWire import. Proof machinery is identical either way. |

---

## Run it

```bash
npm install
npm run dev            # http://localhost:3000
```

Out of the box it uses an **in-memory** store — zero setup. Scroll to **THE
PROVER**, hit _Run & prove_, then _verify (re-run)_. Proven runs appear in the
**verified runs registry** and are re-checkable by anyone.

### With Postgres (durable, production)

```bash
docker compose up -d
export DATABASE_URL=postgres://verifly:verifly@localhost:5432/verifly
npm run dev
```

The `runs` table is created automatically. `GET /api/health` reports which store
is active (`postgres` vs `memory`).

---

## API

The prover is a real service — point anything at it.

| Method | Route | Body / Query | Does |
|---|---|---|---|
| `POST` | `/api/prove`  | `{ "seed": 130 }` | run a genome server-side, seal the proof, store it |
| `POST` | `/api/verify` | `{ "seed": 130, "transcriptRoot": "0x…", "reached": true }` | independently re-run and check the claimed receipt (stateless — omit the claim to check the stored one) |
| `GET`  | `/api/runs`   | `?limit=24` | list proven runs, most-verified first |
| `GET`  | `/api/health` | — | service status + active store |

```bash
curl -s localhost:3000/api/prove  -H 'content-type: application/json' -d '{"seed":130}'
curl -s localhost:3000/api/verify -H 'content-type: application/json' -d '{"seed":130}'
# => { "ok": true, "reason": "re-executed byte-for-byte; commitments match", ... }
```

---

## Contracts

Dependency-free (no OpenZeppelin), so this works with a bare Foundry:

```bash
cd contracts
forge build --skip "*.t.sol"     # compiles all four contracts
# tests need forge-std once: forge install foundry-rs/forge-std && forge test -vvv
```

All four are plain EVM — the **same bytecode** deploys to Robinhood Chain, Base,
or Arbitrum. The compute never runs on-chain, so the chain choice is cosmetic.

---

## Architecture

```
lib/engine.ts          deterministic fixed-point connectome + integer grid world
lib/prover.ts          genomeRoot, per-tick commitments, transcript chain, verify, zk slot
lib/db.ts              Postgres registry (+ in-memory fallback) — server only
app/api/{prove,verify,runs,health}/route.ts   the public prover API
components/HeroOverlay.tsx   VERIFLY hero — title on top, brain in the middle
components/FlyScene + Brain3D   the live 3D connectome (colorful, on black)
components/Prover.tsx        run a fly → seal a proof → verify → registry
components/Sections.tsx      how-it-works, use cases, API, the story
contracts/*.sol              FlyVerifier / FlyGenome / FlyMarket / IProofVerifier
```

## Path to real ZK (v2)

1. Keep the deterministic engine (done — the hard part).
2. Prove one tick at a time in a zkVM (SP1 / RISC0), aggregate into the transcript root.
3. Deploy the generated verifier as an `IProofVerifier` and call
   `FlyVerifier.setProofVerifier(...)`. Start on the larval fly (~3k neurons).

Art experiment + working prototype. Not financial advice.
