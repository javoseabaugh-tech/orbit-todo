// ---------------------------------------------------------------------------
// Palette system.
//
// BASE_* below are the original plum/sage values and act as the fallback for
// every palette — a palette only lists what it changes. Reds, golds, and the
// neutral grays stay shared on purpose: gold is Star's colour and red means
// "destructive" everywhere, so neither should shift with the theme.
//
// Chosen palette lives in localStorage, not Firestore: `theme` is computed
// once synchronously at module load and exported as a plain object, so the
// value has to be readable at that instant. Consequence — the choice is
// per-device.
// ---------------------------------------------------------------------------

const BASE_LIGHT_CATS = {
  blue: { bg: "#edeaeb", text: "#351e28", dot: "#492b38", soft: "#f6f4f5" },
  green: { bg: "#f2f4f1", text: "#6c7e63", dot: "#7f9275", soft: "#f9faf8" },
  orange: { bg: "#f7f0ee", text: "#9d5d46", dot: "#b16d54", soft: "#fbf8f6" },
  yellow: { bg: "#f9f5f0", text: "#af8b57", dot: "#c39d66", soft: "#fcfaf7" },
};
const BASE_DARK_CATS = {
  blue: { bg: "#332a30", text: "#e6cdd9", dot: "#a5748c", soft: "#3d3238" },
  green: { bg: "#2b332a", text: "#c3d4bb", dot: "#9ab389", soft: "#333c31" },
  orange: { bg: "#3a2e2a", text: "#e8b8a5", dot: "#d0937a", soft: "#443631" },
  yellow: { bg: "#392f22", text: "#e6cd9e", dot: "#d4ab6f", soft: "#453923" },
};

const BASE_LIGHT = {
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

const BASE_DARK = {
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

const PALETTES = {
  // The original. Base already holds these values, so nothing to override.
  plum: {
    label: "Plum & Sage",
    swatch: "#492b38",
    light: {}, dark: {},
    lightCats: BASE_LIGHT_CATS, darkCats: BASE_DARK_CATS,
  },

  rose: {
    label: "Rose",
    swatch: "#A8456B",
    light: {
      gradA: "#FCEFF2", gradB: "#FBF3F5", gradC: "#F8EAEE",
      inputBg: "#FDF6F8", softBg: "#FFF2F5", softBg2: "#FBDCE4",
      softBg3: "#FFFCFD", softBg4: "#FCF4F6",
      dividerSoft: "#F7E8EC", borderSoft: "#F0DCE2", border: "#E8CFD7",
      borderSoft2: "#EBD5DB", borderStrong: "#DCBCC7",
      textPrimary: "#2E2126", textSecondary: "#4E3A41", textMuted: "#8E7681",
      textFaint: "#AC939D", textFainter: "#C9B3BB",
      accentPlum: "#A8456B", oldPlumBg: "#FAE6EC",
      budgetBorder: "#C9B2BA", budgetMuted: "#9C8890",
    },
    dark: {
      gradA: "#241A1E", gradB: "#1A1215", gradC: "#150F11",
      cardBg: "#291E23", inputBg: "#2F2329", softBg: "#372730", softBg2: "#402C36",
      softBg3: "#2F2329", softBg4: "#2F2329",
      dividerSoft: "#3B2E34", borderSoft: "#3B2E34", border: "#4A3A41",
      borderSoft2: "#4A3A41", borderStrong: "#55424B",
      textPrimary: "#F3E6EB", textSecondary: "#DAC7CF", textMuted: "#B39CA6",
      textFaint: "#9E8791", textFainter: "#75606A",
      accentPlum: "#E29ABB", oldPlumBg: "#3A2A31",
      budgetBorder: "#4A3A41", budgetMuted: "#A38F98",
    },
    lightCats: {
      blue: { bg: "#F7EDF1", text: "#7D3B56", dot: "#A8456B", soft: "#FCF7F9" },
      green: { bg: "#F0F4F0", text: "#5F7A62", dot: "#6E9173", soft: "#F8FAF8" },
      orange: { bg: "#FAF0EC", text: "#A05A44", dot: "#B87052", soft: "#FDF8F6" },
      yellow: { bg: "#FAF5EE", text: "#A98A55", dot: "#C8A263", soft: "#FDFAF7" },
    },
    darkCats: {
      blue: { bg: "#382930", text: "#F0C5D7", dot: "#C77E9E", soft: "#42313A" },
      green: { bg: "#2A322B", text: "#BDD1BF", dot: "#8FAF93", soft: "#323B33" },
      orange: { bg: "#382C28", text: "#E8B8A5", dot: "#CE9077", soft: "#423430" },
      yellow: { bg: "#392F22", text: "#E6CD9E", dot: "#D4AB6F", soft: "#453923" },
    },
  },

  forest: {
    label: "Forest",
    swatch: "#3F6350",
    light: {
      gradA: "#EDF3EC", gradB: "#F2F6F0", gradC: "#E7EFE5",
      inputBg: "#F5F9F3", softBg: "#F0F7EE", softBg2: "#DCE9D7",
      softBg3: "#FCFEFB", softBg4: "#F4F8F2",
      dividerSoft: "#E7EFE4", borderSoft: "#DCE7D9", border: "#CDDCC9",
      borderSoft2: "#D4E0D0", borderStrong: "#B9CDB4",
      textPrimary: "#1F2A22", textSecondary: "#37453A", textMuted: "#71806F",
      textFaint: "#90A08D", textFainter: "#B0BFAC",
      accentPlum: "#3F6350", oldPlumBg: "#E4EDE7",
      budgetBorder: "#B4C2B0", budgetMuted: "#8A9687",
    },
    dark: {
      gradA: "#1A211C", gradB: "#131813", gradC: "#0F130F",
      cardBg: "#1E2620", inputBg: "#242D26", softBg: "#2A3529", softBg2: "#2F3D2E",
      softBg3: "#242D26", softBg4: "#242D26",
      dividerSoft: "#2E3830", borderSoft: "#2E3830", border: "#3B473C",
      borderSoft2: "#3B473C", borderStrong: "#465345",
      textPrimary: "#E6F0E4", textSecondary: "#C8D6C5", textMuted: "#9DAD9A",
      textFaint: "#899987", textFainter: "#62705F",
      accentPlum: "#8FC5A3", oldPlumBg: "#27352B",
      budgetBorder: "#3B473C", budgetMuted: "#93A190",
    },
    lightCats: {
      blue: { bg: "#E9F0EC", text: "#3A5F4B", dot: "#3F6350", soft: "#F5F9F6" },
      green: { bg: "#EDF3EA", text: "#5D7A52", dot: "#6E9161", soft: "#F7FAF5" },
      orange: { bg: "#F6F1EB", text: "#8F6440", dot: "#A87C4F", soft: "#FBF8F4" },
      yellow: { bg: "#F8F6EA", text: "#8D8543", dot: "#A89C55", soft: "#FCFBF5" },
    },
    darkCats: {
      blue: { bg: "#263329", text: "#BEE3CC", dot: "#7FB795", soft: "#2E3D31" },
      green: { bg: "#2A3527", text: "#C6D9B9", dot: "#9CBA88", soft: "#323F2F" },
      orange: { bg: "#332D25", text: "#DEBE96", dot: "#BE9968", soft: "#3C352C" },
      yellow: { bg: "#333323", text: "#DBD69B", dot: "#B5AC6B", soft: "#3D3D2A" },
    },
  },

  slate: {
    label: "Slate",
    swatch: "#3D5570",
    light: {
      gradA: "#ECF0F4", gradB: "#F1F4F7", gradC: "#E5EBF1",
      inputBg: "#F4F7FA", softBg: "#EFF4F9", softBg2: "#D8E4EF",
      softBg3: "#FBFCFE", softBg4: "#F3F6F9",
      dividerSoft: "#E6ECF2", borderSoft: "#DAE2EA", border: "#C9D4DF",
      borderSoft2: "#D1DAE4", borderStrong: "#B3C1D0",
      textPrimary: "#1E262E", textSecondary: "#35414C", textMuted: "#6D7A87",
      textFaint: "#8C99A6", textFainter: "#ADB8C3",
      accentPlum: "#3D5570", oldPlumBg: "#E3EAF2",
      budgetBorder: "#B0BCC8", budgetMuted: "#86929E",
    },
    dark: {
      gradA: "#181D23", gradB: "#12161A", gradC: "#0E1114",
      cardBg: "#1C222A", inputBg: "#222932", softBg: "#28313C", softBg2: "#2D3846",
      softBg3: "#222932", softBg4: "#222932",
      dividerSoft: "#2C343E", borderSoft: "#2C343E", border: "#394451",
      borderSoft2: "#394451", borderStrong: "#45525F",
      textPrimary: "#E3EAF2", textSecondary: "#C4CFDA", textMuted: "#98A5B2",
      textFaint: "#84919E", textFainter: "#5E6A76",
      accentPlum: "#8FB4DA", oldPlumBg: "#253140",
      budgetBorder: "#394451", budgetMuted: "#8F9CA8",
    },
    lightCats: {
      blue: { bg: "#E8EEF5", text: "#37536F", dot: "#3D5570", soft: "#F4F8FB" },
      green: { bg: "#EBF2EE", text: "#4C7360", dot: "#5C8871", soft: "#F5FAF7" },
      orange: { bg: "#F5F0EC", text: "#8B6248", dot: "#A5765A", soft: "#FAF7F4" },
      yellow: { bg: "#F7F4EB", text: "#8A7C4B", dot: "#A5945C", soft: "#FCFAF5" },
    },
    darkCats: {
      blue: { bg: "#26313E", text: "#BDD6EE", dot: "#7FA5C9", soft: "#2E3B4A" },
      green: { bg: "#26352E", text: "#B9DCC8", dot: "#79AF92", soft: "#2E3F37" },
      orange: { bg: "#332C26", text: "#DDBB9C", dot: "#BB916D", soft: "#3C342C" },
      yellow: { bg: "#333023", text: "#DAD09A", dot: "#B4A76A", soft: "#3D3A2A" },
    },
  },

  ember: {
    label: "Ember",
    swatch: "#A04A2A",
    light: {
      gradA: "#FBEFE6", gradB: "#FAF3EB", gradC: "#F7E9DC",
      inputBg: "#FDF7F1", softBg: "#FFF3E9", softBg2: "#FADCC4",
      softBg3: "#FFFDFA", softBg4: "#FCF6EF",
      dividerSoft: "#F6EBE0", borderSoft: "#EFDFD0", border: "#E6D1BC",
      borderSoft2: "#E9D7C4", borderStrong: "#D7BCA0",
      textPrimary: "#2B211A", textSecondary: "#4A3B2E", textMuted: "#8A7562",
      textFaint: "#A8927D", textFainter: "#C6B29C",
      accentPlum: "#A04A2A", oldPlumBg: "#F8E3D6",
      budgetBorder: "#C7B29C", budgetMuted: "#9A8874",
    },
    dark: {
      gradA: "#231A15", gradB: "#191310", gradC: "#14100D",
      cardBg: "#281E18", inputBg: "#2E241D", softBg: "#372A20", softBg2: "#422F21",
      softBg3: "#2E241D", softBg4: "#2E241D",
      dividerSoft: "#392E25", borderSoft: "#392E25", border: "#4A3B2E",
      borderSoft2: "#4A3B2E", borderStrong: "#574535",
      textPrimary: "#F4E8DC", textSecondary: "#DBC9B7", textMuted: "#B39C85",
      textFaint: "#9E8873", textFainter: "#756251",
      accentPlum: "#E39268", oldPlumBg: "#3A2A20",
      budgetBorder: "#4A3B2E", budgetMuted: "#A3907C",
    },
    lightCats: {
      blue: { bg: "#F7EEE8", text: "#8C4526", dot: "#A04A2A", soft: "#FCF8F5" },
      green: { bg: "#F1F4EE", text: "#62795A", dot: "#74906A", soft: "#F9FAF7" },
      orange: { bg: "#FAEFE7", text: "#A05B32", dot: "#B87043", soft: "#FDF9F5" },
      yellow: { bg: "#FAF4E9", text: "#A6873F", dot: "#C09A4E", soft: "#FDFAF6" },
    },
    darkCats: {
      blue: { bg: "#37281F", text: "#EFC0A2", dot: "#C4805A", soft: "#413026" },
      green: { bg: "#2C3327", text: "#C4D3B6", dot: "#98AF85", soft: "#343C2F" },
      orange: { bg: "#382A20", text: "#EDBB92", dot: "#CE9061", soft: "#423227" },
      yellow: { bg: "#3A3122", text: "#E9CE94", dot: "#D3AA63", soft: "#463B2A" },
    },
  },
};

const STORAGE_KEY = "orbit-palette";

// localStorage throws in Safari private browsing rather than returning null,
// so every access is guarded.
function readPaletteId() {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v && PALETTES[v] ? v : "plum";
  } catch (e) {
    return "plum";
  }
}

export const prefersDark =
  typeof window !== "undefined" && window.matchMedia &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

export const paletteId = typeof window !== "undefined" ? readPaletteId() : "plum";

const active = PALETTES[paletteId] || PALETTES.plum;

export const PALETTE = prefersDark ? active.darkCats : active.lightCats;

export const theme = prefersDark
  ? { ...BASE_DARK, ...active.dark }
  : { ...BASE_LIGHT, ...active.light };

export const PALETTE_OPTIONS = Object.keys(PALETTES).map((id) => ({
  id,
  label: PALETTES[id].label,
  swatch: PALETTES[id].swatch,
}));

// Reload rather than re-render: `theme` is a plain object read at module load,
// so nothing would pick up a change in place.
export function setPaletteId(id) {
  if (!PALETTES[id]) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch (e) {
    console.error("Could not save palette choice", e);
  }
  window.location.reload();
}

if (typeof window !== "undefined" && window.matchMedia) {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => window.location.reload());
}