if (import.meta.env.DEV) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

// Which Firebase project this build talks to comes from the Vite mode:
// .env.production (live, orbit-cbd4e) for `npm run build`, .env.staging for
// `npm run build:staging`, and .env.development (also staging) for
// `npm run dev`. See STAGING.md.
const env = import.meta.env;
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  // Must match the domain the app is actually served from. signInWithRedirect
  // hands the session off via authDomain, and since Chrome 115 / Safari ITP
  // partitioned third-party storage that handoff silently fails across origins
  // — auth completes, onAuthStateChanged fires null, and you loop back to the
  // sign-in button. The default "<project>.firebaseapp.com" is a *different*
  // origin from the web.app host, so it loops. Firebase Hosting serves
  // /__/auth/* on both, so this is a valid authDomain.
  // Deploying to a preview channel needs this set to that channel's hostname.
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

// Fail loudly rather than start against a half-configured project.
const missing = Object.entries({ ...firebaseConfig, recaptchaSiteKey: env.VITE_RECAPTCHA_SITE_KEY })
  .filter(([, v]) => !v || v.includes("REPLACE_ME"))
  .map(([k]) => k);
if (missing.length) {
  throw new Error(`Firebase config for mode "${env.MODE}" is incomplete: ${missing.join(", ")}. See STAGING.md.`);
}

export const app = initializeApp(firebaseConfig);
export const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider(env.VITE_RECAPTCHA_SITE_KEY),
  isTokenAutoRefreshEnabled: true,
});
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Offline persistence: caches data locally so the app still works with no
// signal, and queues any changes you make to sync automatically once
// you're back online. persistentMultipleTabManager keeps things in sync if
// you ever have Orbit open in more than one tab/window.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
