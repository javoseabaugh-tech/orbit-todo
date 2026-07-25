import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      let refreshing = false;
      // When a new service worker takes over (i.e. a new version was
      // installed and activated), reload once so the app actually shows
      // the new code instead of sitting on stale JS until manually
      // reinstalled.
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
      // Installed PWAs can sit suspended for a long time without the
      // browser's normal periodic update check ever firing on its own, so
      // explicitly ask for an update check whenever the app becomes
      // visible again (reopened from Home Screen, tab refocused, etc.)
      // and once right away on load.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          reg.update().catch(() => {});
        }
      });
      reg.update().catch(() => {});
    }).catch((err) => console.error("SW registration failed:", err));
  });
}
// iOS (and some other WebKit) standalone PWAs can freeze the whole page
// instead of truly closing it when you leave, then thaw the exact same
// frozen JS instance when reopened from the Home Screen — no reload, no
// visibilitychange, nothing our earlier fix could ever catch. The
// pageshow event's persisted flag is the one reliable signal for this
// exact situation: it tells us the page was just restored from a frozen
// state rather than freshly loaded, so we force a real reload then.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    window.location.reload();
  }
});
