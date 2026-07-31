// Face ID / Touch ID fast-unlock for the vault, built on WebAuthn's PRF
// extension. This is NOT "Face ID replaces the passphrase" — it's a
// convenience layer that lets THIS device cache the passphrase, encrypted
// by a key that only comes into existence when Face ID succeeds. The
// passphrase itself never leaves the device, and a new/different device
// always falls back to typing it normally.
//
// Requires the PRF extension (fairly new — modern Safari on iOS/macOS
// supports it, older browsers don't). If it's not available, every
// function here fails safely and the caller should just fall back to
// normal passphrase entry — nothing about the vault itself depends on
// this working.

const STORAGE_KEY = "orbit-vault-face";
const PRF_SALT = new TextEncoder().encode("orbit-vault-prf-v1");

function bufToB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function b64ToBuf(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
}

export async function platformAuthAvailable() {
  if (!window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch (e) {
    return false;
  }
}

export function hasFaceUnlock() {
  return !!localStorage.getItem(STORAGE_KEY);
}

export function removeFaceUnlock() {
  localStorage.removeItem(STORAGE_KEY);
}

async function deriveWrappingKey(credentialId, prfBytes) {
  // PRF output is already 32 bytes of high-entropy, device+credential-bound
  // secret material — usable directly as an AES-256 key.
  return crypto.subtle.importKey("raw", prfBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

// Sets up Face ID for this device. Call this right after a successful
// manual (typed-passphrase) unlock, so we have the real passphrase in
// hand to cache. Returns true on success, false if this device/browser
// doesn't support it (caller should just not show the option again).
export async function registerFaceUnlock(passphrase) {
  if (!(await platformAuthAvailable())) return false;

  try {
    const userId = crypto.getRandomValues(new Uint8Array(16));
    const challenge = crypto.getRandomValues(new Uint8Array(32));

    const cred = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: "Orbit Vault" },
        user: { id: userId, name: "vault", displayName: "Orbit Vault" },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
        extensions: { prf: {} },
      },
    });

    if (!cred?.getClientExtensionResults().prf?.enabled) {
      // Credential was created, but this device doesn't actually support
      // PRF — no safe way to derive a real key, so don't proceed.
      return false;
    }

    // A follow-up get() is needed to actually read the PRF output.
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ id: cred.rawId, type: "public-key" }],
        userVerification: "required",
        extensions: { prf: { eval: { first: PRF_SALT } } },
      },
    });

    const prfResults = assertion.getClientExtensionResults().prf;
    if (!prfResults?.results?.first) return false;

    const wrappingKey = await deriveWrappingKey(cred.rawId, prfResults.results.first);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrappingKey, enc.encode(passphrase));

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ credentialId: bufToB64(cred.rawId), iv: bufToB64(iv), ct: bufToB64(ct) })
    );
    return true;
  } catch (e) {
    console.error("Face ID setup failed:", e);
    return false;
  }
}

// Attempts to unlock via Face ID. Returns the cached passphrase string on
// success, or null if unavailable/cancelled/failed — callers should treat
// null as "fall back to typing the passphrase," not as an error to surface.
export async function tryFaceUnlock() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const { credentialId, iv, ct } = JSON.parse(raw);

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ id: b64ToBuf(credentialId), type: "public-key" }],
        userVerification: "required",
        extensions: { prf: { eval: { first: PRF_SALT } } },
      },
    });

    const prfResults = assertion.getClientExtensionResults().prf;
    if (!prfResults?.results?.first) return null;

    const wrappingKey = await deriveWrappingKey(b64ToBuf(credentialId), prfResults.results.first);
    const dec = new TextDecoder();
    const plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64ToBuf(iv) },
      wrappingKey,
      b64ToBuf(ct)
    );
    return dec.decode(plainBuf);
  } catch (e) {
    console.error("Face ID unlock failed or was cancelled:", e);
    return null;
  }
}


// ---------- Budget-entry Face ID gate ----------
// A separate, simpler Face ID check that runs before opening EITHER budget
// icon (shared or private), for any user. Unlike the vault unlock above,
// this doesn't wrap or derive anything — it's just a plain "confirm it's
// really you" biometric check, so it works even for people who haven't
// set up the encrypted vault at all.
const BUDGET_GATE_KEY = "orbit-budget-gate-cred";
const BUDGET_GATE_DECLINED_KEY = "orbit-budget-gate-declined";
export function hasBudgetGate() {
  return !!localStorage.getItem(BUDGET_GATE_KEY);
}
export function budgetGateDeclined() {
  return !!localStorage.getItem(BUDGET_GATE_DECLINED_KEY);
}
export function declineBudgetGate() {
  localStorage.setItem(BUDGET_GATE_DECLINED_KEY, "1");
}
export function removeBudgetGate() {
  localStorage.removeItem(BUDGET_GATE_KEY);
  localStorage.removeItem(BUDGET_GATE_DECLINED_KEY);
}
export async function registerBudgetGate() {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "Orbit" },
      user: { id: userId, name: "orbit-budget-gate", displayName: "Orbit Budget" },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
      timeout: 60000,
    },
  });
  if (!cred) throw new Error("Credential creation failed");
  localStorage.setItem(BUDGET_GATE_KEY, bufToB64(cred.rawId));
  localStorage.removeItem(BUDGET_GATE_DECLINED_KEY);
  return true;
}
// `signal` lets the caller abandon a request that never settles — WebKit can
// leave credentials.get() pending indefinitely (rather than rejecting) when the
// call happens outside transient user activation, so callers need an escape.
export async function verifyBudgetGate(signal) {
  const credIdB64 = localStorage.getItem(BUDGET_GATE_KEY);
  if (!credIdB64) return false;
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  try {
    const assertion = await navigator.credentials.get({
      signal,
      publicKey: {
        challenge,
        allowCredentials: [{ id: b64ToBuf(credIdB64), type: "public-key" }],
        userVerification: "required",
        timeout: 60000,
      },
    });
    return !!assertion;
  } catch (e) {
    console.error("Budget gate verification failed or was cancelled:", e);
    return false;
  }
}
