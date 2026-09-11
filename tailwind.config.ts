import type { Config } from "tailwindcss";

// VERIFLY palette — strict black & white for all UI chrome. The ONLY color on
// the site lives in the fly's brain (the 3D connectome + spike raster + the
// arena), so the living neural activity is the thing that pops.
//
//   exc / inh / click  → BRAIN colors (cyan / magenta / gold). Used only by
//                         neural-activity visuals, never by structural UI.
//   spike / verify      → white. The mono accent for buttons, links, VERIFIED.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#050505",
        bg2: "#00000000",
        panel: "#0d0d0d",
        panel2: "#141414",
        line: "#242424",
        line2: "#363636",
        ink: "#f4f4f4",
        inkdim: "#b0b0b0",
        inkmut: "#6f6f6f",
        exc: "#5adcff", // ACh excite — brain cyan
        inh: "#ff5ac8", // GABA/Glu inhibit — brain magenta
        click: "#ffcc55", // trigger — brain gold
        spike: "#ffffff", // mono accent
        verify: "#ffffff", // VERIFIED accent (mono)
      },
      fontFamily: {
        display: ["var(--font-syne)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      letterSpacing: {
        label: "0.16em",
      },
    },
  },
  plugins: [],
};

export default config;
