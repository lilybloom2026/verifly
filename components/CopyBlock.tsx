"use client";

import { useState } from "react";

// A code block with a working copy-to-clipboard button.
export default function CopyBlock({ code, label = "copy" }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked — select-all fallback
      const ta = document.createElement("textarea");
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      } catch {
        /* give up quietly */
      }
      ta.remove();
    }
  };

  return (
    <div className="relative">
      <button
        onClick={copy}
        className="absolute right-2 top-2 z-10 rounded border border-line2 bg-black/70 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-inkdim backdrop-blur-sm transition hover:border-spike hover:text-spike active:scale-95"
        aria-label="Copy to clipboard"
      >
        {copied ? "✓ copied" : label}
      </button>
      <pre className="overflow-x-auto rounded border border-line bg-black/60 p-4 pr-20 font-mono text-[11.5px] leading-relaxed text-inkdim">
        <code>{code}</code>
      </pre>
    </div>
  );
}
