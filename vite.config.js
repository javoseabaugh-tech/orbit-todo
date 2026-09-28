import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Every build gets a version: the commit it was built from in CI, or the
// build time locally. It is baked into the bundle and also written to
// /version.json, so a running copy of the app can tell when a newer one has
// been deployed (see src/updateCheck.js).
const APP_VERSION = process.env.GITHUB_SHA || `local-${Date.now()}`;

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [
    react(),
    {
      name: "orbit-version-file",
      generateBundle() {
        this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ version: APP_VERSION }) });
      },
    },
  ],
});
