"use client";

// Clean hero overlay: VERIFLY + social logos top left, headline over a dark
// scrim so text never collides with the brain, the 3D brain through the middle,
// big CTAs (with the logos again) at the bottom.

// TODO: replace with the real repo URL once provided.
const GITHUB_URL = "https://github.com/lilybloom2026/verifly";
const X_URL = "https://x.com/verifly_labs";

const shadow = { textShadow: "0 2px 24px rgba(0,0,0,0.95), 0 1px 4px rgba(0,0,0,0.95)" };

function GithubIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 012-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function XIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  );
}

export default function HeroOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between">
      {/* dark scrim behind the top text so it reads cleanly over the brain */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[60%]"
        style={{ background: "linear-gradient(to bottom, rgba(5,5,5,0.99) 0%, rgba(5,5,5,0.97) 42%, rgba(5,5,5,0.72) 62%, rgba(5,5,5,0) 100%)" }}
        aria-hidden
      />

      {/* top group: bar + headline */}
      <div className="relative">
        <div className="flex items-start justify-between gap-3 p-4 sm:p-6">
          <div className="pointer-events-auto flex items-center gap-2.5">
            <span
              className="font-display text-[24px] font-extrabold leading-none tracking-tight text-ink sm:text-[30px]"
              style={shadow}
            >
              VERI<span className="text-spike">FLY</span>
            </span>
            <span className="hidden rounded border border-spike/40 bg-black/40 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-spike backdrop-blur-sm sm:inline-block">
              PROOF OF BRAIN
            </span>
          </div>
          <div className="pointer-events-auto flex items-center gap-2.5">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="VERIFLY on GitHub"
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-line2 bg-black/50 text-ink backdrop-blur-sm transition hover:border-spike hover:text-spike active:scale-95"
            >
              <GithubIcon className="h-6 w-6" />
            </a>
            <a
              href={X_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="VERIFLY on X"
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-line2 bg-black/50 text-ink backdrop-blur-sm transition hover:border-spike hover:text-spike active:scale-95"
            >
              <XIcon className="h-5 w-5" />
            </a>
          </div>
        </div>

        {/* headline in the upper third, above the brain's bright core */}
        <div className="pointer-events-none mt-[2vh] flex flex-col items-center px-5 text-center sm:mt-[4vh]">
          <h1
            className="max-w-3xl text-balance font-display text-[28px] font-extrabold leading-[1.06] tracking-tight text-ink sm:text-5xl"
            style={shadow}
          >
            A fly brain you can&apos;t be lied to about.
          </h1>
          <p
            className="mt-3 max-w-xl text-balance text-[13.5px] leading-relaxed text-inkdim sm:text-[15px]"
            style={shadow}
          >
            We run a real fruit fly brain on a task. Every run makes a{" "}
            <span className="text-ink">fingerprint</span> anyone can recheck, so nobody can fake the
            result. That&apos;s <span className="text-ink">proof of brain</span>.
          </p>
        </div>
      </div>

      {/* bottom explainer + big CTAs + logos */}
      <div className="relative flex flex-col items-center gap-4 p-4 pb-7 sm:p-6">
        <div className="pointer-events-auto flex w-full max-w-md flex-col items-stretch justify-center gap-3 sm:w-auto sm:flex-row">
          <a
            href="#prover"
            className="rounded-full border border-spike bg-spike px-8 py-3.5 text-center font-mono text-[14px] font-bold uppercase tracking-widest text-black shadow-lg shadow-black/40 transition-transform duration-150 hover:bg-[#e5e5e5] active:scale-95 sm:text-[15px]"
          >
            prove a fly ▸
          </a>
          <a
            href="#how"
            className="rounded-full border border-line2 bg-black/60 px-8 py-3.5 text-center font-mono text-[14px] font-semibold uppercase tracking-widest text-ink backdrop-blur-sm transition-transform duration-150 hover:border-spike hover:text-spike active:scale-95 sm:text-[15px]"
          >
            wtf is this?
          </a>
        </div>
        <div className="pointer-events-auto flex items-center gap-4">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="VERIFLY on GitHub"
            className="text-inkmut transition hover:text-spike"
          >
            <GithubIcon className="h-5 w-5" />
          </a>
          <a
            href={X_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="VERIFLY on X"
            className="text-inkmut transition hover:text-spike"
          >
            <XIcon className="h-[17px] w-[17px]" />
          </a>
        </div>
        <p
          className="pointer-events-none max-w-md text-center font-mono text-[10.5px] leading-relaxed text-inkmut"
          style={shadow}
        >
          the cloud above is the brain, live. cyan and magenta neurons firing, gold sensors. not a
          video, it&apos;s actually running.
        </p>
      </div>
    </div>
  );
}
