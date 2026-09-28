// Keeps an installed Orbit on the newest deploy without reinstalling.
//
// Every build writes its version into the bundle (__APP_VERSION__) and into
// /version.json. This compares the two:
//   - when the app comes back to the foreground (reopened from the Home
//     Screen, tab refocused) and a newer version is live, it reloads right
//     away, before you've started doing anything
//   - while you're using it, it checks every 10 minutes and, if there's a
//     newer version, shows a small "Update" pill instead of reloading under
//     your fingers
//
// Offline, or if version.json can't be read, it does nothing.

const CHECK_EVERY_MS = 10 * 60 * 1000;

async function liveVersion() {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body.version === "string" ? body.version : null;
  } catch (e) {
    return null;
  }
}

function showUpdatePill() {
  if (document.getElementById("orbit-update-pill")) return;
  const pill = document.createElement("button");
  pill.id = "orbit-update-pill";
  pill.type = "button";
  pill.textContent = "New version of Orbit · Tap to update";
  Object.assign(pill.style, {
    position: "fixed", left: "50%", transform: "translateX(-50%)",
    bottom: "calc(92px + env(safe-area-inset-bottom))", zIndex: "2147483646",
    padding: "10px 16px", borderRadius: "999px", border: "none", cursor: "pointer",
    font: "700 13px/1.2 Figtree, Geist, system-ui, sans-serif",
    background: "#FFB547", color: "#0A0D1F", boxShadow: "0 10px 30px -8px rgba(0,0,0,.5)",
  });
  pill.addEventListener("click", () => window.location.reload());
  document.body.appendChild(pill);
}

export function startUpdateCheck() {
  // A dev server has no version.json worth comparing against.
  if (import.meta.env.DEV) return;
  const current = __APP_VERSION__;

  async function check(reloadIfNewer) {
    const live = await liveVersion();
    if (!live || live === current) return;
    if (reloadIfNewer) window.location.reload();
    else showUpdatePill();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check(true);
  });
  setInterval(() => {
    if (document.visibilityState === "visible") check(false);
  }, CHECK_EVERY_MS);
}
