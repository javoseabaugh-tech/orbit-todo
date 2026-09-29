// Orbit Dial design tokens: the redesign's look ("B" from the looks page).
//
// Deep-space dark by default, a pale sky in light mode. The add/edit sheet is
// always the inverse of the page (light sheet on dark, dark sheet on light) so
// it reads as a separate object without blur or shadows doing the work.
//
// Colour roles:
//   accent  — your own things (planets, checkboxes, progress)
//   amber   — anything assigned to, or shared from, someone else
//   green / red — done and overdue, never decoration
//
// Computed once at load. A system theme change reloads the page (see
// theme.js), and so does picking a different theme (src/themes/themeChoice.js),
// so nothing here needs to be reactive.
//
// Themes: "space" is the Orbit Dial look below. "water" swaps in its own
// colours and a rock background, and src/themes/water/ redraws the dial and
// the Nightly scene. The choice is cached on the device under THEME_KEY and
// synced to the person's account.
import waterRock from "../themes/water/rock.jpg";

export const THEME_KEY = "orbit-theme";
export const THEME_IDS = ["space", "water"];

function readThemeId() {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return THEME_IDS.includes(v) ? v : "space";
  } catch (e) {
    return "space";
  }
}

export const THEME_ID = typeof window === "undefined" ? "space" : readThemeId();

export const prefersDarkDial =
  typeof window === "undefined" || !window.matchMedia
    ? true
    : window.matchMedia("(prefers-color-scheme: dark)").matches;

const DARK = {
  bgTop: "#1A2150",
  bgBottom: "#0A0D1F",
  surface: "rgba(255,255,255,0.055)",
  surfaceStrong: "rgba(255,255,255,0.10)",
  // Opaque, for things that float over the page (menus, dialogs).
  panel: "#161B3A",
  line: "rgba(255,255,255,0.10)",
  text: "#EEF0FF",
  muted: "#AEB4E0",
  faint: "#8C93C8",
  accent: "#6B7CFF",
  accent2: "#9A6BFF",
  amber: "#FFB547",
  onAmber: "#0A0D1F",
  green: "#3FC7A4",
  red: "#FF7A8A",
  // The inverse sheet
  sheet: "#EEF0FF",
  sheetText: "#0A0D1F",
  sheetMuted: "#4B5290",
  chip: "#DCE0FA",
  chipText: "#2B3170",
  chipOn: "#0A0D1F",
  chipOnText: "#EEF0FF",
  scrim: "rgba(4,6,16,0.55)",
};

const LIGHT = {
  bgTop: "#FFFFFF",
  bgBottom: "#E6E9FA",
  surface: "rgba(10,13,31,0.05)",
  surfaceStrong: "rgba(10,13,31,0.09)",
  panel: "#FFFFFF",
  line: "rgba(10,13,31,0.10)",
  text: "#0A0D1F",
  muted: "#4B5290",
  faint: "#6A70A3",
  accent: "#4A5BF0",
  accent2: "#7B4DF0",
  amber: "#F0A020",
  onAmber: "#0A0D1F",
  green: "#12977A",
  red: "#D63A55",
  sheet: "#10153A",
  sheetText: "#EEF0FF",
  sheetMuted: "#AEB4E0",
  chip: "#262D63",
  chipText: "#D6DAFF",
  chipOn: "#EEF0FF",
  chipOnText: "#0A0D1F",
  scrim: "rgba(10,13,31,0.35)",
};

// Water: deep teal-green on dark mossy rock by night; misty rock under light
// glass by day. Surfaces are more opaque than Space's because a photo, not a
// flat gradient, sits behind them.
const WATER_NIGHT = {
  bgTop: "#0F2A2C",
  bgBottom: "#061214",
  surface: "rgba(6,20,22,0.66)",
  surfaceStrong: "rgba(16,38,40,0.82)",
  panel: "#0C1C1E",
  line: "rgba(255,255,255,0.10)",
  text: "#E8F2EF",
  muted: "#A9C2BC",
  faint: "#86A39D",
  accent: "#4CC9C9",
  accent2: "#7FD8B0",
  amber: "#FFB86B",
  onAmber: "#0A1414",
  green: "#5FD39A",
  red: "#FF8A7A",
  sheet: "#E8F2EF",
  sheetText: "#081414",
  sheetMuted: "#3E5E58",
  chip: "#D2E5E0",
  chipText: "#1D3B36",
  chipOn: "#081414",
  chipOnText: "#E8F2EF",
  scrim: "rgba(2,8,9,0.6)",
};

const WATER_DAY = {
  bgTop: "#EAF1EE",
  bgBottom: "#D5E2DD",
  surface: "rgba(250,252,250,0.82)",
  surfaceStrong: "rgba(255,255,255,0.94)",
  panel: "#FFFFFF",
  line: "rgba(8,30,28,0.12)",
  text: "#0B1F1D",
  muted: "#3E5E58",
  faint: "#5E7C76",
  accent: "#0B7F83",
  accent2: "#2E8F5E",
  amber: "#D9861F",
  onAmber: "#0B1F1D",
  green: "#16895E",
  red: "#C8453A",
  sheet: "#0E2426",
  sheetText: "#E8F2EF",
  sheetMuted: "#A9C2BC",
  chip: "#1E3A3A",
  chipText: "#CFE6E1",
  chipOn: "#E8F2EF",
  chipOnText: "#0B1F1D",
  scrim: "rgba(8,20,20,0.35)",
};

const PALETTES = {
  space: { dark: DARK, light: LIGHT },
  water: { dark: WATER_NIGHT, light: WATER_DAY },
};

export const D = PALETTES[THEME_ID][prefersDarkDial ? "dark" : "light"];

export const FONT_DISPLAY = "'Syne', 'Figtree', system-ui, sans-serif";
export const FONT_BODY = "'Figtree', system-ui, -apple-system, sans-serif";

export const pageBackground = THEME_ID === "water"
  ? (prefersDarkDial
      ? `linear-gradient(rgba(4,12,13,0.58), rgba(3,9,10,0.84)), url(${waterRock}) center / 420px repeat, ${D.bgBottom}`
      : `linear-gradient(rgba(234,241,238,0.72), rgba(213,226,221,0.86)), url(${waterRock}) center / 420px repeat, ${D.bgBottom}`)
  : `radial-gradient(120% 70% at 50% 0%, ${D.bgTop} 0%, ${D.bgBottom} 62%)`;

// A small palette for people's faces. Index by a stable hash of their email so
// the same person always gets the same colour on every device.
const FACE_COLORS = prefersDarkDial
  ? ["#FFB547", "#3FC7A4", "#FF8FB1", "#7CC4FF", "#C9A6FF"]
  : ["#F0A020", "#12977A", "#D8537E", "#2F8FE0", "#8A5CE6"];

export function faceColor(key = "") {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return FACE_COLORS[h % FACE_COLORS.length];
}

export function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts.length === 1 ? parts[0][0].toUpperCase() : (parts[0][0] + parts[1][0]).toUpperCase();
}
