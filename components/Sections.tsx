"use client";

import CopyBlock from "./CopyBlock";

// TODO: replace with the real repo URL once provided.
const GITHUB_URL = "https://github.com/lilybloom2026/verifly";

const STATS = [
  { big: "140", u: "K", h: "neurons, the whole brain", p: "A fruit fly's entire connectome is small enough to run in full, and, unlike every LLM, small enough to actually prove end to end. That's the unlock." },
  { big: "100", u: "%", h: "same input, same output", p: "Pure integer math, no dice rolls, no GPU weirdness. Run the same fly on the same task on any machine and you get the identical result. Every time." },
  { big: "1", u: "honest", h: "is all it takes", p: "One person who reruns it can catch a fake and take the liar's bond. You don't have to trust the team, the RPC, or anyone." },
  { big: "1", u: "hash", h: "is the whole run", p: "Every tick gets hashed and chained into one 32 byte receipt. Tiny to post onchain, impossible to fake, trivial to recheck." },
];

const PIPE = [
  { n: "01 · RUN", h: "the fly does the task", p: "A locked down connectome smells its way to the food on a grid. Same run on every machine. That's the point." },
  { n: "02 · HASH", h: "every tick is a receipt", p: "Each step's brain state gets hashed and chained onto the last. Change one thing and the final hash changes. No hiding." },
  { n: "03 · POST", h: "drop the hash + a bond", p: "Whoever ran it posts the receipt onchain with a stake. Cheap, it's a hash, not a GPU farm. The compute never touches the chain." },
  { n: "04 · VERIFY / REKT", h: "rerun it, or slash", p: "Anyone reruns and challenges a mismatch to take the bond. Live now. The zk version does it without rerunning, coming soon." },
];

const USE_CASES = [
  { t: "Verifiable AI agents", p: "An agent claims \"the model told me to ape in.\" Prove it actually ran that model, not a cheaper one, not a human at a keyboard. The receipt doesn't lie." },
  { t: "Onchain games and worlds", p: "NPCs, mobs, and bots whose behavior is provably the real sim, not a cheat. Every move re derivable, so nobody can rig the boss fight." },
  { t: "Trustless prediction markets", p: "Settle \"will X happen?\" from a reproducible computation instead of a human oracle you have to trust. The house is a hash." },
  { t: "Decentralized compute markets", p: "Pay someone to run inference, then cryptographically confirm you got the real result, not a stub. Slash them if not." },
  { t: "Auditable model outputs", p: "A model made a call that affects someone. Anyone, a user or a regulator, can rerun it and confirm the output was legit." },
  { t: "The benchmark itself", p: "The fly is small enough to prove end to end, so it's the reference workload the whole verifiable inference stack gets tested against." },
];

const API = [
  { m: "POST", path: "/api/prove", d: "run a genome server side, seal the proof, store it", body: "{ \"seed\": 130 }" },
  { m: "POST", path: "/api/verify", d: "independently rerun and check the stored receipt", body: "{ \"seed\": 130 }" },
  { m: "GET", path: "/api/runs", d: "list proven runs, most verified first", body: "?limit=24" },
  { m: "GET", path: "/api/health", d: "service status and which store is active", body: "" },
];

export default function Sections() {
  return (
    <>
      {/* how it works */}
      <section id="how" className="cipher-grid border-y border-line/50">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
          <div className="label mb-3 text-spike">wtf am i looking at</div>
          <h2 className="max-w-2xl text-balance font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Anyone can post a fly brain. Nobody can prove it ran. We can.
          </h2>
          <p className="mt-3 max-w-2xl text-inkdim">
            Every &ldquo;AI onchain&rdquo; play has the same hole: you have to <em>trust</em> that the
            thing actually ran the way they say. A fruit fly&apos;s brain is the rare neural net small
            enough to make that provable, so VERIFLY makes it the{" "}
            <b className="text-ink">&ldquo;gm&rdquo; of verifiable compute</b>: run it, hash every
            tick, and let anyone check the receipt or take your bond. <b className="text-ink">Don&apos;t
            trust. Verify.</b>
          </p>

          <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STATS.map((s) => (
              <div
                key={s.h}
                className="rounded border border-line bg-gradient-to-b from-panel to-transparent p-4"
              >
                <div className="font-mono text-[26px] font-semibold leading-none tracking-tight text-ink">
                  {s.big}
                  <span className="text-[13px] text-inkmut"> {s.u}</span>
                </div>
                <h4 className="mb-1.5 mt-3 text-[14px] font-semibold text-ink">{s.h}</h4>
                <p className="text-[12.5px] leading-relaxed text-inkmut">{s.p}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-1 overflow-hidden rounded border border-line md:grid-cols-4">
            {PIPE.map((s, i) => (
              <div
                key={s.n}
                className={
                  "relative bg-panel/40 p-4 " +
                  (i < PIPE.length - 1 ? "border-b border-line md:border-b-0 md:border-r" : "")
                }
              >
                <div className="font-mono text-[11px] tracking-widest text-ink">{s.n}</div>
                <h5 className="mb-1.5 mt-2 text-[14px] font-semibold text-ink">{s.h}</h5>
                <p className="text-[12px] leading-relaxed text-inkmut">{s.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* use cases */}
      <section id="use-cases" className="mx-auto max-w-6xl px-5 py-20">
        <div className="label mb-3 text-spike">why anyone should care</div>
        <h2 className="max-w-2xl text-balance font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          &ldquo;Proving a computation ran&rdquo; sounds boring. It&apos;s the whole game.
        </h2>
        <p className="mt-3 max-w-2xl text-inkdim">
          The fly is the mascot. The tech underneath, <b className="text-ink">cheap public proof that
          a specific AI computation actually happened</b>, is what these unlock:
        </p>
        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {USE_CASES.map((u, i) => (
            <div key={u.t} className="rounded border border-line bg-panel/50 p-4">
              <div className="font-mono text-[11px] text-inkmut">{String(i + 1).padStart(2, "0")}</div>
              <h4 className="mb-1.5 mt-2 text-[14.5px] font-semibold text-ink">{u.t}</h4>
              <p className="text-[12.5px] leading-relaxed text-inkmut">{u.p}</p>
            </div>
          ))}
        </div>
      </section>

      {/* api */}
      <section id="api" className="cipher-grid border-y border-line/50">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="label mb-3 text-spike">for builders · the API</div>
          <h2 className="max-w-2xl text-balance font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Prove and verify over HTTP.
          </h2>
          <p className="mt-3 max-w-2xl text-inkdim">
            The prover is a real service. Runs persist to <b className="text-ink">Postgres</b> (with a
            zero config in-memory fallback so it boots with nothing installed). Point anything at it:
          </p>
          <div className="mt-8 overflow-hidden rounded border border-line">
            {API.map((e, i) => (
              <div
                key={e.path}
                className={
                  "flex flex-col gap-1 bg-panel/40 p-4 sm:flex-row sm:items-center sm:gap-4 " +
                  (i < API.length - 1 ? "border-b border-line" : "")
                }
              >
                <span
                  className={
                    "w-fit rounded border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-widest " +
                    (e.m === "POST" ? "border-spike/50 text-spike" : "border-line2 text-inkdim")
                  }
                >
                  {e.m}
                </span>
                <code className="font-mono text-[13px] text-ink">{e.path}</code>
                <span className="font-mono text-[11px] text-inkmut">{e.body}</span>
                <span className="text-[12.5px] text-inkdim sm:ml-auto">{e.d}</span>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <CopyBlock
              code={`# seal a proof, then verify it independently
curl -s https://veriflylabs.xyz/api/prove  -H 'content-type: application/json' -d '{"seed":130}'
curl -s https://veriflylabs.xyz/api/verify -H 'content-type: application/json' -d '{"seed":130}'
# => { "ok": true, "reason": "reran the whole thing, commitments match", ... }`}
            />
          </div>
        </div>
      </section>

      {/* the story */}
      <section id="story" className="mx-auto max-w-6xl px-5 py-20">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-[1.1fr_0.9fr] md:gap-10">
          <div>
            <div className="label mb-3 text-spike">why a fly, why now</div>
            <h2 className="text-balance font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
              The meme was &ldquo;we deployed the brain.&rdquo; The alpha is proving it ran.
            </h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-inkdim">
              <p>
                Deploying a fly brain and showing pretty spikes is a screensaver. Cool, but anyone can
                fake the numbers. The thing nobody&apos;s shipped at meme scale is{" "}
                <b className="font-medium text-ink">provable compute</b>: a cheap, public way to know
                a specific run actually happened, without rerunning it yourself or trusting the dev.
              </p>
              <p>
                VERIFLY makes the fly the benchmark for exactly that. The genome is an onchain asset.
                Running it spits out a receipt anyone can recheck. Meme on top, actual cryptography
                underneath. That&apos;s the moat a screensaver doesn&apos;t have.
              </p>
              <p>
                And it&apos;s honest about the seams: rerun verification is live today, the one shot zk
                proof is wired, not faked. Read every hash. Rerun every fly. No trust required.
              </p>
            </div>
          </div>

          <div>
            <blockquote className="border-l-2 border-spike pl-5 font-display text-xl font-bold leading-snug tracking-tight text-ink sm:text-2xl">
              A fly can&apos;t read a chart. But its brain, run for real, spits out an answer you can{" "}
              <span className="text-verify">check without trusting whoever ran it</span>, which is the
              one thing every AI coin is missing.
            </blockquote>

            <div className="mt-8 rounded border border-line2 bg-gradient-to-b from-white/[0.04] to-panel2 p-5">
              <div className="label text-spike">the fine print, no cap</div>
              <p className="mt-2 text-[13.5px] leading-relaxed text-inkdim">
                Art experiment and working prototype, <b className="text-ink">not</b> an investment.
                The engine is real and deterministic, verification is{" "}
                <b className="text-ink">rerun and slash</b> today, and the zk SNARK backend is a wired
                slot, not a live proof yet. The wiring is a deterministic stand in until the FlyWire
                import lands. Nothing here is financial advice.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-6 px-5 py-8 sm:flex-row">
          <div>
            <div className="font-display text-lg font-extrabold">
              VERI<span className="text-spike">FLY</span>
            </div>
            <p className="mt-2 max-w-md text-[12px] text-inkmut">
              Proof of Brain. A fruit fly connectome you can&apos;t be lied to about. Run it, hash
              every tick, rerun to verify, slash the fakers. Don&apos;t trust, verify.
            </p>
          </div>
          <div className="flex flex-wrap gap-5">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] text-inkmut hover:text-spike"
            >
              GitHub ↗
            </a>
            <a
              href="https://x.com/verifly_labs"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] text-inkmut hover:text-spike"
            >
              @verifly_labs ↗
            </a>
            <a href="#prover" className="text-[13px] text-inkmut hover:text-spike">run the prover ↑</a>
            <a href="#how" className="text-[13px] text-inkmut hover:text-spike">how it works</a>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-5 pb-10">
          <p className="max-w-4xl font-mono text-[11px] leading-relaxed text-inkmut">
            Interactive prototype. The Drosophila connectome (Google Research and HHMI Janelia) is real
            science; the sim here is a lightweight deterministic model built to demo verifiable
            computation, not a scientific instrument. The contracts (FlyVerifier, FlyGenome) are plain
            EVM, the same bytecode deploys to Robinhood Chain, Base, or Arbitrum. Not financial advice.
          </p>
        </div>
      </footer>
    </>
  );
}
