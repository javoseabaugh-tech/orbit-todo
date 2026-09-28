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
// theme.js), so nothing here needs to be reactive.

export const prefersDarkDial =
  typeof window === "undefined" || !window.matchMedia
    ? true
    : window.matchMedia("(prefers-color-scheme: dark)").matches;

const DARK = {
  bgTop: "#1A2150",
  bgBottom: "#0A0D1F",
  surface: "rgba(255,255,255,0.055)",
  surfaceStrong: "rgba(255,255,255,0.10)",
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

export const D = prefersDarkDial ? DARK : LIGHT;

export const FONT_DISPLAY = "'Syne', 'Figtree', system-ui, sans-serif";
export const FONT_BODY = "'Figtree', system-ui, -apple-system, sans-serif";

export const pageBackground = `radial-gradient(120% 70% at 50% 0%, ${D.bgTop} 0%, ${D.bgBottom} 62%)`;

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
