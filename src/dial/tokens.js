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
// colours and the forest photo, and src/themes/water/ redraws the dial and
// the Nightly scene. The choice is cached on the device under THEME_KEY and
// synced to the person's account.
import waterDay from "../themes/water/moss-day.jpg";
import waterNight from "../themes/water/moss-night.jpg";

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

// Water: light text on the forest photo's dark moss, day and night alike (the
// moss is dark in both). Day is a warmer moss green, night a moonlit teal.
// Surfaces are more opaque than Space's because a photo, not a flat
// gradient, sits behind them.
const WATER_NIGHT = {
  bgTop: "#0D1810",
  bgBottom: "#060C09",
  surface: "rgba(6,16,14,0.62)",
  surfaceStrong: "rgba(14,30,28,0.82)",
  panel: "#0C1A17",
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
  textShadow: "0 1px 2px rgba(0,0,0,0.55), 0 0 12px rgba(0,0,0,0.35)",
};

const WATER_DAY = {
  bgTop: "#2C3B17",
  bgBottom: "#162010",
  surface: "rgba(16,26,10,0.5)",
  surfaceStrong: "rgba(26,40,18,0.78)",
  panel: "#1A2612",
  line: "rgba(240,248,228,0.14)",
  text: "#F3F6EC",
  muted: "#C9D4BA",
  faint: "#A3B292",
  accent: "#74D3C6",
  accent2: "#AEDD8E",
  amber: "#FFC271",
  onAmber: "#141A0C",
  green: "#86DE9C",
  red: "#FF9C88",
  sheet: "#F1F4EA",
  sheetText: "#12190C",
  sheetMuted: "#4B5A3E",
  chip: "#DCE4D0",
  chipText: "#233019",
  chipOn: "#12190C",
  chipOnText: "#F1F4EA",
  scrim: "rgba(6,10,4,0.5)",
  textShadow: "0 1px 2px rgba(0,0,0,0.6), 0 0 12px rgba(0,0,0,0.35)",
};

const PALETTES = {
  space: { dark: DARK, light: LIGHT },
  water: { dark: WATER_NIGHT, light: WATER_DAY },
};

export const D = PALETTES[THEME_ID][prefersDarkDial ? "dark" : "light"];

export const FONT_DISPLAY = "'Syne', 'Figtree', system-ui, sans-serif";
export const FONT_BODY = "'Figtree', system-ui, -apple-system, sans-serif";

// Water: the moss carpet from below the well, as a seamless tile (the photo's
// bottom strip plus its mirror, moss-day.jpg / moss-night.jpg) shown at the
// same scale as on the home screen, so it stays sharp on every screen (the home
// screen draws the whole photo, with the well, over this).
export const pageBackground = THEME_ID === "water"
  ? `url(${prefersDarkDial ? waterNight : waterDay}) center top / auto 66vh repeat, ${prefersDarkDial ? "#060C09" : "#243212"}`
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
