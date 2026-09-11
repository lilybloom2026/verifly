// VERIFLY — deterministic, fixed-point connectome engine.
//
// This is the "real infra" layer. Everything here is INTEGER math on a fixed
// grid, so a run is byte-for-byte identical on any machine, any browser, any
// CPU. That reproducibility is the whole point: if two people run the same
// genome on the same task, they MUST get the same state-commitment chain — so
// anyone can re-execute a claimed run and check it, or slash a liar.
//
// No Math.cos / Math.sin / Math.random anywhere in the hot path. The world is
// an integer grid with 8 compass directions. Accumulation stays < 2^53, so
// plain JS numbers behave as exact integers (IEEE-754 integer ops are
// deterministic). Reduction uses Math.floor consistently.
//
// What is NOT here (and is honest about it): a real zk-SNARK prover. Today the
// pipeline ships OPTIMISTIC verification (re-run + compare commitments), which
// is genuinely trustless under a 1-of-N honest assumption. The ZK backend is a
// pluggable slot — see lib/prover.ts and contracts/IProofVerifier.sol.

export const SHIFT = 16;
export const ONE = 1 << SHIFT; // 65536 == fixed-point 1.0

// fixed-point reduce: (a * b) already summed, bring back to ONE scale.
const reduce = (acc: number) => Math.floor(acc / ONE);
const clampUnit = (v: number) => (v > ONE ? ONE : v < -ONE ? -ONE : v);

// deterministic integer PRNG (mulberry32) — returns uint32
function rngFrom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

// ----------------------------------------------------------------------------
// Genome — the compressed identity of one fly. The full connectome is derived
// deterministically from this, so the genome *is* the fly.
// ----------------------------------------------------------------------------
export interface Genome {
  seed: number;
  nSensory: number; // input neurons (bearing + distance)
  nInter: number; // hidden recurrent population
  nMotor: number; // output neurons (turn-left / forward / turn-right)
  fanIn: number; // presynaptic connections per non-sensory neuron
}

export function defaultGenome(seed = 0x1f11): Genome {
  return { seed: seed >>> 0, nSensory: 48, nInter: 720, nMotor: 24, fanIn: 12 };
}

// ----------------------------------------------------------------------------
// Connectome — sparse, stored CSR-style grouped by post-synaptic neuron.
// ----------------------------------------------------------------------------
export interface Connectome {
  genome: Genome;
  N: number;
  sensory0: number; // [0, nSensory)
  inter0: number; // [nSensory, nSensory+nInter)
  motor0: number; // [N-nMotor, N)
  postPtr: Int32Array; // length N+1
  edgeSrc: Int32Array; // length E
  edgeW: Int32Array; // length E (fixed-point weights)
}

export function buildConnectome(genome: Genome): Connectome {
  const { seed, nSensory, nInter, nMotor, fanIn } = genome;
  const N = nSensory + nInter + nMotor;
  const rnd = rngFrom(seed);
  const postPtr = new Int32Array(N + 1);
  const srcs: number[] = [];
  const ws: number[] = [];

  for (let i = 0; i < N; i++) {
    postPtr[i] = srcs.length;
    if (i < nSensory) continue; // sensory neurons are driven externally
    for (let k = 0; k < fanIn; k++) {
      // presynaptic source: any earlier-or-equal population member. Referencing
      // inter/motor indices below i creates recurrence across ticks.
      const src = rnd() % (i === 0 ? 1 : i);
      // weight in fixed-point, roughly [-0.55, 0.55]
      const w = ((rnd() % (ONE + 1)) - (ONE >> 1)) + ((rnd() % (ONE >> 3)) - (ONE >> 4));
      srcs.push(src);
      ws.push(w | 0);
    }
  }
  postPtr[N] = srcs.length;
  return {
    genome,
    N,
    sensory0: 0,
    inter0: nSensory,
    motor0: N - nMotor,
    postPtr,
    edgeSrc: Int32Array.from(srcs),
    edgeW: Int32Array.from(ws),
  };
}

// ----------------------------------------------------------------------------
// World — integer grid, 8 compass directions. y is DOWN (screen coords).
// ----------------------------------------------------------------------------
// E, SE, S, SW, W, NW, N, NE
export const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];

export interface Episode {
  genome: Genome;
  gridW: number;
  gridH: number;
  startX: number;
  startY: number;
  startHeading: number; // 0..7 index into DIRS
  foodX: number;
  foodY: number;
  maxTicks: number;
}

export function defaultEpisode(genome: Genome): Episode {
  return {
    genome,
    gridW: 64,
    gridH: 64,
    startX: 8,
    startY: 56,
    startHeading: 6, // facing N
    foodX: 54,
    foodY: 10,
    maxTicks: 220,
  };
}

// classify the octant pointing from fly toward a delta (dx,dy) — integer only.
// ratio test uses ×2 (tan 26.5°) as the diagonal band; no trig, no floats.
function octantOf(dx: number, dy: number): number {
  const ax = dx < 0 ? -dx : dx;
  const ay = dy < 0 ? -dy : dy;
  if (ax >= 2 * ay) return dx >= 0 ? 0 : 4; // E / W
  if (ay >= 2 * ax) return dy >= 0 ? 2 : 6; // S / N
  if (dx >= 0) return dy >= 0 ? 1 : 7; // SE / NE
  return dy >= 0 ? 3 : 5; // SW / NW
}

// ----------------------------------------------------------------------------
// FlyRun — a stepable, fully-deterministic simulation instance. The frontend
// steps it for animation; the prover runs it headless. Same code, same result.
// ----------------------------------------------------------------------------
export class FlyRun {
  readonly conn: Connectome;
  readonly ep: Episode;
  private prev: Int32Array;
  private next: Int32Array;
  state: Int32Array; // current neuron activations (fixed-point)
  x: number;
  y: number;
  heading: number;
  tick = 0;
  reached = false;
  lastAction: "L" | "R" | "F" | "-" = "-";
  // cheap live telemetry for the UI
  leftDrive = 0;
  rightDrive = 0;
  fwdDrive = 0;

  constructor(ep: Episode) {
    this.ep = ep;
    this.conn = buildConnectome(ep.genome);
    this.prev = new Int32Array(this.conn.N);
    this.next = new Int32Array(this.conn.N);
    this.state = this.prev;
    this.x = ep.startX;
    this.y = ep.startY;
    this.heading = ep.startHeading;
  }

  get dist(): number {
    const dx = this.ep.foodX - this.x;
    const dy = this.ep.foodY - this.y;
    return (dx < 0 ? -dx : dx) + (dy < 0 ? -dy : dy); // Manhattan
  }

  get done(): boolean {
    return this.reached || this.tick >= this.ep.maxTicks;
  }

  // encode the current bearing-to-food into the sensory neurons (fixed-point).
  private sense(target: Int32Array) {
    const { conn, ep } = this;
    const dx = ep.foodX - this.x;
    const dy = ep.foodY - this.y;
    const tgt = octantOf(dx, dy);
    // signed turn error in octant steps: negative => food is to the left
    let rel = ((tgt - this.heading + 12) % 8) - 4; // [-4,3]
    const left = rel < 0 ? 1 : 0;
    const right = rel > 0 ? 1 : 0;
    const ahead = rel === 0 ? 1 : 0;
    const mag = rel < 0 ? -rel : rel; // 0..4
    const far = ep.gridW + ep.gridH;
    const dist = this.dist;
    const close = clampUnit(ONE - Math.floor((dist * ONE) / far)); // near=ONE

    const nS = conn.genome.nSensory;
    const q = nS >> 2; // four sensory sub-groups
    for (let i = 0; i < nS; i++) {
      let v = 0;
      if (i < q) v = left ? ONE : 0; // "food is left"
      else if (i < 2 * q) v = right ? ONE : 0; // "food is right"
      else if (i < 3 * q) v = ahead ? ONE : Math.floor((ONE * (4 - mag)) / 4); // alignment
      else v = close; // proximity
      target[i] = v;
    }
  }

  // one deterministic tick: sense -> propagate -> read motors -> act on grid.
  step(): void {
    if (this.done) return;
    const { conn } = this;
    const { postPtr, edgeSrc, edgeW, N, sensory0, motor0, genome } = conn;
    const prev = this.prev;
    const next = this.next;

    // 1) sensory neurons set from the world
    this.sense(next);

    // 2) every non-sensory neuron integrates its presynaptic inputs (from prev)
    const nS = genome.nSensory;
    for (let i = nS; i < N; i++) {
      let acc = 0;
      const a = postPtr[i];
      const b = postPtr[i + 1];
      for (let e = a; e < b; e++) acc += edgeW[e] * prev[edgeSrc[e]];
      // leak toward rest + new input, then saturate to [-1,1]
      const leak = Math.floor(prev[i] / 8); // ~0.125 retention
      next[i] = clampUnit(leak + reduce(acc));
    }
    void sensory0;

    // 3) read motor populations -> drives
    const nM = genome.nMotor;
    const third = Math.floor(nM / 3);
    let l = 0, f = 0, r = 0;
    for (let j = 0; j < nM; j++) {
      const v = next[motor0 + j];
      if (j < third) l += v;
      else if (j < 2 * third) f += v;
      else r += v;
    }
    this.leftDrive = l;
    this.fwdDrive = f;
    this.rightDrive = r;

    // 4) act: one discrete move per tick
    const FTHRESH = third * (ONE >> 3); // forward must clear this bar
    if (f > l && f > r && f > FTHRESH) {
      const [ddx, ddy] = DIRS[this.heading];
      this.x = Math.max(0, Math.min(this.ep.gridW - 1, this.x + ddx));
      this.y = Math.max(0, Math.min(this.ep.gridH - 1, this.y + ddy));
      this.lastAction = "F";
    } else if (l >= r) {
      this.heading = (this.heading + 7) % 8; // turn left (CCW)
      this.lastAction = "L";
    } else {
      this.heading = (this.heading + 1) % 8; // turn right (CW)
      this.lastAction = "R";
    }

    // swap buffers
    this.prev = next;
    this.next = prev;
    this.state = this.prev;
    this.tick++;
    if (this.dist <= 1) this.reached = true;
  }
}

// ----------------------------------------------------------------------------
// Breeding / mutation — for the onchain Genome NFT. Deterministic: a child is
// fully reproducible from (parentA.seed, parentB.seed, salt).
// ----------------------------------------------------------------------------
export function breed(a: Genome, b: Genome, salt: number): Genome {
  const r = rngFrom((a.seed ^ Math.imul(b.seed, 0x9e3779b1) ^ (salt >>> 0)) >>> 0);
  // crossover the two seeds bit-by-bit, then mutate a few bits
  let childSeed = 0;
  for (let bit = 0; bit < 32; bit++) {
    const pick = r() & 1 ? a.seed : b.seed;
    childSeed |= (pick & (1 << bit)) >>> 0;
  }
  const mutations = 1 + (r() % 3);
  for (let m = 0; m < mutations; m++) childSeed ^= 1 << (r() % 32);
  return { ...a, seed: childSeed >>> 0 };
}
