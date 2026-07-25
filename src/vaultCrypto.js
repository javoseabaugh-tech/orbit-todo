// Zero-knowledge encryption for the budget app's password vault, built on
// the browser's native Web Crypto API — nothing homemade at the primitive
// level (PBKDF2, AES-GCM are both standard, well-vetted algorithms), only
// the way they're wired together here is custom.
//
// The vault passphrase never leaves the browser and is never stored
// anywhere — only a derived encryption key (kept in memory only, for the
// current visit) and a small "verifier" (proves a passphrase is correct
// without revealing anything about it) are ever persisted.

const PBKDF2_ITERATIONS = 250000;
const VERIFIER_PLAINTEXT = "orbit-vault-ok";

function bufToB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b64ToBuf(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
}

export function generateSaltB64() {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return bufToB64(salt);
}

export async function deriveKey(passphrase, saltB64) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: b64ToBuf(saltB64),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptText(key, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
  return { iv: bufToB64(iv), ct: bufToB64(ct) };
}

export async function decryptText(key, { iv, ct }) {
  const dec = new TextDecoder();
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBuf(iv) },
    key,
    b64ToBuf(ct)
  );
  return dec.decode(plainBuf);
}

export async function makeVerifier(key) {
  return encryptText(key, VERIFIER_PLAINTEXT);
}

export async function checkVerifier(key, verifier) {
  try {
    const plain = await decryptText(key, verifier);
    return plain === VERIFIER_PLAINTEXT;
  } catch (e) {
    // AES-GCM fails decryption entirely (throws) when the key is wrong —
    // that's the expected outcome for an incorrect passphrase, not a bug.
    return false;
  }
}
