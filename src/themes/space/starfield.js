// The Space theme's background. By night: a deep indigo sky with faint
// violet-blue nebula and two layers of stars. By day: the pale sky with only
// the faintest wisps, no stars. Everything is drawn here as small tiles
// (stars on a canvas, nebula as SVG turbulence), so there's nothing to
// download. The home screen lets the layers drift past each other
// (SpaceDial.jsx); every other screen shows them still.

const STAR_TILE = 420;

// A deterministic random so every device draws the same sky.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function starTile(seed, count, maxSize, alpha) {
  if (typeof document === "undefined") return "none";
  const c = document.createElement("canvas");
  c.width = c.height = STAR_TILE;
  const g = c.getContext("2d");
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const x = r() * STAR_TILE, y = r() * STAR_TILE;
    const big = r() > 0.93;
    const size = big ? maxSize * (0.8 + r() * 0.5) : 0.4 + r() * maxSize * 0.5;
    const tint = r();
    const col = tint > 0.85 ? "255,214,170" : tint > 0.6 ? "196,206,255" : "255,255,255";
    const a = alpha * (big ? 1 : 0.35 + r() * 0.65);
    if (big) {
      const glow = g.createRadialGradient(x, y, 0, x, y, size * 2);
      glow.addColorStop(0, `rgba(${col},${a * 0.3})`);
      glow.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = glow;
      g.fillRect(x - size * 2.5, y - size * 2.5, size * 5, size * 5);
    }
    g.fillStyle = `rgba(${col},${a})`;
    g.beginPath();
    g.arc(x, y, size / 2, 0, Math.PI * 2);
    g.fill();
  }
  return `url(${c.toDataURL("image/png")})`;
}

const NEB_TILE = 900;

function nebulaTile(night) {
  // Whole cycles per tile keep the turbulence seamless.
  const colour = night ? "0.45 0 0 0 0.18  0 0.35 0 0 0.16  0 0 0.9 0 0.42" : "0.3 0 0 0 0.55  0 0.3 0 0 0.58  0 0 0.5 0 0.85";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${NEB_TILE}" height="${NEB_TILE}">`
    + `<filter id="n" x="0" y="0" width="100%" height="100%">`
    + `<feTurbulence type="fractalNoise" baseFrequency="${(2 / NEB_TILE).toFixed(6)} ${(3 / NEB_TILE).toFixed(6)}" numOctaves="4" seed="7" stitchTiles="stitch"/>`
    + `<feColorMatrix type="matrix" values="${colour}  0 0 0 ${night ? 1.05 : 0.9} ${night ? -0.56 : -0.52}"/>`
    + `</filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export const skyWash = (night) => night
  ? "radial-gradient(120% 70% at 50% 0%, #1A2150 0%, #0A0D1F 62%)"
  : "radial-gradient(120% 70% at 50% 0%, #FFFFFF 0%, #E6E9FA 62%)";

let cache = {};
// Nebula plus (at night) a near and a far layer of stars.
export function skyLayers(night) {
  const key = night ? "n" : "d";
  if (!cache[key]) {
    cache[key] = night
      ? [
          { image: nebulaTile(true), size: NEB_TILE },
          { image: starTile(11, 90, 1.8, 0.95), size: STAR_TILE },
          { image: starTile(29, 160, 1.4, 0.6), size: Math.round(STAR_TILE * 0.7) },
        ]
      : [{ image: nebulaTile(false), size: NEB_TILE }];
  }
  return cache[key];
}

// The still version, for a CSS `background`.
export function skyBackground(night) {
  const layers = skyLayers(night).slice().reverse();
  return [
    ...layers.map((l) => `${l.image} 0 0 / ${l.size}px ${l.size}px repeat`),
    skyWash(night),
  ].join(", ");
}
