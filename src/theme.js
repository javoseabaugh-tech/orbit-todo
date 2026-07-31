// ---------------------------------------------------------------------------
// Orbit — liquid glass theme system (drop-in replacement for src/theme.js)
//
// Same public API as the old file: `theme`, `PALETTE`, `PALETTE_OPTIONS`,
// `paletteId`, `setPaletteId`, `prefersDark`. Every key the old theme exported
// still exists, so existing `theme.cardBg` / `theme.textPrimary` references
// keep compiling — they just resolve to new values.
//
// What changed:
//   * The five palettes are new (Aurora, Nocturne, Solstice, Bloom, Verdant)
//     and are GENERATED from a single hue seed rather than hand-listed. Adding
//     a sixth theme is one line.
//   * Category colors still use the `blue|green|orange|yellow` keys, so every
//     category and person already in Firestore keeps working untouched. Those
//     four keys now index four hues spread around the active theme.
//   * New: `glass` — the surface recipes. Solid `cardBg` backgrounds should be
//     replaced with these to get the frosted look.
//   * New: `applyThemeVars(el)` — writes every token as a CSS custom property
//     so components can use `var(--tx)` instead of importing `theme`.
//
// This file arrived as a drop-in from the design bundle
// (design_handoff_liquid_glass/theme.js) and has since diverged from it. Diff
// the two before pulling any updated bundle in — these would be lost:
//
//   * Dark-mode text contrast raised. `textFainter` at L .52 over the ~L .15
//     backdrop measured ~3.4:1, under the 4.5:1 minimum, and it carries the
//     11.5-12px labels. See the note at the ramp itself.
//   * `themeColorHex` / `applyThemeColor()` — keeps <meta name="theme-color">
//     tracking the active theme, which the handoff asked for but left unbuilt.
//   * `SUPPORTS_BLUR` + `flattenWhite()` — the solid-tint fallback for browsers
//     without backdrop-filter (handoff perf mitigation 3).
//   * `BLUR_LIST_LIMIT` + `glass.cardFlat` — long lists drop their own cards
//     out of the blur (handoff perf mitigation 2).
// ---------------------------------------------------------------------------

const THEMES = {
  aurora:   { label: "Aurora",   h: 195, n: 230, bh: [195, 245, 285] },
  nocturne: { label: "Nocturne", h: 272, n: 265, bh: [272, 225, 310] },
  solstice: { label: "Solstice", h: 58,  n: 62,  bh: [58, 28, 92] },
  bloom:    { label: "Bloom",    h: 350, n: 340, bh: [350, 310, 20] },
  verdant:  { label: "Verdant",  h: 158, n: 152, bh: [158, 195, 120] },
};

const CAT_KEYS = ["blue", "green", "orange", "yellow"];
const L = (l, c, h) => `oklch(${l} ${c} ${h})`;
const catHues = (h) => [h, h + 72, h + 152, h + 224].map((x) => ((x % 360) + 360) % 360);

// --- colour maths ----------------------------------------------------------
// Only ever receives strings built by L() above, so the shape is known.
function oklchToRgb(str) {
  const parts = /oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/.exec(str);
  if (!parts) return null;
  const [lig, chroma, hue] = [+parts[1], +parts[2], +parts[3]];
  const rad = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(rad), b = chroma * Math.sin(rad);
  // oklab -> LMS -> linear sRGB (Björn Ottosson's matrices).
  const l = (lig + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lig - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lig - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const ch = (x) => {
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(x, 0), 1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  };
  return [
    ch(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    ch(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    ch(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const toHex = (rgb) => "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");

function oklchToHex(str) {
  const rgb = oklchToRgb(str);
  return rgb ? toHex(rgb) : null;
}

// Flattens `rgba(255,255,255,α)` sitting on top of an oklch() base into one
// opaque hex — source-over compositing. Used by the no-blur fallback below.
function flattenWhite(baseOklch, rgba) {
  const base = oklchToRgb(baseOklch);
  const alpha = parseFloat(/([\d.]+)\s*\)$/.exec(rgba)?.[1] ?? "0");
  if (!base) return rgba;
  return toHex(base.map((c) => Math.round(alpha * 255 + (1 - alpha) * c)));
}

// --- backdrop-filter support ----------------------------------------------
// Chrome 76+, Safari 9+ (prefixed) and Firefox 103+ all have it; what's left is
// old Firefox and anyone who's turned it off. There, a translucent fill stops
// being frosted glass and just lets the drifting blobs through unblurred, which
// wrecks contrast on card text. So the fills below are flattened to opaque.
//
// Nothing needs to strip the `backdropFilter` property itself — a browser that
// doesn't support it ignores the declaration, so it's inert. Substituting the
// tokens is what matters, and it reaches every hand-written blur site in the
// app too, since they all draw their background from these same tokens.
const SUPPORTS_BLUR =
  typeof CSS === "undefined" || !CSS.supports
    ? true
    : CSS.supports("backdrop-filter", "blur(1px)") ||
      CSS.supports("-webkit-backdrop-filter", "blur(1px)");

// Four category swatches derived from the theme hue. Shape matches the old
// PALETTE exactly: { bg, text, dot, soft } per key.
function buildPalette(t, dark) {
  const out = {};
  catHues(t.h).forEach((hu, i) => {
    out[CAT_KEYS[i]] = dark
      ? { bg: L(0.32, 0.06, hu), text: L(0.86, 0.1, hu), dot: L(0.75, 0.15, hu), soft: L(0.36, 0.05, hu) }
      : { bg: L(0.94, 0.045, hu), text: L(0.45, 0.12, hu), dot: L(0.58, 0.15, hu), soft: L(0.97, 0.02, hu) };
  });
  return out;
}

function buildTheme(t, dark) {
  const n = t.n, h = t.h;

  const base = dark
    ? {
        gradA: L(0.19, 0.03, n), gradB: L(0.11, 0.02, n), gradC: L(0.09, 0.02, n),
        textPrimary: L(0.97, 0.008, n), textSecondary: L(0.85, 0.014, n),
        // The dim end was too dim to read: textFainter at L .52 over the ~L .15
        // backdrop is ~3.4:1, under the 4.5:1 minimum, and it carries 11.5-12px
        // labels (Filters, Sort by time, Manage categories). Raised to ~5:1 while
        // keeping each step visibly distinct from the one above it.
        textMuted: L(0.72, 0.018, n), textFaint: L(0.665, 0.02, n), textFainter: L(0.62, 0.02, n),
        accentPlum: L(0.8, 0.14, h), accentRed: L(0.72, 0.16, 22),
        goldDot: L(0.82, 0.13, 82), greenDot: L(0.8, 0.14, 155),
        blobs: [L(0.55, 0.19, t.bh[0]), L(0.5, 0.2, t.bh[1]), L(0.52, 0.18, t.bh[2])],
        blobOpacity: 0.5,
      }
    : {
        gradA: L(0.985, 0.008, n), gradB: L(0.945, 0.016, n), gradC: L(0.93, 0.02, n),
        textPrimary: L(0.24, 0.026, n), textSecondary: L(0.4, 0.024, n),
        textMuted: L(0.55, 0.022, n), textFaint: L(0.62, 0.02, n), textFainter: L(0.68, 0.018, n),
        accentPlum: L(0.6, 0.15, h), accentRed: L(0.56, 0.18, 25),
        goldDot: L(0.62, 0.14, 78), greenDot: L(0.56, 0.14, 155),
        blobs: [L(0.88, 0.1, t.bh[0]), L(0.86, 0.11, t.bh[1]), L(0.9, 0.085, t.bh[2])],
        blobOpacity: 0.55,
      };

  // Glass surfaces. `cardBg` and friends stay defined for compatibility, but
  // anything that should look like glass uses the `glass` export below.
  // Declared after `base` because the no-blur fallback flattens them onto it.
  const g = dark
    ? { fill: "rgba(255,255,255,0.055)", fill2: "rgba(255,255,255,0.04)", strong: "rgba(255,255,255,0.10)",
        high: "rgba(255,255,255,0.13)", spec: "rgba(255,255,255,0.16)",
        border: "rgba(255,255,255,0.14)", border2: "rgba(255,255,255,0.09)",
        shadow: "rgba(0,0,0,0.75)", scrim: "rgba(4,6,10,0.55)" }
    : { fill: "rgba(255,255,255,0.5)", fill2: "rgba(255,255,255,0.4)", strong: "rgba(255,255,255,0.72)",
        high: "rgba(255,255,255,0.82)", spec: "rgba(255,255,255,0.9)",
        border: "rgba(255,255,255,0.7)", border2: "rgba(120,120,140,0.16)",
        shadow: "rgba(30,35,60,0.35)", scrim: "rgba(20,24,38,0.28)" };

  // The colour the blur would have averaged to: the same white veil, but
  // composited onto the page gradient instead of floating above it. `gradB` is
  // the stop the backdrop settles on past 70%, and what body is pinned to.
  //
  // Always computed, because two separate things want it: the no-blur fallback
  // below swaps every fill for one, and long lists swap only their own cards
  // (see BLUR_LIST_LIMIT). Must run before the fallback mutates `g`.
  const solidFill = flattenWhite(base.gradB, g.fill);
  const solidHigh = flattenWhite(base.gradB, g.high);

  // Borders, the specular edge and `scrim` stay translucent on purpose — they
  // sit over an opaque fill, and a modal scrim is meant to show through.
  if (!SUPPORTS_BLUR) {
    ["fill", "fill2", "strong", "high"].forEach((k) => {
      g[k] = flattenWhite(base.gradB, g[k]);
    });
  }

  const accentSoft = dark ? L(0.35, 0.07, h) : L(0.93, 0.05, h);

  return {
    ...base,
    accent2: dark ? L(0.86, 0.12, h + 28) : L(0.65, 0.14, h + 28),
    accentSoft,
    accentInk: dark ? L(0.17, 0.03, n) : "#ffffff",

    // --- compatibility aliases for every key the old theme.js exported ------
    cardBg: g.fill, inputBg: g.fill2, softBg: g.fill2, softBg2: accentSoft,
    softBg3: g.fill, softBg4: g.fill2,
    dividerSoft: g.border2, borderSoft: g.border2, border: g.border,
    borderSoft2: g.border2, borderStrong: g.border, borderGreen: g.border2,
    textGray: base.textMuted,
    oldOrangeText: base.accentRed, oldGreenText: base.greenDot,
    oldGreenBg: accentSoft, oldPlumBg: accentSoft, oldYellowText: base.goldDot,
    goldAccent: base.goldDot, goldLight: base.goldDot, goldDark: base.goldDot, goldText: base.goldDot,
    paleYellowBg: dark ? "rgba(212,171,111,0.12)" : "rgba(201,154,62,0.12)",
    paleYellowBg2: dark ? "rgba(212,171,111,0.18)" : "rgba(201,154,62,0.16)",
    budgetBorder: g.border, budgetMuted: base.textMuted,

    glassFill: g.fill, glassHigh: g.high, glassSpec: g.spec,
    glassFillSolid: solidFill, glassHighSolid: solidHigh,
    glassBorder: g.border, glassBorder2: g.border2, glassShadow: g.shadow, scrim: g.scrim,
  };
}

const STORAGE_KEY = "orbit-palette";

function readPaletteId() {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v && THEMES[v] ? v : "aurora";
  } catch (e) {
    return "aurora";
  }
}

export const prefersDark =
  typeof window !== "undefined" && window.matchMedia &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

export const paletteId = typeof window !== "undefined" ? readPaletteId() : "aurora";

const active = THEMES[paletteId] || THEMES.aurora;

export const PALETTE = buildPalette(active, prefersDark);
export const theme = buildTheme(active, prefersDark);

export const PALETTE_OPTIONS = Object.keys(THEMES).map((id) => ({
  id,
  label: THEMES[id].label,
  swatch: `linear-gradient(140deg, oklch(0.72 0.17 ${THEMES[id].bh[0]}), oklch(0.66 0.18 ${THEMES[id].bh[1]}), oklch(0.75 0.15 ${THEMES[id].bh[2]}))`,
}));

export function setPaletteId(id) {
  if (!THEMES[id]) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch (e) {
    console.error("Could not save palette choice", e);
  }
  window.location.reload();
}

if (typeof window !== "undefined" && window.matchMedia) {
  window.matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => window.location.reload());
}

// ---------------------------------------------------------------------------
// Glass surface recipes. Spread these into an inline style object:
//
//   <div style={{ ...glass.card, borderRadius: 22, padding: 14 }}>
//
// `blur` is the expensive part — see the perf note in the handoff README.
// ---------------------------------------------------------------------------
const surface = (blur, radiusShadow, flat = false) => ({
  background: flat
    ? `linear-gradient(157deg, ${theme.glassHighSolid}, ${theme.glassFillSolid})`
    : `linear-gradient(157deg, ${theme.glassHigh}, ${theme.glassFill})`,
  ...(flat ? {} : {
    backdropFilter: `blur(${blur}px) saturate(180%)`,
    WebkitBackdropFilter: `blur(${blur}px) saturate(180%)`,
  }),
  border: `1px solid ${theme.glassBorder}`,
  boxShadow: `inset 0 1px 0 ${theme.glassSpec}, ${radiusShadow} ${theme.glassShadow}`,
});

// Past this many rows, a list drops its own cards to `cardFlat`. Each blurred
// card is a separately composited layer that has to be re-rasterised every
// frame of a scroll, so the cost is linear in row count and bites on older
// iPhones well before the list stops being usable. Chrome, sheets and modals
// keep true blur — there are only ever a handful of those on screen.
export const BLUR_LIST_LIMIT = 30;

export const glass = {
  card:   surface(22, "0 10px 28px -20px"),
  // Visually the card the blur would have averaged to, minus the compositing.
  cardFlat: surface(22, "0 10px 28px -20px", true),
  panel:  surface(22, "0 18px 44px -26px"),
  raised: surface(28, "0 24px 60px -24px"),
  sheet:  surface(34, "0 -20px 60px -24px"),
  bar: {
    // The fade-to-transparent tail only works because the blur behind it keeps
    // the scrolling content unreadable. With no blur it would just show rows
    // sliding under the bar, so the fallback goes flat instead.
    background: SUPPORTS_BLUR
      ? `linear-gradient(180deg, ${theme.glassHigh}, transparent)`
      : theme.glassHigh,
    backdropFilter: "blur(18px) saturate(160%)",
    WebkitBackdropFilter: "blur(18px) saturate(160%)",
    borderBottom: `1px solid ${theme.glassBorder2}`,
  },
  accentFill: {
    background: `linear-gradient(140deg, ${theme.accentPlum}, ${theme.accent2})`,
    color: theme.accentInk,
    boxShadow: `0 10px 26px -10px ${theme.accentPlum}`,
  },
};

export const SPRING = "cubic-bezier(.34,1.56,.64,1)";
export const EASE_OUT = "cubic-bezier(.22,1,.36,1)";

// ---------------------------------------------------------------------------
// <meta name="theme-color"> — fills the iOS standalone status bar and the
// Android browser chrome.
//
// It tracks `gradA`, the top of the page gradient: GlassBackdrop paints that at
// `50% 0%`, directly behind the status bar, so the bar blends into the app
// instead of reading as a band above it. Same reasoning as body being pinned to
// gradB in App.jsx so iOS overscroll doesn't flash white.
//
// The token is oklch(), which Safari below 16.4 won't parse in a theme-color —
// it ignores the tag entirely and falls back to white. So it's converted to hex
// here rather than handed over as-is.
// ---------------------------------------------------------------------------
export const themeColorHex = oklchToHex(theme.gradA);

// index.html ships two media-scoped Aurora tags so the very first paint is
// right before React mounts. Once the real theme is known they're replaced by a
// single resolved tag. `setPaletteId` and the colour-scheme listener both
// reload the page, so this only has to run once per load.
export function applyThemeColor() {
  if (typeof document === "undefined" || !themeColorHex) return;
  document.querySelectorAll('meta[name="theme-color"]').forEach((el) => el.remove());
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.content = themeColorHex;
  document.head.appendChild(meta);
}

// Writes every token as a CSS custom property on `el` (use the app root).
// Lets components reference var(--tx) etc. instead of importing `theme`.
export function applyThemeVars(el) {
  if (!el) return;
  const map = {
    "--bg0": theme.gradA, "--bg1": theme.gradB,
    "--tx": theme.textPrimary, "--tx2": theme.textSecondary,
    "--tx3": theme.textMuted, "--tx4": theme.textFainter,
    "--ac": theme.accentPlum, "--ac2": theme.accent2,
    "--acs": theme.accentSoft, "--aci": theme.accentInk,
    "--red": theme.accentRed, "--gold": theme.goldDot, "--green": theme.greenDot,
    "--gl": theme.glassFill, "--gh": theme.glassHigh, "--ghi": theme.glassSpec,
    "--gb": theme.glassBorder, "--gb2": theme.glassBorder2,
    "--gsh": theme.glassShadow, "--scrim": theme.scrim,
    "--b1": theme.blobs[0], "--b2": theme.blobs[1], "--b3": theme.blobs[2],
    "--bop": String(theme.blobOpacity),
  };
  CAT_KEYS.forEach((k, i) => {
    map[`--c${i}`] = PALETTE[k].dot;
    map[`--c${i}t`] = PALETTE[k].text;
    map[`--c${i}b`] = PALETTE[k].bg;
  });
  Object.keys(map).forEach((k) => el.style.setProperty(k, map[k]));
}
