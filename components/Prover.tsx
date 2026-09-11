"use client";

import { useEffect, useRef, useState } from "react";
import { DIRS, FlyRun, breed, defaultEpisode, defaultGenome } from "@/lib/engine";
import {
  proveEpisode,
  verifyEpisode,
  type ProofBundle,
  type VerifyResult,
} from "@/lib/prover";

// seeds verified to reach the food, the lineage to start from.
const WINNERS = [130, 162, 189, 221, 294, 313];
const GENESIS = 130;

type Phase = "idle" | "running" | "proving" | "proved";

type LeaderRow = {
  seed: number;
  transcriptRoot: string;
  ticks: number;
  reached: boolean;
  verifyCount: number;
};

const short = (h: string, n = 10) =>
  h.length > 2 * n ? `${h.slice(0, n)}…${h.slice(-6)}` : h;

export default function Prover() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runRef = useRef<FlyRun | null>(null);
  const trailRef = useRef<{ x: number; y: number }[]>([]);
  const rafRef = useRef(0);
  const lastStepRef = useRef(0);
  const activeSeedRef = useRef(GENESIS); // the seed actually running (survives breed)
  const arenaRef = useRef<HTMLDivElement>(null);

  const [seed, setSeed] = useState(GENESIS);
  const [phase, setPhase] = useState<Phase>("idle");
  const [live, setLive] = useState({ tick: 0, dist: 0, action: "-", reached: false });
  const [bundle, setBundle] = useState<ProofBundle | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<string[]>([]);

  // breeding
  const [pa, setPa] = useState(130);
  const [pb, setPb] = useState(162);

  // registry (from /api/runs)
  const [runs, setRuns] = useState<LeaderRow[]>([]);
  const [store, setStore] = useState<string>("");

  const addLog = (s: string) => setLog((p) => [...p.slice(-7), s]);

  // ---- arena rendering -----------------------------------------------------
  const draw = () => {
    const cv = canvasRef.current;
    const run = runRef.current;
    if (!cv || !run) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const W = cv.width;
    const ep = run.ep;
    const cell = W / ep.gridW;

    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, W, W);

    // faint grid
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= ep.gridW; i += 8) {
      ctx.beginPath();
      ctx.moveTo(i * cell, 0);
      ctx.lineTo(i * cell, W);
      ctx.moveTo(0, i * cell);
      ctx.lineTo(W, i * cell);
      ctx.stroke();
    }

    // trail
    const trail = trailRef.current;
    for (let i = 0; i < trail.length; i++) {
      const a = (i / trail.length) * 0.5 + 0.08;
      ctx.fillStyle = `rgba(90,220,255,${a})`;
      ctx.beginPath();
      ctx.arc((trail[i].x + 0.5) * cell, (trail[i].y + 0.5) * cell, cell * 0.32, 0, 7);
      ctx.fill();
    }

    // food, gold goal diamond + glow
    const fx = (ep.foodX + 0.5) * cell;
    const fy = (ep.foodY + 0.5) * cell;
    const grad = ctx.createRadialGradient(fx, fy, 1, fx, fy, cell * 3.2);
    grad.addColorStop(0, "rgba(255,204,85,0.5)");
    grad.addColorStop(1, "rgba(255,204,85,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(fx - cell * 3.2, fy - cell * 3.2, cell * 6.4, cell * 6.4);
    ctx.fillStyle = "#ffcc55";
    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-cell * 0.9, -cell * 0.9, cell * 1.8, cell * 1.8);
    ctx.restore();

    // fly, the brain in action: cyan triangle oriented by heading
    const [ddx, ddy] = DIRS[run.heading];
    const ang = Math.atan2(ddy, ddx);
    const px = (run.x + 0.5) * cell;
    const py = (run.y + 0.5) * cell;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    ctx.fillStyle = run.reached ? "#ffffff" : "#5adcff";
    ctx.shadowColor = run.reached ? "#ffffff" : "#5adcff";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(cell * 1.6, 0);
    ctx.lineTo(-cell * 1.1, cell * 1.0);
    ctx.lineTo(-cell * 1.1, -cell * 1.0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  // ---- the live run loop ---------------------------------------------------
  useEffect(() => {
    const loop = (t: number) => {
      const run = runRef.current;
      if (run && phase === "running") {
        if (t - lastStepRef.current > 26) {
          lastStepRef.current = t;
          run.step();
          trailRef.current.push({ x: run.x, y: run.y });
          if (trailRef.current.length > 260) trailRef.current.shift();
          setLive({ tick: run.tick, dist: run.dist, action: run.lastAction, reached: run.reached });
          if (run.done) finishRun();
        }
        draw();
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // load the registry once on mount
  useEffect(() => {
    refreshRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startRun = (useSeed = seed) => {
    activeSeedRef.current = useSeed;
    const ep = defaultEpisode(defaultGenome(useSeed));
    const run = new FlyRun(ep);
    runRef.current = run;
    trailRef.current = [{ x: run.x, y: run.y }];
    setBundle(null);
    setVerify(null);
    setProgress(0);
    setLive({ tick: 0, dist: run.dist, action: "-", reached: false });
    setLog([]);
    addLog(`genome #${useSeed} loaded · ${run.conn.N} neurons · ${run.conn.edgeSrc.length} synapses`);
    addLog(`task: reach food at (${ep.foodX},${ep.foodY}) within ${ep.maxTicks} ticks`);
    setPhase("running");
    // bring the arena into view so the fly is visible while it runs
    setTimeout(() => arenaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  };

  const finishRun = async () => {
    const run = runRef.current!;
    setPhase("proving");
    addLog(
      run.reached
        ? `✓ reached food in ${run.tick} ticks`
        : `✗ did not reach food, final distance ${run.dist}`
    );
    addLog("hashing every tick into the receipt, sealing on the server…");
    const useSeed = activeSeedRef.current;
    let b: ProofBundle | null = null;
    // authoritative path: server runs the same deterministic engine and stores it.
    try {
      const res = await fetch("/api/prove", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seed: useSeed }),
      });
      const j = await res.json();
      if (res.ok && j.ok && j.proof) {
        b = j.proof as ProofBundle;
        addLog("proof stored in the registry");
      }
    } catch {
      /* fall through to local */
    }
    // fallback: seal locally so the button never dead ends.
    if (!b) {
      b = await proveEpisode(run.ep, ({ tick, maxTicks }) =>
        setProgress(Math.round((tick / Math.min(maxTicks, run.tick || 1)) * 100))
      );
      addLog("server unreachable, sealed locally (still valid, just not stored)");
    }
    setBundle(b);
    setProgress(100);
    setPhase("proved");
    addLog(`proof sealed · transcript root ${short(b.transcriptRoot, 8)}`);
    refreshRuns();
  };

  const runVerify = async () => {
    if (!bundle || verifying) return;
    setVerifying(true);
    setVerify(null);
    addLog("independent verifier rerunning the engine…");
    const useSeed = activeSeedRef.current;
    let v: VerifyResult | null = null;
    // authoritative path: the server reruns and compares against what it stored.
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          seed: useSeed,
          transcriptRoot: bundle.transcriptRoot,
          reached: bundle.reached,
        }),
      });
      const j = await res.json();
      if (res.ok && typeof j.ok === "boolean") {
        v = {
          ok: j.ok,
          recomputedRoot: j.recomputedRoot,
          claimedRoot: j.claimedRoot,
          reachedMatches: j.reachedMatches,
          reason: j.reason,
        };
        if (j.ok) addLog(`✓ VERIFIED on server · ${j.verifyCount} independent check(s)`);
      }
    } catch {
      /* fall through to local */
    }
    // fallback: verify locally so the button always returns an answer.
    if (!v) {
      await new Promise((r) => setTimeout(r, 30));
      v = await verifyEpisode(bundle);
      addLog("server unreachable, verified locally");
    }
    setVerify(v);
    setVerifying(false);
    addLog(v.ok ? "✓ VERIFIED, recomputed root matches" : "✗ REJECTED, root mismatch");
    refreshRuns();
  };

  const refreshRuns = async () => {
    try {
      const res = await fetch("/api/runs?limit=8");
      const j = await res.json();
      if (j.ok) {
        setRuns(j.runs);
        setStore(j.backend);
      }
    } catch {
      /* leaderboard is best effort */
    }
  };

  const downloadProof = () => {
    if (!bundle) return;
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `verifly-proof-${seed}.json`;
    a.click();
  };

  const rollRandom = () => {
    if (busy) return;
    setSeed(Math.floor(Math.random() * 100000) >>> 0);
  };

  const doBreed = () => {
    const child = breed(defaultGenome(pa), defaultGenome(pb), Date.now() % 997);
    setSeed(child.seed);
    addLog(`bred #${pa} × #${pb} → child genome #${child.seed}`);
    startRun(child.seed);
  };

  const busy = phase === "running" || phase === "proving";

  return (
    <section id="prover" className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
      <div className="label mb-3 text-spike">the prover · don&apos;t trust, verify</div>
      <h2 className="max-w-3xl text-balance font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
        One fly. One task. A receipt you can&apos;t fake.
      </h2>
      <p className="mt-3 max-w-2xl text-inkdim">
        Pick a genome and hit run. The fly runs on a locked down copy of the connectome (pure integer
        math, zero randomness), so the same fly on the same task gives the exact same answer on every
        machine. Each run seals one tiny hash receipt anyone can reproduce.
      </p>

      {/* run bar, kept high so it's visible the moment you land here */}
      <div className="mt-6 rounded-xl border border-line2 bg-panel/80 p-5">
        <h3 className="font-display text-[18px] font-bold tracking-tight text-ink">
          Step 1 · pick a fly, then run it
        </h3>
        <p className="mt-1 text-[13px] leading-relaxed text-inkdim">
          Every number is a different fly brain, wired from that seed. Type any number, roll a random
          one, or tap a proven fly below that already reaches the food. Then hit run.
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-widest text-inkmut">
              genome seed
            </span>
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(parseInt(e.target.value || "0", 10) >>> 0)}
              placeholder="e.g. 130"
              className="w-full rounded-lg border border-line2 bg-[#0f0f0f] px-3 py-3 font-mono text-[16px] text-ink placeholder:text-inkmut focus:border-spike focus:outline-none"
            />
          </label>
          <button
            onClick={rollRandom}
            disabled={busy}
            className="rounded-lg border border-line2 bg-[#0f0f0f] px-4 py-3 font-mono text-[13px] text-inkdim transition hover:border-spike hover:text-spike disabled:cursor-not-allowed disabled:text-inkmut"
          >
            🎲 random fly
          </button>
        </div>

        <div className="mt-3">
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-inkmut">
            proven to reach the food · tap one
          </div>
          <div className="flex flex-wrap gap-1.5">
            {WINNERS.map((w) => (
              <button
                key={w}
                onClick={() => setSeed(w)}
                className={
                  "rounded-full border px-3 py-1.5 font-mono text-[12px] transition " +
                  (seed === w
                    ? "border-spike bg-spike/15 text-spike"
                    : "border-line2 bg-[#0f0f0f] text-inkdim hover:border-spike hover:text-ink")
                }
              >
                #{w}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => startRun()}
          disabled={busy}
          className={
            "mt-4 w-full rounded-lg border px-5 py-4 text-center font-mono text-[15px] font-bold uppercase tracking-widest transition-transform duration-150 active:scale-[0.99] " +
            (busy
              ? "cursor-not-allowed border-line2 bg-[#0f0f0f] text-inkmut"
              : "border-spike bg-spike text-black hover:bg-[#e5e5e5]")
          }
        >
          {phase === "running"
            ? "the fly is running… watch it navigate"
            : phase === "proving"
            ? `sealing proof… ${progress}%`
            : `▸ Run & prove fly #${seed}`}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ---- arena ---- */}
        <div ref={arenaRef} className="flex flex-col gap-4">
          <div className="ticks rounded-lg border border-line bg-panel/70 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="label">the arena · genome #{seed}</span>
              <span className="font-mono text-[11px] text-inkmut">
                tick <span className="text-ink">{live.tick}</span> · dist{" "}
                <span className="text-ink">{live.dist}</span> · act{" "}
                <span className="text-spike">{live.action}</span>
              </span>
            </div>
            <canvas
              ref={canvasRef}
              width={360}
              height={360}
              className="aspect-square w-full rounded border border-line bg-[#050505]"
            />
            <p className="mt-2 font-mono text-[10.5px] leading-relaxed text-inkmut">
              cyan is the fly (its motor neurons steer it). gold is the food. the trail is its path.
              it only knows the bearing and distance to food. the brain does the rest.
            </p>
          </div>
        </div>

        {/* ---- proof receipt ---- */}
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-line bg-panel/70 p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-mono text-[13px] font-medium tracking-wide text-ink">
                proof receipt
              </span>
              <span
                className={
                  "rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest " +
                  (bundle ? "border-spike/40 text-spike" : "border-line2 text-inkmut")
                }
              >
                {bundle ? "sealed" : "awaiting run"}
              </span>
            </div>

            <Row label="genome root" value={bundle ? short(bundle.genomeRoot) : "·"} />
            <Row label="start commit" value={bundle ? short(bundle.startCommit) : "·"} />
            <Row label="end commit" value={bundle ? short(bundle.endCommit) : "·"} />
            <Row
              label="transcript root (hash chain)"
              value={bundle ? short(bundle.transcriptRoot) : "·"}
              accent
            />
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Stat label="ticks" value={bundle ? String(bundle.ticksUsed) : "·"} />
              <Stat label="final dist" value={bundle ? String(bundle.finalDist) : "·"} />
              <Stat
                label="outcome"
                value={bundle ? (bundle.reached ? "reached" : "failed") : "·"}
                tone={bundle ? (bundle.reached ? "good" : "bad") : "mut"}
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={runVerify}
                disabled={!bundle || verifying}
                className={
                  "flex-1 rounded border px-4 py-2.5 font-mono text-[13px] font-semibold transition " +
                  (!bundle
                    ? "cursor-not-allowed border-line2 text-inkmut"
                    : verify?.ok
                    ? "border-verify bg-verify/15 text-verify"
                    : "border-verify/60 text-verify hover:bg-verify/10")
                }
              >
                {verifying ? "rerunning…" : verify?.ok ? "✓ verified" : "▸ verify (rerun)"}
              </button>
              <button
                onClick={downloadProof}
                disabled={!bundle}
                className="rounded border border-line2 px-4 py-2.5 font-mono text-[13px] text-ink transition hover:border-spike hover:text-spike disabled:cursor-not-allowed disabled:text-inkmut"
              >
                ⭳ proof.json
              </button>
            </div>

            {verify && (
              <div
                className={
                  "mt-3 rounded border p-3 font-mono text-[11.5px] leading-relaxed " +
                  (verify.ok
                    ? "border-verify/50 bg-white/[0.06] text-verify"
                    : "border-line2 bg-white/[0.03] text-inkdim")
                }
              >
                {verify.ok ? "✓ " : "✗ "}
                {verify.reason}
                <div className="mt-1 text-inkmut">
                  recomputed {short(verify.recomputedRoot, 8)} · claimed{" "}
                  {short(verify.claimedRoot, 8)}
                </div>
              </div>
            )}
          </div>

          {/* breed */}
          <div className="ticks rounded-lg border border-line bg-panel/70 p-4">
            <div className="label mb-2">breed a new genome</div>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                value={pa}
                onChange={(e) => setPa(parseInt(e.target.value || "0", 10) >>> 0)}
                className="w-full min-w-0 rounded border border-line2 bg-[#0f0f0f] px-2 py-1.5 font-mono text-[12px] text-ink focus:border-spike focus:outline-none"
              />
              <span className="font-mono text-inkmut">×</span>
              <input
                type="number"
                value={pb}
                onChange={(e) => setPb(parseInt(e.target.value || "0", 10) >>> 0)}
                className="w-full min-w-0 rounded border border-line2 bg-[#0f0f0f] px-2 py-1.5 font-mono text-[12px] text-ink focus:border-spike focus:outline-none"
              />
              <button
                onClick={doBreed}
                disabled={busy}
                className="shrink-0 rounded border border-spike/50 px-3 py-1.5 font-mono text-[12px] text-spike transition hover:bg-spike/10 disabled:cursor-not-allowed disabled:border-line2 disabled:text-inkmut"
              >
                ◈ breed &amp; run
              </button>
            </div>
            <p className="mt-2 font-mono text-[10px] leading-relaxed text-inkmut">
              deterministic crossover. the child seed is reproducible onchain (FlyGenome.sol). find
              the ones that solve the task, breed the winners.
            </p>
          </div>
        </div>
      </div>

      {/* log */}
      <div className="ticks mt-4 rounded-lg border border-line bg-panel/70 p-4">
        <div className="label mb-2">prover log</div>
        <div className="flex min-h-[96px] flex-col gap-1 font-mono text-[11px] leading-relaxed text-inkdim">
          {log.length === 0 && (
            <span className="text-inkmut">press run to watch the fly solve the task.</span>
          )}
          {log.map((l, i) => (
            <span key={i} className={i === log.length - 1 ? "text-spike" : ""}>
              <span className="text-inkmut">›</span> {l}
            </span>
          ))}
        </div>
      </div>

      {/* verified runs registry, backed by the API / Postgres */}
      <div className="mt-4 rounded-lg border border-line bg-panel/70 p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="label">verified runs registry</span>
          <span className="font-mono text-[10px] text-inkmut">
            store:{" "}
            <span className={store === "postgres" ? "text-verify" : "text-inkdim"}>
              {store || "…"}
            </span>{" "}
            · GET <span className="text-inkdim">/api/runs</span>
          </span>
        </div>
        {runs.length === 0 ? (
          <p className="font-mono text-[11px] text-inkmut">
            no runs yet. prove one above and it lands here, recheckable by anyone.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse font-mono text-[11px]">
              <thead>
                <tr className="text-left text-inkmut">
                  <th className="py-1.5 pr-3 font-normal uppercase tracking-widest">genome</th>
                  <th className="py-1.5 pr-3 font-normal uppercase tracking-widest">receipt</th>
                  <th className="py-1.5 pr-3 font-normal uppercase tracking-widest">ticks</th>
                  <th className="py-1.5 pr-3 font-normal uppercase tracking-widest">outcome</th>
                  <th className="py-1.5 pr-3 font-normal uppercase tracking-widest">✓ checks</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.seed} className="border-t border-line/60 text-inkdim">
                    <td className="py-1.5 pr-3 text-ink">#{r.seed}</td>
                    <td className="py-1.5 pr-3">{short(r.transcriptRoot, 8)}</td>
                    <td className="py-1.5 pr-3">{r.ticks}</td>
                    <td className={"py-1.5 pr-3 " + (r.reached ? "text-verify" : "text-inkmut")}>
                      {r.reached ? "reached" : "failed"}
                    </td>
                    <td className="py-1.5 pr-3 text-ink">{r.verifyCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-4 max-w-3xl font-mono text-[10.5px] leading-relaxed text-inkmut">
        Straight talk on the seams: verify today is optimistic, it reruns the exact engine and checks
        the receipt, the same move a challenger makes onchain to take a liar&apos;s bond
        (FlyVerifier.sol). The one shot zk proof (check it without rerunning) is wired but not faked
        (IProofVerifier.sol). And the wiring is a deterministic stand in until the real FlyWire
        import. No LARPing. Everything here actually runs.
      </p>
    </section>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-line/60 py-2">
      <span className="font-mono text-[10px] uppercase tracking-widest text-inkmut">{label}</span>
      <span className={"font-mono text-[12px] " + (accent ? "text-spike" : "text-ink")}>{value}</span>
    </div>
  );
}

function Stat({ label, value, tone = "mut" }: { label: string; value: string; tone?: "good" | "bad" | "mut" }) {
  const c = tone === "good" ? "text-verify font-semibold" : tone === "bad" ? "text-inkmut" : "text-ink";
  return (
    <div className="rounded border border-line bg-[#0f0f0f] p-2 text-center">
      <div className="font-mono text-[9px] uppercase tracking-widest text-inkmut">{label}</div>
      <div className={"font-mono text-[14px] " + c}>{value}</div>
    </div>
  );
}
