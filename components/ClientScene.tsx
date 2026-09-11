"use client";

import dynamic from "next/dynamic";
import HeroOverlay from "./HeroOverlay";

// Only the WebGL scene (three.js + r3f + postprocessing, ~240 KB gzipped) is
// lazy. The overlay renders on the server, so the headline and CTAs are on
// screen at first paint instead of waiting for the connectome to boot.
// Kick off the chunk download as soon as this module evaluates in the browser,
// rather than waiting for React to hydrate the whole page first.
if (typeof window !== "undefined") void import("./FlyScene");

const FlyScene = dynamic(() => import("./FlyScene"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex items-center gap-3">
        <span className="led" aria-hidden />
        <span className="label">booting connectome…</span>
      </div>
    </div>
  ),
});

export default function ClientScene() {
  return (
    <>
      <FlyScene />
      <HeroOverlay />
    </>
  );
}
