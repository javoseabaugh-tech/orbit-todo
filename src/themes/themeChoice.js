// Which theme each person uses. Saved to their own account
// (users/{uid}/settings/ui, covered by the existing owner-only rule on
// users/{uid}/**) and cached on the device, because the colours are chosen
// once at page load (see src/dial/tokens.js). Changing theme therefore saves,
// then reloads, the same way a system light/dark change does.
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { THEME_ID, THEME_IDS, THEME_KEY } from "../dial/tokens";

export const THEME_OPTIONS = [
  { id: "space", label: "Space", blurb: "A living planet among the stars. Its sunlit side grows as your day gets done; reminders are moons.", swatch: "linear-gradient(140deg, #1A2150, #6B7CFF 60%, #9A6BFF)" },
  { id: "fire", label: "Fire", blurb: "A fire pit that burns brighter as your day gets done. Reminders are glowing coals.", swatch: "linear-gradient(140deg, #1A120E, #8A4A2E 55%, #E0A77A)" },
  { id: "water", label: "Water", blurb: "A pool of light and water that fills as your day gets done. Lily pads for reminders.", swatch: "linear-gradient(140deg, #0F2A2C, #1E6B6A 55%, #7FD8B0)" },
];

const settingsRef = (uid) => doc(db, "users", uid, "settings", "ui");

function cache(id) {
  try {
    window.localStorage.setItem(THEME_KEY, id);
  } catch (e) {
    console.error("Could not cache theme choice", e);
  }
}

// Saves the choice to the account, then reloads so every screen picks it up.
// The save is given a few seconds; if the phone is offline the device cache
// still switches now and the account catches up when the write goes through.
export async function chooseTheme(uid, id) {
  if (!THEME_IDS.includes(id)) return;
  cache(id);
  try {
    await Promise.race([
      setDoc(settingsRef(uid), { theme: id }, { merge: true }),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);
  } catch (e) {
    console.error("Could not save theme choice", e);
  }
  window.location.reload();
}

// On sign-in: if the account says a different theme than this device has
// cached (picked on another phone), switch to it.
export async function syncThemeFromAccount(uid) {
  try {
    const snap = await getDoc(settingsRef(uid));
    const id = snap.exists() ? snap.data().theme : null;
    if (THEME_IDS.includes(id) && id !== THEME_ID) {
      cache(id);
      window.location.reload();
    }
  } catch (e) {
    console.error("Could not read theme choice", e);
  }
}
