import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

const firebaseConfig = {
  apiKey: "AIzaSyAvQhtSEe54arPmUYBqI9dUMemBt1whQzI",
  authDomain: "orbit-cbd4e.firebaseapp.com",
  projectId: "orbit-cbd4e",
  storageBucket: "orbit-cbd4e.firebasestorage.app",
  messagingSenderId: "944702899935",
  appId: "1:944702899935:web:8aa243b3eee1d31ee44b6a",
};

export const app = initializeApp(firebaseConfig);
export const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider("6LcF3VotAAAAAIZiCxONrI7D4r-4GEj2stg011f2"),
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
