"use client";

import dynamic from "next/dynamic";

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
  return <FlyScene />;
}
