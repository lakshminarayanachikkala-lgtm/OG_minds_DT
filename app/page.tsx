"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Tech =
  | "ombre"
  | "dipDye"
  | "tieDyeSpiral"
  | "bandhaniDots"
  | "leheriya"
  | "shiboriItajime"
  | "shiboriArashi"
  | "shiboriKumo"
  | "shiboriNui"
  | "shiboriKanoko"
  | "batikCrackle"
  | "batikFloral"
  | "ikatWarp"
  | "ikatWeft"
  | "spaceDye";

const TECHS: { key: Tech; label: string }[] = [
  // existing / core
  { key: "ombre", label: "Ombre (Gradient Dye)" },
  { key: "dipDye", label: "Dip Dye (Hard Edge)" },
  { key: "tieDyeSpiral", label: "Tie & Dye — Spiral" },
  { key: "bandhaniDots", label: "Bandhani — Dots" },
  { key: "leheriya", label: "Leheriya (Diagonal Waves)" },

  // shibori family (more correct)
  { key: "shiboriItajime", label: "Shibori — Itajime (Fold Resist)" },
  { key: "shiboriArashi", label: "Shibori — Arashi (Pole Wrap)" },
  { key: "shiboriKumo", label: "Shibori — Kumo (Spider)" },
  { key: "shiboriNui", label: "Shibori — Nui (Stitched Resist)" },
  { key: "shiboriKanoko", label: "Shibori — Kanoko (Spots)" },

  // batik family
  { key: "batikCrackle", label: "Batik — Crackle Wax" },
  { key: "batikFloral", label: "Batik — Floral Wax Motif" },

  // ikat + yarn dye
  { key: "ikatWarp", label: "Ikat — Warp Blur" },
  { key: "ikatWeft", label: "Ikat — Weft Blur" },
  { key: "spaceDye", label: "Space Dye (Yarn Color Runs)" }
];

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function hexToRgb(hex: string) {
  const v = hex.replace("#", "").trim();
  const full = v.length === 3 ? v.split("").map((c) => c + c).join("") : v;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}
function clamp255(x: number) {
  return Math.max(0, Math.min(255, x));
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Value noise (fast “fabric-like” randomness)
function valueNoise2D(x: number, y: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;

  const hash = (ix: number, iy: number) => {
    let h = ix * 374761393 + iy * 668265263 + seed * 69069;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  const v00 = hash(xi, yi);
  const v10 = hash(xi + 1, yi);
  const v01 = hash(xi, yi + 1);
  const v11 = hash(xi + 1, yi + 1);

  // smoothstep
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);

  const a = v00 * (1 - u) + v10 * u;
  const b = v01 * (1 - u) + v11 * u;
  return a * (1 - v) + b * v; // 0..1
}

// object-fit: cover (fixes your “yellow border/rectangle” issue)
function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number
) {
  const iw = img.width;
  const ih = img.height;
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
}

function luminance(r: number, g: number, b: number) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; // 0..1
}

// Keep fabric texture by tinting based on brightness
function dyeTintedColor(
  baseR: number,
  baseG: number,
  baseB: number,
  dyeR: number,
  dyeG: number,
  dyeB: number
) {
  const L = luminance(baseR, baseG, baseB); // preserve shading
  const shade = 0.35 + 0.65 * L; // darker areas stay darker
  return {
    r: clamp255(dyeR * shade),
    g: clamp255(dyeG * shade),
    b: clamp255(dyeB * shade)
  };
}

// Technique masks (return 0..1 : 1=dyed, 0=resist)
function maskForTech(
  tech: Tech,
  x: number,
  y: number,
  w: number,
  h: number,
  scale: number,
  seed: number
) {
  const nx = x / Math.max(1, w);
  const ny = y / Math.max(1, h);

  // A little “fiber noise” for realism
  const fiber = valueNoise2D(nx * 60 * scale, ny * 60 * scale, seed + 11);
  const fiber2 = valueNoise2D(nx * 140 * scale, ny * 140 * scale, seed + 29);
  const fabricGrain = 0.85 + 0.15 * (0.6 * fiber + 0.4 * fiber2);

  if (tech === "ombre") {
    // smooth gradient
    const g = ny;
    return clamp01(g * fabricGrain);
  }

  if (tech === "dipDye") {
    // sharper edge + slight bleeding
    const edge = 0.55 + 0.06 * (fiber - 0.5);
    const v = ny > edge ? 1 : 0;
    const bleed = clamp01((ny - edge) * 10);
    return clamp01((0.2 * v + 0.8 * bleed) * fabricGrain);
  }

  if (tech === "tieDyeSpiral") {
    // classic spiral + rings
    const cx = 0.5;
    const cy = 0.5;
    const dx = nx - cx;
    const dy = ny - cy;
    const r = Math.sqrt(dx * dx + dy * dy);
    const a = Math.atan2(dy, dx);
    const t = a * 3 + r * 18 * scale;
    const ring = (Math.sin(t) + 1) / 2; // 0..1
    // create resist highlights
    const resist = ring > 0.72 ? 0.15 : 1.0;
    return clamp01(resist * fabricGrain);
  }

  if (tech === "bandhaniDots") {
    // dotted resist — smaller + more dense, with “halo”
    const cell = Math.max(18, 70 * (1 / Math.max(0.25, scale)));
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    const rng = mulberry32((gx * 73856093) ^ (gy * 19349663) ^ (seed + 7));
    const cx = (gx + 0.5) * cell + (rng() - 0.5) * cell * 0.35;
    const cy = (gy + 0.5) * cell + (rng() - 0.5) * cell * 0.35;
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    const r0 = cell * 0.11;
    const halo = cell * 0.19;
    if (d < r0) return 0.06; // tight resist dot
    if (d < halo) return 0.35; // halo
    return clamp01(1.0 * fabricGrain);
  }

  if (tech === "leheriya") {
    // diagonal wave bands
    const freq = 14 * scale;
    const t = (nx + ny) * freq * Math.PI * 2;
    const wave = (Math.sin(t) + 1) / 2;
    const band = wave > 0.55 ? 1 : 0.25; // resist-ish stripe gaps
    return clamp01(band * fabricGrain);
  }

  if (tech === "shiboriItajime") {
    // fold symmetry: mirrored triangles/squares
    const cell = Math.max(26, 120 * (1 / Math.max(0.25, scale)));
    const u = (x % cell) / cell;
    const v = (y % cell) / cell;
    const d = Math.min(u, v, 1 - u, 1 - v);
    const core = d > 0.22 ? 0.18 : 1.0; // resist in the center-ish
    // add light edge bleeding
    const edgeBleed = clamp01(1 - Math.abs(d - 0.22) * 10);
    return clamp01((core + 0.15 * edgeBleed) * fabricGrain);
  }

  if (tech === "shiboriArashi") {
    // diagonal wrapped stripes + roughness
    const freq = 0.05 * scale;
    const t = x * freq + y * freq * 0.7;
    const stripe = (Math.sin(t) + 1) / 2;
    const hard = stripe > 0.58 ? 1 : 0.22;
    const rough = 0.9 + 0.1 * (fiber - 0.5);
    return clamp01(hard * rough * fabricGrain);
  }

  if (tech === "shiboriKumo") {
    // spiderweb circles
    const cx = 0.5 + 0.12 * (fiber - 0.5);
    const cy = 0.5 + 0.12 * (fiber2 - 0.5);
    const dx = nx - cx;
    const dy = ny - cy;
    const r = Math.sqrt(dx * dx + dy * dy);
    const rings = Math.sin(r * 40 * scale) * 0.5 + 0.5;
    const resist = rings > 0.72 ? 0.2 : 1.0;
    return clamp01(resist * fabricGrain);
  }

  if (tech === "shiboriNui") {
    // stitched resist: parallel stitched lines with gathers
    const line = Math.sin((ny * 26 * scale + 0.2 * fiber) * Math.PI * 2) * 0.5 + 0.5;
    const resist = line > 0.62 ? 0.25 : 1.0;
    return clamp01(resist * fabricGrain);
  }

  if (tech === "shiboriKanoko") {
    // clustered spots (like tied sections)
    const n = valueNoise2D(nx * 10 * scale, ny * 10 * scale, seed + 99);
    const spots = n > 0.62 ? 0.2 : 1.0;
    const bleed = 0.85 + 0.15 * fiber;
    return clamp01(spots * bleed * fabricGrain);
  }

  if (tech === "batikCrackle") {
    // crackle: thin resist veins
    const n1 = valueNoise2D(nx * 16 * scale, ny * 16 * scale, seed + 123);
    const n2 = valueNoise2D(nx * 32 * scale, ny * 32 * scale, seed + 321);
    const n = (0.6 * n1 + 0.4 * n2);
    const vein = Math.abs(n - 0.5);
    const resist = vein < 0.04 ? 0.15 : 1.0; // thin crack lines
    return clamp01(resist * fabricGrain);
  }

  if (tech === "batikFloral") {
    // floral-ish wax motifs with resist centers
    const t = Math.sin(nx * 10 * scale * Math.PI * 2) * Math.cos(ny * 8 * scale * Math.PI * 2);
    const petal = Math.abs(t);
    const resist = petal > 0.72 ? 0.22 : 1.0;
    return clamp01(resist * fabricGrain);
  }

  if (tech === "ikatWarp") {
    // vertical blur zones (warp)
    const band = Math.sin(nx * 18 * scale * Math.PI * 2) * 0.5 + 0.5;
    // soft edges -> resist near band transitions
    const soft = 0.35 + 0.65 * band;
    const fray = 0.9 + 0.1 * (fiber - 0.5);
    return clamp01(soft * fray * fabricGrain);
  }

  if (tech === "ikatWeft") {
    // horizontal blur zones (weft)
    const band = Math.sin(ny * 16 * scale * Math.PI * 2) * 0.5 + 0.5;
    const soft = 0.35 + 0.65 * band;
    const fray = 0.9 + 0.1 * (fiber2 - 0.5);
    return clamp01(soft * fray * fabricGrain);
  }

  if (tech === "spaceDye") {
    // color runs along yarn direction (diagonal-ish streaks)
    const t = (nx * 22 + ny * 10) * scale;
    const run = valueNoise2D(t, ny * 6 * scale, seed + 777);
    const streak = clamp01(0.25 + 0.9 * run);
    return clamp01(streak * fabricGrain);
  }

  return fabricGrain;
}

function applyDyeingEffect(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  opts: {
    tech: Tech;
    w: number;
    h: number;
    dyeHex: string;
    intensity: number; // 0..1
    scale: number; // 0.2..2
    softness: number; // 0..8
    seed: number;
  }
) {
  const { tech, w, h, dyeHex, intensity, scale, softness, seed } = opts;

  // draw base image (cover)
  ctx.clearRect(0, 0, w, h);
  drawImageCover(ctx, img, w, h);

  const base = ctx.getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);

  const dye = hexToRgb(dyeHex);

  for (let i = 0; i < base.data.length; i += 4) {
    const x = (i / 4) % w;
    const y = Math.floor(i / 4 / w);

    const r = base.data[i + 0];
    const g = base.data[i + 1];
    const b = base.data[i + 2];
    const a = base.data[i + 3];

    const m = maskForTech(tech, x, y, w, h, scale, seed);
    const mix = clamp01(intensity * m);

    const dyed = dyeTintedColor(r, g, b, dye.r, dye.g, dye.b);

    out.data[i + 0] = clamp255(r * (1 - mix) + dyed.r * mix);
    out.data[i + 1] = clamp255(g * (1 - mix) + dyed.g * mix);
    out.data[i + 2] = clamp255(b * (1 - mix) + dyed.b * mix);
    out.data[i + 3] = a;
  }

  ctx.putImageData(out, 0, 0);

  // softness / bleed (cheap and effective)
  if (softness > 0) {
    ctx.globalAlpha = 0.35;
    const steps = Math.min(8, Math.floor(softness));
    for (let k = 0; k < steps; k++) {
      ctx.drawImage(ctx.canvas, 0.5, 0.5, w - 1, h - 1);
      ctx.drawImage(ctx.canvas, -0.5, -0.5, w + 1, h + 1);
    }
    ctx.globalAlpha = 1;
  }
}



function PreviewCanvas({
  img,
  tech,
  dyeHex,
  intensity,
  scale,
  softness,
  seed
}: {
  img: HTMLImageElement;
  tech: Tech;
  dyeHex: string;
  intensity: number;
  scale: number;
  softness: number;
  seed: number;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const ro = new ResizeObserver(() => {
      const rect = wrap.getBoundingClientRect();
      const cssW = Math.max(1, Math.round(rect.width));
      const cssH = Math.max(1, Math.round(rect.height));

      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);

      // draw in CSS pixels
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      applyDyeingEffect(ctx, img, {
        tech,
        w: cssW,
        h: cssH,
        dyeHex,
        intensity,
        scale,
        softness,
        seed: (seed + tech.length * 991) >>> 0
      });
    });

    ro.observe(wrap);
    return () => ro.disconnect();
  }, [img, tech, dyeHex, intensity, scale, softness, seed]);

  return (
    <div
      ref={wrapRef}
      className="w-full aspect-[16/10] rounded-xl border bg-white shadow-sm overflow-hidden"
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}

 

export default function Page() {
  const [img, setImg] = useState<HTMLImageElement | null>(null);

  const [dyeHex, setDyeHex] = useState("#8b1cf5"); // violet-ish
  const [intensityPct, setIntensityPct] = useState(65);
  const [scale, setScale] = useState(1.0);
  const [softness, setSoftness] = useState(3);
  const [seed, setSeed] = useState(2026);

  const intensity = useMemo(() => clamp01(intensityPct / 100), [intensityPct]);

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-semibold">OG Minds — Dyeing Techniques Explorer</h1>
            <p className="text-neutral-600 mt-1">
              Upload a fabric/photo and preview 15 dyeing techniques.
            </p>
          </div>

          <label className="inline-flex items-center gap-3 rounded-2xl border bg-white px-4 py-2 shadow-sm">
            <span className="text-sm text-neutral-700">Upload image</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const loaded = await loadImageFromFile(file);
                setImg(loaded);
              }}
              className="text-sm"
            />
          </label>
        </div>

        {!img ? (
          <div className="mt-10 rounded-3xl border bg-white p-10 text-center text-neutral-600">
            Upload a base/fabric image (PNG/JPG/WebP) to generate dye previews.
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-1 rounded-3xl border bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-lg">Controls</h2>

              <div className="mt-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm">Dye color</span>
                  <input
                    type="color"
                    value={dyeHex}
                    onChange={(e) => setDyeHex(e.target.value)}
                    className="h-8 w-12 rounded"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-sm">
                    <span>Intensity</span>
                    <span className="text-neutral-600">{intensityPct}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={intensityPct}
                    onChange={(e) => setIntensityPct(Number(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-sm">
                    <span>Pattern scale</span>
                    <span className="text-neutral-600">{scale.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={0.3}
                    max={2.2}
                    step={0.05}
                    value={scale}
                    onChange={(e) => setScale(Number(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-sm">
                    <span>Softness (bleed)</span>
                    <span className="text-neutral-600">{softness}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={8}
                    value={softness}
                    onChange={(e) => setSoftness(Number(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-sm">
                    <span>Seed</span>
                    <span className="text-neutral-600">{seed}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={9999}
                    value={seed}
                    onChange={(e) => setSeed(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="mt-6 text-xs text-neutral-500">
                Tip: increase Softness to make dyes look more natural.
              </div>
            </div>

            <div className="md:col-span-3">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {TECHS.map((t) => (
                  <div key={t.key} className="space-y-2">
                    <div className="text-sm font-medium text-neutral-800">{t.label}</div>
                    <PreviewCanvas
                      img={img}
                      tech={t.key}
                      dyeHex={dyeHex}
                      intensity={intensity}
                      scale={scale}
                      softness={softness}
                      seed={seed}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
