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
// colours and a background of soft light patterns, and src/themes/water/
// redraws the dial and the Nightly scene. The choice is cached on the device
// under THEME_KEY and synced to the person's account.
import { causticBackground } from "../themes/water/caustics";
import { skyBackground } from "../themes/space/starfield";
import fireEmbers from "../themes/fire/embers.jpg";

export const THEME_KEY = "orbit-theme";
export const THEME_IDS = ["space", "water", "fire"];

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

// Water: a pale teal wash with light patterns by day (dark text), deep blue
// by night (light text). Surfaces are a little more opaque than Space's
// because the pattern sits behind them.
const WATER_NIGHT = {
  bgTop: "#0C1A20",
  bgBottom: "#07101A",
  surface: "rgba(255,255,255,0.06)",
  surfaceStrong: "rgba(255,255,255,0.10)",
  panel: "#0E1D24",
  line: "rgba(255,255,255,0.09)",
  text: "#E3EEF0",
  muted: "#9BB3B8",
  faint: "#7F989D",
  accent: "#4CC9C9",
  accent2: "#7FD8B0",
  amber: "#FFB86B",
  onAmber: "#0A1414",
  green: "#5FD39A",
  red: "#FF8A7A",
  sheet: "#E3EEF0",
  sheetText: "#081418",
  sheetMuted: "#3E5A5E",
  chip: "#D0E2E4",
  chipText: "#1B3A3E",
  chipOn: "#081418",
  chipOnText: "#E3EEF0",
  scrim: "rgba(2,8,10,0.6)",
};

const WATER_DAY = {
  bgTop: "#E3F1EE",
  bgBottom: "#D5E9E6",
  surface: "rgba(255,255,255,0.55)",
  surfaceStrong: "rgba(255,255,255,0.8)",
  panel: "#FFFFFF",
  line: "rgba(15,33,36,0.10)",
  text: "#0F2124",
  muted: "#4A6266",
  faint: "#627A7E",
  accent: "#1B8A8C",
  accent2: "#2E8F5E",
  amber: "#D9861F",
  onAmber: "#0F2124",
  green: "#16895E",
  red: "#C8453A",
  sheet: "#0F2A2E",
  sheetText: "#E3EEF0",
  sheetMuted: "#A2BCC0",
  chip: "#1D3C40",
  chipText: "#CFE4E6",
  chipOn: "#E3EEF0",
  chipOnText: "#0F2124",
  scrim: "rgba(8,24,28,0.35)",
};

// Space in light mode isn't a pale page: it's dusk from orbit. A lighter,
// warmer indigo than night, still with light text, so the scene keeps its
// sky (see src/themes/space/). LIGHT stays for anything that asks for it.
const SPACE_DUSK = {
  ...DARK,
  bgTop: "#2B3274",
  bgBottom: "#1A1D4C",
  surface: "rgba(255,255,255,0.08)",
  surfaceStrong: "rgba(255,255,255,0.14)",
  panel: "#242A66",
  line: "rgba(255,255,255,0.14)",
  text: "#F3F4FF",
  muted: "#C6CBF0",
  faint: "#A2A8D8",
  accent: "#8C9BFF",
  accent2: "#B38CFF",
  amber: "#FFC06A",
  onAmber: "#15173A",
  green: "#5FE0BD",
  red: "#FF8C9B",
  scrim: "rgba(8,10,30,0.5)",
};

// Fire: a hearth at night, warm charcoal with ember accents. In light mode it's
// a hybrid like Space: sunset rather than a pale page, still with light text.
const FIRE_NIGHT = {
  ...DARK,
  bgTop: "#2A1510",
  bgBottom: "#0E0806",
  surface: "rgba(255,235,220,0.06)",
  surfaceStrong: "rgba(255,235,220,0.12)",
  panel: "#221410",
  line: "rgba(255,225,200,0.12)",
  text: "#FFF1E6",
  muted: "#E2C3AE",
  faint: "#BD9A85",
  accent: "#E09B6E",
  accent2: "#E8B98C",
  amber: "#EBC688",
  onAmber: "#1A0E08",
  green: "#8FD694",
  red: "#E8776B",
  sheet: "#FFF1E6",
  sheetText: "#1A0E08",
  sheetMuted: "#6E4B3A",
  chip: "#F4DCCB",
  chipText: "#4A2A1C",
  chipOn: "#1A0E08",
  chipOnText: "#FFF1E6",
  scrim: "rgba(10,5,3,0.6)",
};
const FIRE_DUSK = {
  ...FIRE_NIGHT,
  bgTop: "#5A2A2E",
  bgBottom: "#241214",
  panel: "#3A1D1F",
  surface: "rgba(255,235,220,0.09)",
  surfaceStrong: "rgba(255,235,220,0.16)",
  line: "rgba(255,225,200,0.16)",
};

const PALETTES = {
  space: { dark: DARK, light: SPACE_DUSK },
  water: { dark: WATER_NIGHT, light: WATER_DAY },
  fire: { dark: FIRE_NIGHT, light: FIRE_DUSK },
};

export const D = PALETTES[THEME_ID][prefersDarkDial ? "dark" : "light"];

// Display face per theme: Syne's wide, spacey letters for Space; Quicksand's
// soft, rounded ones for Water. Body text stays Figtree everywhere.
export const FONT_DISPLAY = THEME_ID === "water"
  ? "'Quicksand', 'Figtree', system-ui, sans-serif"
  : THEME_ID === "fire"
    ? "'Unbounded', 'Figtree', system-ui, sans-serif"
    : "'Syne', 'Figtree', system-ui, sans-serif";
export const FONT_BODY = "'Figtree', system-ui, -apple-system, sans-serif";

// Water: the light patterns; Space: the starfield. Both still here (the home
// screen lets them drift).
export const pageBackground = THEME_ID === "water"
  ? causticBackground(prefersDarkDial)
  : THEME_ID === "fire"
    ? `linear-gradient(${prefersDarkDial ? "rgba(16,12,10,.94), rgba(12,9,8,.9)" : "rgba(58,30,32,.9), rgba(30,16,16,.88)"}), url(${fireEmbers}) center / 420px repeat, ${D.bgBottom}`
    : skyBackground(prefersDarkDial);

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
