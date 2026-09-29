// The Water theme's background: soft light patterns like sun on the floor of a
// pool, over a pale teal (day) or deep blue (night) wash. The pattern is a
// small SVG tile built here, so there's nothing to download; its turbulence
// is stitched so the tile repeats without seams. The home screen lets two
// copies of it drift slowly (WaterDial.jsx); every other screen shows it still.

const TILE = 360;

function tile(opacity, seed) {
  // Frequencies are whole cycles per tile (6 and 7), which keeps it seamless.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}">`
    + `<filter id="c" x="0" y="0" width="100%" height="100%">`
    + `<feTurbulence type="turbulence" baseFrequency="${(6 / TILE).toFixed(6)} ${(7 / TILE).toFixed(6)}" numOctaves="2" seed="${seed}" stitchTiles="stitch"/>`
    + `<feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 -3 0 0 0 1.05"/>`
    + `<feGaussianBlur stdDeviation="1.2"/>`
    + `</filter><rect width="100%" height="100%" filter="url(#c)" opacity="${opacity}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export const causticWash = (night) => night
  ? "linear-gradient(#0C1A20, #07101A)"
  : "linear-gradient(#E3F1EE, #D5E9E6)";

// Two layers at different sizes: drifting past each other they shimmer.
export const causticLayers = (night) => [
  { image: tile(night ? 0.04 : 0.3, 11), size: TILE },
  { image: tile(night ? 0.025 : 0.18, 23), size: Math.round(TILE * 1.45) },
];

// The still version, for a CSS `background`.
export function causticBackground(night) {
  const [a, b] = causticLayers(night);
  return `${a.image} 0 0 / ${a.size}px ${a.size}px repeat, ${b.image} 0 0 / ${b.size}px ${b.size}px repeat, ${causticWash(night)}`;
}
