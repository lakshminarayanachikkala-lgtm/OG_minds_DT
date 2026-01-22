"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Tech =
  | "ombre"
  | "tieDye"
  | "shiboriItajime"
  | "shiboriArashi"
  | "batik"
  | "ikat";

const TECHS: { key: Tech; label: string }[] = [
  { key: "ombre", label: "Ombre / Dip Dye" },
  { key: "tieDye", label: "Tie & Dye (Bandhani vibe)" },
  { key: "shiboriItajime", label: "Shibori — Itajime" },
  { key: "shiboriArashi", label: "Shibori — Arashi" },
  { key: "batik", label: "Batik (Wax Resist look)" },
  { key: "ikat", label: "Ikat (Blurred resist)" }
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
  const n = parseInt(v.length === 3 ? v.split("").map((c) => c + c).join("") : v, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function clamp255(x: number) {
  return Math.max(0, Math.min(255, x));
}

function seededRand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
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
    scale: number; // pattern scale
    blur: number; // 0..8
    seed: number;
  }
) {
  const { tech, w, h, dyeHex, intensity, scale, blur, seed } = opts;

  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const base = ctx.getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);

  const dye = hexToRgb(dyeHex);
  const rand = seededRand(seed);

  // helper patterns (0..1)
  const ombreMask = (y: number) => y / (h - 1);

  const tieMask = (x: number, y: number) => {
    // bandhani-like dots: grid + jittered circles
    const cell = Math.max(18, 80 * (1 / Math.max(0.2, scale)));
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    // pseudo center per cell
    const cx = (gx + 0.5) * cell + (rand() - 0.5) * cell * 0.2;
    const cy = (gy + 0.5) * cell + (rand() - 0.5) * cell * 0.2;
    const dx = x - cx;
    const dy = y - cy;
    const r = cell * 0.18;
    const d = Math.sqrt(dx * dx + dy * dy);
    // dots as resist (less dye inside)
    const dot = d < r ? 0.05 : 1.0;
    // add mild ripple
    const ripple = 0.9 + 0.1 * Math.sin((x + y) / (cell * 0.6));
    return dot * ripple;
  };

  const itajimeMask = (x: number, y: number) => {
    // folded triangles/squares: hard geometric symmetry
    const cell = Math.max(24, 120 * (1 / Math.max(0.2, scale)));
    const u = (x % cell) / cell;
    const v = (y % cell) / cell;
    const tri = Math.min(u, v, 1 - u, 1 - v) * 4; // 0..1 edges
    const hard = tri > 0.5 ? 1 : 0.2; // resist inside shapes
    return hard;
  };

  const arashiMask = (x: number, y: number) => {
    // diagonal stripes (wrapped pole)
    const freq = Math.max(0.02, 0.09 * scale);
    const t = x * freq + y * freq * 0.6;
    const stripe = (Math.sin(t) + 1) / 2; // 0..1
    // make stripes sharper
    const sharp = stripe > 0.55 ? 1 : 0.25;
    return sharp;
  };

  const batikMask = (x: number, y: number) => {
    // wax cracks: vein-like resist
    const n1 = Math.sin((x * 0.06 * scale) + (y * 0.02 * scale));
    const n2 = Math.sin((x * 0.03 * scale) - (y * 0.07 * scale));
    const n = (n1 + n2) * 0.5;
    const crack = Math.abs(n) > 0.85 ? 0.12 : 1.0; // cracks resist dye
    return crack;
  };

  const ikatMask = (x: number, y: number) => {
    // blurred edges stripes (warp/weft resist vibe)
    const cell = Math.max(22, 90 * (1 / Math.max(0.2, scale)));
    const a = (Math.sin(x / (cell * 0.45)) + 1) / 2;
    const b = (Math.sin(y / (cell * 0.5)) + 1) / 2;
    // soften = near middle of wave is more dyed, edges are resist
    const soft = 0.4 + 0.6 * (a * 0.6 + b * 0.4);
    return soft;
  };

  // Apply technique to pixels
  for (let i = 0; i < base.data.length; i += 4) {
    const px = (i / 4) % w;
    const py = Math.floor(i / 4 / w);

    const r = base.data[i + 0];
    const g = base.data[i + 1];
    const b = base.data[i + 2];
    const a = base.data[i + 3];

    let m = 1.0;

    if (tech === "ombre") m = ombreMask(py);
    if (tech === "tieDye") m = tieMask(px, py);
    if (tech === "shiboriItajime") m = itajimeMask(px, py);
    if (tech === "shiboriArashi") m = arashiMask(px, py);
    if (tech === "batik") m = batikMask(px, py);
    if (tech === "ikat") m = ikatMask(px, py);

    // intensity mixes dye with original
    const mix = intensity * m;

    out.data[i + 0] = clamp255(r * (1 - mix) + dye.r * mix);
    out.data[i + 1] = clamp255(g * (1 - mix) + dye.g * mix);
    out.data[i + 2] = clamp255(b * (1 - mix) + dye.b * mix);
    out.data[i + 3] = a;
  }

  ctx.putImageData(out, 0, 0);

  // Quick blur pass (cheap visual softness)
  if (blur > 0) {
    ctx.globalAlpha = 0.5;
    for (let k = 0; k < Math.min(6, blur); k++) {
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
  blur
}: {
  img: HTMLImageElement;
  tech: Tech;
  dyeHex: string;
  intensity: number;
  scale: number;
  blur: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = 360;
    const cssH = 220;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    applyDyeingEffect(ctx, img, {
      tech,
      w: cssW,
      h: cssH,
      dyeHex,
      intensity,
      scale,
      blur,
      seed: (tech.length * 991 + 2026) >>> 0
    });
  }, [img, tech, dyeHex, intensity, scale, blur]);

  return <canvas ref={ref} className="rounded-xl block border bg-white" />;
}

export default function Page() {
  const [img, setImg] = useState<HTMLImageElement | null>(null);

  const [dyeHex, setDyeHex] = useState("#1d4ed8"); // blue
  const [intensity, setIntensity] = useState(0.65);
  const [scale, setScale] = useState(0.8);
  const [blur, setBlur] = useState(2);

  const intensityPct = useMemo(() => Math.round(intensity * 100), [intensity]);

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-semibold">OG Minds — Dyeing Techniques Explorer</h1>
            <p className="text-neutral-600 mt-1">
              Upload a fabric image and preview dyeing techniques.
            </p>
          </div>

          <label className="inline-flex items-center gap-3 rounded-2xl border bg-white px-4 py-2 shadow-sm">
            <span className="text-sm text-neutral-700">Upload fabric</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
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
            Upload a base/fabric image (PNG/JPG) to generate dyeing previews.
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
                    onChange={(e) => setIntensity(Number(e.target.value) / 100)}
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
                    min={0.2}
                    max={2.0}
                    step={0.05}
                    value={scale}
                    onChange={(e) => setScale(Number(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-sm">
                    <span>Softness (blur)</span>
                    <span className="text-neutral-600">{blur}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={8}
                    value={blur}
                    onChange={(e) => setBlur(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="mt-6 text-xs text-neutral-500">
                Tip: Ombre looks best with intensity 40–70%.
              </div>
            </div>

            <div className="md:col-span-3">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {TECHS.map((t) => (
                  <div key={t.key} className="space-y-2">
                    <div className="text-sm font-medium text-neutral-800">
                      {t.label}
                    </div>
                    <PreviewCanvas
                      img={img}
                      tech={t.key}
                      dyeHex={dyeHex}
                      intensity={intensity}
                      scale={scale}
                      blur={blur}
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
