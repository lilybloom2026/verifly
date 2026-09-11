// FlyBrain — a lightweight leaky integrate-and-fire model wired to a compound eye.
// Pure logic + typed arrays; the React/Three layer reads these buffers each frame.

export type SceneType = "text" | "face" | "dot" | "noise" | "grating" | "custom";

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

// deterministic-ish PRNG so the structure is stable across reloads
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class FlyBrain {
  // ---- population (spiking neurons) ----
  P = 3000;
  positions!: Float32Array; // P*3
  V!: Float32Array;
  Vth!: Float32Array;
  refr!: Int16Array;
  nt!: Int8Array; // 0 ACh(+), 1 GABA(-), 2 Glu(-)
  spiked!: Uint8Array;
  bright!: Float32Array; // display glow 0..~1.4 (decays)
  private Isyn!: Float32Array;
  private sectW!: Array<Record<number, number>>;
  private syn!: Array<Array<{ t: number; w: number }>>;

  // ---- synapse edges (for the 3D web) ----
  edgePairs!: Uint32Array; // nEdges*2 (pre,post)
  edgePre!: Uint32Array; // nEdges
  edgeGlow!: Float32Array; // nEdges
  nEdges = 0;

  // ---- compound eyes (retina) ----
  eyeN = 0;
  eyePos!: Float32Array; // eyeN*3 (world positions on the two domes)
  eyeUV!: Float32Array; // eyeN*2 (nx,ny in eye plane for sampling)
  eyeSector!: Int16Array;
  eyeSide!: Int8Array; // -1 left, +1 right
  eyeDrive!: Float32Array; // eyeN

  private SECT = 16;
  private sectorDrive!: Float32Array;

  // ---- descending neurons -> cursor ----
  dnV = [0, 0, 0, 0];
  dnTh = [1.0, 0.85, 1.0, 1.35];
  dnCount = [0, 0, 0, 0];
  dnFired = [0, 0, 0, 0]; // frames-left flash
  private dnCd = [0, 0, 0, 0];

  // gaze in scene space
  gx = 100;
  gy = 100;
  heading = 0;
  clicks = 0;
  clickPulse = 0;

  // ---- scene / feed ----
  sceneType: SceneType = "text";
  sceneText = "VERIFLY";
  SW = 200;
  SH = 200;
  sceneCanvas!: HTMLCanvasElement;
  customDraw: ((ctx: CanvasRenderingContext2D, now: number) => void) | null = null;
  totalSpikes = 0;
  private sctx!: CanvasRenderingContext2D;
  private sdata: Uint8ClampedArray | null = null;
  private prevLum!: Float32Array;
  private FOV = 82;

  running = true;
  spikesThisFrame = 0;
  spikeAccum = 0; // for rate readout
  excAccum = 0;
  inhAccum = 0;

  constructor() {
    const rnd = mulberry32(1337);
    this.initGeometry(rnd);
    this.initPopulation(rnd);
    this.initEdges(rnd);
    this.initEye(rnd);
    this.initScene();
  }

  // ---------------- geometry: a fly-brain-ish volume ----------------
  private initGeometry(rnd: () => number) {
    const P = this.P;
    this.positions = new Float32Array(P * 3);
    // three regions: central complex + two optic lobes
    for (let i = 0; i < P; i++) {
      const r = rnd();
      let cx = 0,
        rx = 3.4,
        ry = 2.0,
        rz = 2.4;
      if (r < 0.42) {
        cx = 0; // central
        rx = 2.6; ry = 2.1; rz = 2.4;
      } else if (r < 0.71) {
        cx = -3.6; // left lobe
        rx = 2.2; ry = 1.9; rz = 1.9;
      } else {
        cx = 3.6; // right lobe
        rx = 2.2; ry = 1.9; rz = 1.9;
      }
      // point in unit ball, slight surface bias
      let x = 0, y = 0, z = 0, d = 2;
      while (d > 1) {
        x = rnd() * 2 - 1;
        y = rnd() * 2 - 1;
        z = rnd() * 2 - 1;
        d = x * x + y * y + z * z;
      }
      const shell = 0.55 + 0.45 * Math.cbrt(rnd()); // push some toward the shell
      this.positions[i * 3] = cx + x * rx * shell;
      this.positions[i * 3 + 1] = y * ry * shell + Math.sin(cx) * 0.2;
      this.positions[i * 3 + 2] = z * rz * shell;
    }
  }

  private initPopulation(rnd: () => number) {
    const P = this.P;
    this.V = new Float32Array(P);
    this.Vth = new Float32Array(P);
    this.refr = new Int16Array(P);
    this.nt = new Int8Array(P);
    this.spiked = new Uint8Array(P);
    this.bright = new Float32Array(P);
    this.Isyn = new Float32Array(P);
    this.sectW = [];
    for (let i = 0; i < P; i++) {
      this.V[i] = rnd() * 0.5;
      this.Vth[i] = 0.9 + rnd() * 0.25;
      const r = rnd();
      this.nt[i] = r < 0.82 ? 0 : r < 0.91 ? 1 : 2;
      const w: Record<number, number> = {};
      const nc = 1 + ((rnd() * 3) | 0);
      for (let j = 0; j < nc; j++) w[(rnd() * this.SECT) | 0] = 0.5 + rnd() * 1.1;
      this.sectW.push(w);
    }
    this.sectorDrive = new Float32Array(this.SECT);
  }

  // connect each neuron to a few near-ish neighbours (cheap: sample + pick nearest)
  private initEdges(rnd: () => number) {
    const P = this.P;
    const pos = this.positions;
    this.syn = [];
    const pairs: number[] = [];
    const pre: number[] = [];
    for (let i = 0; i < P; i++) {
      const out: Array<{ t: number; w: number }> = [];
      const sign = this.nt[i] === 0 ? 1 : -1;
      const samples = 26;
      const cand: Array<{ j: number; d: number }> = [];
      const ix = pos[i * 3], iy = pos[i * 3 + 1], iz = pos[i * 3 + 2];
      for (let s = 0; s < samples; s++) {
        const j = (rnd() * P) | 0;
        if (j === i) continue;
        const dx = pos[j * 3] - ix,
          dy = pos[j * 3 + 1] - iy,
          dz = pos[j * 3 + 2] - iz;
        cand.push({ j, d: dx * dx + dy * dy + dz * dz });
      }
      cand.sort((a, b) => a.d - b.d);
      const k = 2 + ((rnd() * 3) | 0);
      for (let c = 0; c < k && c < cand.length; c++) {
        const j = cand[c].j;
        out.push({ t: j, w: sign * (0.05 + rnd() * 0.14) });
        pairs.push(i, j);
        pre.push(i);
      }
    }
    this.syn = this.buildSyn(pairs);
    this.edgePairs = new Uint32Array(pairs);
    this.edgePre = new Uint32Array(pre);
    this.nEdges = pre.length;
    this.edgeGlow = new Float32Array(this.nEdges);
  }

  private buildSyn(pairs: number[]) {
    const P = this.P;
    const out: Array<Array<{ t: number; w: number }>> = [];
    for (let i = 0; i < P; i++) out.push([]);
    for (let e = 0; e < pairs.length; e += 2) {
      const i = pairs[e],
        j = pairs[e + 1];
      const sign = this.nt[i] === 0 ? 1 : -1;
      out[i].push({ t: j, w: sign * 0.12 });
    }
    return out;
  }

  // ---------------- compound eyes ----------------
  private initEye(rnd: () => number) {
    const per = 190; // per eye
    const total = per * 2;
    this.eyeN = total;
    this.eyePos = new Float32Array(total * 3);
    this.eyeUV = new Float32Array(total * 2);
    this.eyeSector = new Int16Array(total);
    this.eyeSide = new Int8Array(total);
    const R = 1.9;
    let idx = 0;
    for (let side = 0; side < 2; side++) {
      const sign = side === 0 ? -1 : 1;
      const cx = sign * 5.1;
      for (let n = 0; n < per; n++) {
        // fibonacci hemisphere facing forward-outward
        const t = n / per;
        const phi = Math.acos(1 - t); // 0..~pi/2 (hemisphere)
        const theta = n * 2.399963;
        const hx = Math.sin(phi) * Math.cos(theta);
        const hy = Math.sin(phi) * Math.sin(theta);
        const hz = Math.cos(phi);
        // orient hemisphere to face +z and outward (+/-x)
        const ox = hx * 0.55 + sign * hz * 0.85;
        const oz = hz * 0.75 - sign * hx * 0.0 + hx * 0.0;
        this.eyePos[idx * 3] = cx + ox * R;
        this.eyePos[idx * 3 + 1] = hy * R * 1.15;
        this.eyePos[idx * 3 + 2] = 1.2 + oz * R;
        // sampling coords in eye plane (nx,ny)
        const nx = hx; // -1..1
        const ny = hy;
        this.eyeUV[idx * 2] = nx;
        this.eyeUV[idx * 2 + 1] = ny;
        this.eyeSide[idx] = sign;
        const ang = Math.atan2(ny, nx);
        this.eyeSector[idx] =
          ((((ang + Math.PI) / (2 * Math.PI)) * this.SECT) | 0) % this.SECT;
        idx++;
      }
    }
    this.eyeDrive = new Float32Array(total);
    this.prevLum = new Float32Array(total);
  }

  // ---------------- scene / feed ----------------
  private initScene() {
    const c = document.createElement("canvas");
    c.width = this.SW;
    c.height = this.SH;
    this.sceneCanvas = c;
    this.sctx = c.getContext("2d", { willReadFrequently: true })!;
  }

  setScene(type: SceneType, text?: string) {
    this.sceneType = type;
    if (type === "text") this.sceneText = (text || "?").toUpperCase().slice(0, 42);
    for (let i = 0; i < 4; i++) this.dnV[i] = 0;
  }

  sceneLabel() {
    if (this.sceneType === "text") return this.sceneText;
    return (
      {
        face: "a face",
        dot: "moving dot",
        noise: "static noise",
        grating: "drifting grating",
      } as Record<string, string>
    )[this.sceneType];
  }

  private drawScene(now: number) {
    const g = this.sctx,
      SW = this.SW,
      SH = this.SH;
    g.fillStyle = "#000";
    g.fillRect(0, 0, SW, SH);
    if (this.sceneType === "text") {
      g.save();
      g.translate(SW / 2, SH / 2);
      g.translate(Math.sin(now * 0.0011) * 6, Math.cos(now * 0.0009) * 5);
      g.textAlign = "center";
      g.textBaseline = "middle";
      const txt = this.sceneText || " ";
      const fs = clamp((300 / Math.max(3, txt.length)) * 1.6, 26, 112);
      g.font = `800 ${fs}px Syne, sans-serif`;
      g.fillStyle = "#eafff4";
      g.fillText(txt, 0, 0);
      g.globalAlpha = 0.28;
      g.font = `800 ${fs * 0.5}px Syne, sans-serif`;
      g.fillText(txt, 0, -SH * 0.4);
      g.fillText(txt, 0, SH * 0.4);
      g.restore();
    } else if (this.sceneType === "face") {
      g.strokeStyle = "#eafff4";
      g.fillStyle = "#eafff4";
      g.lineWidth = 6;
      const bob = Math.sin(now * 0.002) * 4;
      g.beginPath(); g.arc(SW / 2, SH / 2 + bob, 72, 0, 7); g.stroke();
      g.beginPath(); g.arc(72, 88 + bob, 12, 0, 7); g.fill();
      g.beginPath(); g.arc(128, 88 + bob, 12, 0, 7); g.fill();
      g.beginPath(); g.arc(SW / 2, 118 + bob, 42, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    } else if (this.sceneType === "dot") {
      const x = SW / 2 + Math.cos(now * 0.0016) * 66;
      const y = SH / 2 + Math.sin(now * 0.0021) * 58;
      const grad = g.createRadialGradient(x, y, 2, x, y, 26);
      grad.addColorStop(0, "#eafff4");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.beginPath(); g.arc(x, y, 26, 0, 7); g.fill();
    } else if (this.sceneType === "noise") {
      const img = g.createImageData(SW, SH);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    } else if (this.sceneType === "grating") {
      const ph = now * 0.05;
      for (let x = 0; x < SW; x++) {
        const b = ((Math.sin(x * 0.14 + ph) * 0.5 + 0.5) * 255) | 0;
        g.fillStyle = `rgb(${b},${b},${b})`;
        g.fillRect(x, 0, 1, SH);
      }
    } else if (this.sceneType === "custom") {
      if (this.customDraw) this.customDraw(g, now);
    }
    this.sdata = g.getImageData(0, 0, SW, SH).data;
  }

  private sampleRetina(cosT: number, sinT: number) {
    const N = this.eyeN,
      SW = this.SW,
      SH = this.SH,
      d = this.sdata;
    let meanLum = 0;
    const lum = this.prevLum; // reuse temporarily? no—need prev. use scratch:
    const cur = this._lumScratch || (this._lumScratch = new Float32Array(N));
    for (let i = 0; i < N; i++) {
      const nx = this.eyeUV[i * 2],
        ny = this.eyeUV[i * 2 + 1];
      const rx = nx * cosT - ny * sinT;
      const ry = nx * sinT + ny * cosT;
      let sx = this.gx + rx * this.FOV;
      let sy = this.gy + ry * this.FOV;
      sx = ((sx % SW) + SW) % SW;
      sy = ((sy % SH) + SH) % SH;
      const ix = sx | 0,
        iy = sy | 0;
      const l = d ? d[(iy * SW + ix) * 4] / 255 : 0;
      cur[i] = l;
      meanLum += l;
    }
    meanLum /= N;
    for (let i = 0; i < N; i++) {
      const temporal = Math.abs(cur[i] - lum[i]) * 3.2;
      const spatial = Math.abs(cur[i] - meanLum) * 0.9;
      let dv = temporal + spatial;
      if (dv > 1) dv = 1;
      this.eyeDrive[i] = this.eyeDrive[i] * 0.55 + dv * 0.45;
      lum[i] = cur[i];
    }
  }
  private _lumScratch: Float32Array | null = null;

  private computeSectors() {
    const cnt = new Int32Array(this.SECT);
    this.sectorDrive.fill(0);
    for (let i = 0; i < this.eyeN; i++) {
      const s = this.eyeSector[i];
      this.sectorDrive[s] += this.eyeDrive[i];
      cnt[s]++;
    }
    for (let k = 0; k < this.SECT; k++) if (cnt[k]) this.sectorDrive[k] /= cnt[k];
  }

  private stepPop() {
    const P = this.P;
    this.computeSectors();
    this.Isyn.fill(0);
    for (let i = 0; i < P; i++) {
      if (this.spiked[i]) {
        const out = this.syn[i];
        for (let k = 0; k < out.length; k++) this.Isyn[out[k].t] += out[k].w;
      }
    }
    let frameSpk = 0,
      e = 0,
      inh = 0;
    for (let i = 0; i < P; i++) {
      this.spiked[i] = 0;
      this.bright[i] *= 0.86; // decay glow
      if (this.refr[i] > 0) {
        this.refr[i]--;
        this.V[i] *= 0.6;
        continue;
      }
      let ext = 0;
      const w = this.sectW[i];
      for (const key in w) ext += this.sectorDrive[+key] * w[key];
      const I = ext * 0.9 + this.Isyn[i] + (Math.random() - 0.5) * 0.06;
      this.V[i] += -this.V[i] * 0.16 + I * 0.5;
      if (this.V[i] < 0) this.V[i] = 0;
      if (this.V[i] >= this.Vth[i]) {
        this.spiked[i] = 1;
        this.V[i] = 0;
        this.refr[i] = 3 + ((Math.random() * 4) | 0);
        this.bright[i] = 1.4;
        frameSpk++;
        if (this.nt[i] === 0) e++;
        else inh++;
      }
    }
    this.spikesThisFrame = frameSpk;
    this.totalSpikes += frameSpk;
    this.spikeAccum += frameSpk;
    this.excAccum += e;
    this.inhAccum += inh;

    // edge glow: light outgoing edges of spikers, decay the rest
    const eg = this.edgeGlow,
      pre = this.edgePre;
    for (let k = 0; k < this.nEdges; k++) {
      eg[k] *= 0.82;
      if (this.spiked[pre[k]]) eg[k] = 1;
    }
  }

  private stepDN() {
    let leftD = 0,
      rightD = 0,
      fovD = 0,
      total = 0,
      lc = 0,
      rc = 0,
      fc = 0;
    for (let i = 0; i < this.eyeN; i++) {
      const d = this.eyeDrive[i];
      const nx = this.eyeUV[i * 2],
        ny = this.eyeUV[i * 2 + 1];
      total += d;
      if (this.eyeSide[i] < 0) {
        leftD += d;
        lc++;
      } else {
        rightD += d;
        rc++;
      }
      if (nx * nx + ny * ny < 0.16) {
        fovD += d;
        fc++;
      }
    }
    total /= this.eyeN;
    leftD = lc ? leftD / lc : 0;
    rightD = rc ? rightD / rc : 0;
    fovD = fc ? fovD / fc : 0;
    const popAct = this.spikesThisFrame / this.P;

    const inp = [
      Math.max(0, leftD - rightD) * 3.4 + popAct * 0.15,
      total * 2.4 + 0.1 + popAct * 0.25,
      Math.max(0, rightD - leftD) * 3.4 + popAct * 0.15,
      fovD * 3.0,
    ];
    if (this.clickPulse > 0) this.clickPulse *= 0.9;
    for (let i = 0; i < 4; i++) {
      if (this.dnCd[i] > 0) {
        this.dnCd[i]--;
        this.dnFired[i] = Math.max(0, this.dnFired[i] - 1);
      }
      this.dnV[i] += -this.dnV[i] * 0.1 + inp[i] * 0.5;
      if (this.dnV[i] < 0) this.dnV[i] = 0;
      if (this.dnV[i] >= this.dnTh[i] && this.dnCd[i] === 0) {
        this.dnV[i] = 0;
        this.dnCount[i]++;
        this.dnCd[i] = 6;
        this.dnFired[i] = 10;
        if (i === 0) this.heading -= 0.34;
        else if (i === 2) this.heading += 0.34;
        else if (i === 1) {
          this.gx += Math.cos(this.heading) * 7.5;
          this.gy += Math.sin(this.heading) * 7.5;
        } else if (i === 3) {
          this.clicks++;
          this.clickPulse = 1;
        }
      }
    }
    // keep gaze on-scene (reflect)
    if (this.gx < 8) { this.gx = 8; this.heading = Math.PI - this.heading; }
    if (this.gx > this.SW - 8) { this.gx = this.SW - 8; this.heading = Math.PI - this.heading; }
    if (this.gy < 8) { this.gy = 8; this.heading = -this.heading; }
    if (this.gy > this.SH - 8) { this.gy = this.SH - 8; this.heading = -this.heading; }
  }

  step(now: number) {
    if (!this.running) return;
    const cosT = Math.cos(this.heading),
      sinT = Math.sin(this.heading);
    this.drawScene(now);
    this.sampleRetina(cosT, sinT);
    this.stepPop();
    this.stepDN();
  }

  // rate helpers (call ~ every 0.7s)
  drainRate(dtSec: number) {
    const rate = dtSec > 0 ? Math.round(this.spikeAccum / dtSec) : 0;
    const tot = this.excAccum + this.inhAccum || 1;
    const ep = Math.round((this.excAccum / tot) * 100);
    this.spikeAccum = 0;
    this.excAccum = 0;
    this.inhAccum = 0;
    return { rate, ep };
  }

  activeCount() {
    let a = 0;
    for (let i = 0; i < this.P; i++) if (this.V[i] > 0.3) a++;
    return a;
  }
}
