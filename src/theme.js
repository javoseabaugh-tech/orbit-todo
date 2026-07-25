const LIGHT_PALETTE = {
  blue: { bg: "#edeaeb", text: "#351e28", dot: "#492b38", soft: "#f6f4f5" },
  green: { bg: "#f2f4f1", text: "#6c7e63", dot: "#7f9275", soft: "#f9faf8" },
  orange: { bg: "#f7f0ee", text: "#9d5d46", dot: "#b16d54", soft: "#fbf8f6" },
  yellow: { bg: "#f9f5f0", text: "#af8b57", dot: "#c39d66", soft: "#fcfaf7" },
};
const DARK_PALETTE = {
  blue: { bg: "#332a30", text: "#e6cdd9", dot: "#a5748c", soft: "#3d3238" },
  green: { bg: "#2b332a", text: "#c3d4bb", dot: "#9ab389", soft: "#333c31" },
  orange: { bg: "#3a2e2a", text: "#e8b8a5", dot: "#d0937a", soft: "#443631" },
  yellow: { bg: "#392f22", text: "#e6cd9e", dot: "#d4ab6f", soft: "#453923" },
};
const LIGHT_THEME = {
  gradA: "#FBF1E4", gradB: "#FAF5EC", gradC: "#F6EEE1",
  cardBg: "#fff", inputBg: "#FBF7F0", softBg: "#FFF6F0", softBg2: "#FCE4D2",
  dividerSoft: "#F6EFE4", borderSoft: "#EFE6D9", border: "#E6DACB", borderSoft2: "#E8DFD3", borderStrong: "#D9CDBE", borderGreen: "#D6DECD",
  textPrimary: "#2B2420", textSecondary: "#4A3F36", textMuted: "#8C7F72", textFaint: "#A89A8C", textFainter: "#C4B7A9", textGray: "#9AA1AC",
  accentPlum: "#492b38", accentRed: "#B8443A",
  oldOrangeText: "#9A4A22", oldGreenText: "#4B5D3F", oldGreenBg: "#E9EEE3", oldPlumBg: "#F1E7EA",
  goldAccent: "#F7C99A", oldYellowText: "#4A3B00",
  budgetBorder: "#C9BEB2", budgetMuted: "#9C9086", goldDot: "#C99A3E",
  softBg3: "#FFFDF9", softBg4: "#FAF6EF", paleYellowBg: "#FFFBEA", paleYellowBg2: "#FFF6D6",
  goldLight: "#F0D778", goldDark: "#D9A406", goldText: "#92700A", greenDot: "#6B8354",
};
const DARK_THEME = {
  gradA: "#20191c", gradB: "#171214", gradC: "#120e0f",
  cardBg: "#241e21", inputBg: "#2b2427", softBg: "#332a26", softBg2: "#3d2f24",
  dividerSoft: "#382f33", borderSoft: "#382f33", border: "#453a3f", borderSoft2: "#453a3f", borderStrong: "#4f4247", borderGreen: "#3a4536",
  textPrimary: "#f0e6da", textSecondary: "#d6c9ba", textMuted: "#b0a291", textFaint: "#9c8d7d", textFainter: "#736355", textGray: "#8b93a0",
  accentPlum: "#c79fb2", accentRed: "#e2685c",
  oldOrangeText: "#d98a5c", oldGreenText: "#8fae7a", oldGreenBg: "#2a3527", oldPlumBg: "#332a2f",
  goldAccent: "#c9a06a", oldYellowText: "#e0d9a0",
  budgetBorder: "#453a3f", budgetMuted: "#a0937f", goldDot: "#d4ab6f",
  softBg3: "#2b2427", softBg4: "#2b2427", paleYellowBg: "#392f22", paleYellowBg2: "#453923",
  goldLight: "#d4ab6f", goldDark: "#c9a06a", goldText: "#e6cd9e", greenDot: "#9ab389",
};
export const prefersDark = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
export const PALETTE = prefersDark ? DARK_PALETTE : LIGHT_PALETTE;
export const theme = prefersDark ? DARK_THEME : LIGHT_THEME;
if (typeof window !== "undefined" && window.matchMedia) {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => window.location.reload());
}
