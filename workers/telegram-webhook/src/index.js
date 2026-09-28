// Orbit's Telegram webhook. Every person's bot points its webhook here, at
// https://<this worker>/<their bot token>.
//
// It does two things:
//   1. When someone messages their bot during Orbit's Telegram setup, it
//      replies with their chat ID (unchanged from the original Worker).
//   2. When someone taps a button under the 6pm Nightly nudge, it marks that
//      Nightly item done in Firestore.
//
// There is no Google service account key. The Worker signs a short assertion
// about itself with a key it generated (OIDC_KEY, a Cloudflare secret), and
// Google trusts that through a Workload Identity Federation pool, then lets it
// act as one service account. See README.md.

const SUBJECT = "orbit-telegram-webhook";
const STS_URL = "https://sts.googleapis.com/v1/token";
const HOUSEHOLD_ROLES = { owner: true, household: true };

let accessCache = { token: null, expires: 0 };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ ok: true, project: env.FIREBASE_PROJECT_ID ?? null, ready: !!env.OIDC_KEY });
    }

    // Being an OIDC issuer is two public documents: Google fetches these to
    // check the Worker's assertions. They hold only the public key.
    if (url.pathname === "/.well-known/openid-configuration") {
      return json({
        issuer: env.OIDC_ISSUER,
        jwks_uri: `${env.OIDC_ISSUER}/.well-known/jwks.json`,
        response_types_supported: ["id_token"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
      }, 200, { "Cache-Control": "public, max-age=3600" });
    }
    if (url.pathname === "/.well-known/jwks.json") {
      if (!env.OIDC_KEY) return json({ keys: [] });
      const { publicJwk } = JSON.parse(env.OIDC_KEY);
      return json({ keys: [publicJwk] }, 200, { "Cache-Control": "public, max-age=3600" });
    }

    if (request.method !== "POST") {
      return new Response("OK");
    }

    const token = url.pathname.slice(1);
    if (!token || !/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
      return new Response("Missing token", { status: 400 });
    }

    const update = await request.json();

    if (update?.callback_query) {
      // Always answer Telegram with 200, or it retries the same update.
      try {
        await handleTap(update.callback_query, token, env);
      } catch (e) {
        console.error("tap failed", e?.message || e);
        await answer(token, update.callback_query.id, "Couldn't update that. Open Orbit to tick it off.");
      }
      return new Response("OK");
    }

    // Setup helper, unchanged: reply with the chat ID to paste into Orbit.
    const chatId = update?.message?.chat?.id;
    const firstName = update?.message?.chat?.first_name || "there";

    if (chatId) {
      const message = `Hi ${firstName}! Your Chat ID is:\n\n${chatId}\n\nCopy that number and paste it into Orbit's Notification Settings.`;
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: message }),
      });
    }

    return new Response("OK");
  },
};

// ---------- Nightly taps ----------
//
// Button data, written by the nudge (apps-script/nightly/Code.js):
//   n:<u|h>:<itemId>             an item that already exists tonight
//   t:<u|h>:<templateId>:<date>  a repeating item the app hasn't created yet
// u = the person's own list, h = the shared household list.
//
// The bot token in the URL decides whose items a tap may touch: it must match
// someone's saved Telegram settings (notifyConfig), and the tap must come from
// that same chat. Nothing in the button data can point at anyone else's list,
// and nothing outside `nightly` is ever written.
export function parseTap(data) {
  let m = /^n:([uh]):([A-Za-z0-9_-]{1,80})$/.exec(data || "");
  if (m) return { kind: "item", scope: m[1], itemId: m[2] };
  m = /^t:([uh]):([A-Za-z0-9_-]{1,60}):(\d{4}-\d{2}-\d{2})$/.exec(data || "");
  if (m) return { kind: "template", scope: m[1], templateId: m[2], date: m[3], itemId: `${m[2]}_${m[3]}` };
  return null;
}

async function handleTap(cq, botToken, env) {
  const tap = parseTap(cq.data);
  if (!tap) return answer(botToken, cq.id, "That button is out of date.");
  if (!env.OIDC_KEY || !env.SERVICE_ACCOUNT) {
    return answer(botToken, cq.id, "Tapping to tick off isn't set up yet. Open Orbit instead.");
  }
  const chatId = String(cq.message?.chat?.id ?? "");
  const access = await getAccessToken(env);
  const db = firestore(env, access);

  const person = await db.personForBot(botToken, chatId);
  if (!person) return answer(botToken, cq.id, "This bot isn't linked to Orbit.");

  let parent;
  if (tap.scope === "u") {
    parent = `users/${person.uid}`;
  } else {
    if (!HOUSEHOLD_ROLES[person.role]) return answer(botToken, cq.id, "That's a household item you don't share.");
    parent = `households/${env.HOUSEHOLD_ID || "seabaugh"}`;
  }
  const itemPath = `${parent}/nightly/${tap.itemId}`;
  const done = { done: true };
  if (tap.scope === "h") {
    // Telegram's first name matches what the app shows ("Done by Javier").
    done.doneBy = cq.from?.first_name || person.name;
    done.doneAt = new Date();
  }

  if (tap.kind === "item") {
    const ok = await db.patchExisting(itemPath, done);
    if (!ok) return answer(botToken, cq.id, "That item is gone. Open Orbit to check.");
  } else {
    // The app normally creates tonight's repeating items when it opens. If it
    // hasn't today, create this one now, ticked, at the same ID the app would
    // use, so the app sees it as done rather than making a second copy.
    const tpl = await db.get(`${parent}/nightlyTemplates/${tap.templateId}`);
    if (!tpl) return answer(botToken, cq.id, "That repeating item was removed.");
    const created = await db.createIfMissing(itemPath, {
      text: tpl.text || "",
      forDate: tap.date,
      rolledOver: false,
      skipped: false,
      templateId: tap.templateId,
      createdAt: new Date(),
      ...done,
    });
    if (!created) await db.patchExisting(itemPath, done);
  }

  await answer(botToken, cq.id, "Done ✓");
  await dropButton(botToken, cq);
}

async function answer(botToken, callbackId, text) {
  await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackId, text }),
  });
}

// Takes the tapped button off the message so the list shows what's left.
async function dropButton(botToken, cq) {
  const rows = cq.message?.reply_markup?.inline_keyboard;
  if (!rows || !cq.message?.message_id) return;
  const left = rows
    .map((row) => row.filter((b) => b.callback_data !== cq.data))
    .filter((row) => row.length);
  await fetch(`https://api.telegram.org/bot${botToken}/editMessageReplyMarkup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: cq.message.chat.id,
      message_id: cq.message.message_id,
      reply_markup: { inline_keyboard: left },
    }),
  });
}

// ---------- Firestore (REST) ----------
function firestore(env, access) {
  const root = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
  const headers = { Authorization: `Bearer ${access}`, "Content-Type": "application/json" };

  return {
    async get(path) {
      const res = await fetch(`${root}/${path}`, { headers });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`get ${path}: ${res.status}`);
      return fromFields((await res.json()).fields || {});
    },

    // Only ever updates a document that already exists, and only the given
    // fields. Returns false if it doesn't exist.
    async patchExisting(path, data) {
      const mask = Object.keys(data).map((k) => `updateMask.fieldPaths=${k}`).join("&");
      const res = await fetch(`${root}/${path}?${mask}&currentDocument.exists=true`, {
        method: "PATCH", headers, body: JSON.stringify({ fields: toFields(data) }),
      });
      if (res.status === 404 || res.status === 400 || res.status === 412) return false;
      if (!res.ok) throw new Error(`patch ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
      return true;
    },

    // Creates the document only if nothing is there. Returns false if it was.
    async createIfMissing(path, data) {
      const res = await fetch(`${root}/${path}?currentDocument.exists=false`, {
        method: "PATCH", headers, body: JSON.stringify({ fields: toFields(data) }),
      });
      if (res.status === 400 || res.status === 409 || res.status === 412) return false;
      if (!res.ok) throw new Error(`create ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
      return true;
    },

    // Who owns this bot: the notifyConfig doc (keyed by email) holding this
    // exact bot token, whose chat ID matches the tap. Then their access doc
    // for uid and role.
    async personForBot(botToken, chatId) {
      const res = await fetch(`${root}:runQuery`, {
        method: "POST", headers,
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: "notifyConfig" }],
            where: { fieldFilter: { field: { fieldPath: "telegramBotToken" }, op: "EQUAL", value: { stringValue: botToken } } },
            limit: 1,
          },
        }),
      });
      if (!res.ok) throw new Error(`notifyConfig query: ${res.status}`);
      const hit = (await res.json()).find((r) => r.document);
      if (!hit) return null;
      const cfg = fromFields(hit.document.fields || {});
      if (String(cfg.telegramChatId ?? "") !== chatId) return null;
      const email = decodeURIComponent(hit.document.name.split("/").pop()).toLowerCase();
      const acc = await this.get(`access/${encodeURIComponent(email)}`);
      if (!acc?.uid) return null;
      return { uid: acc.uid, role: acc.role || null, name: email.split(/[@._-]/)[0].replace(/^./, (c) => c.toUpperCase()) };
    },
  };
}

function toFields(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = toValue(v);
  return out;
}
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  return { stringValue: String(v) };
}
function fromFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if ("stringValue" in v) out[k] = v.stringValue;
    else if ("booleanValue" in v) out[k] = v.booleanValue;
    else if ("integerValue" in v) out[k] = Number(v.integerValue);
    else if ("doubleValue" in v) out[k] = v.doubleValue;
    else if ("timestampValue" in v) out[k] = v.timestampValue;
    else out[k] = null;
  }
  return out;
}

// ---------- keyless Google sign-in (same scheme as Pulse's push Worker) ----------
//
// Sign a five-minute assertion about ourselves, exchange it at Google's token
// service for a federated token, and use that to act as the one service
// account the identity pool allows, for an hour.
async function getAccessToken(env) {
  if (accessCache.token && Date.now() < accessCache.expires) return accessCache.token;

  const sts = await fetch(STS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audience: env.WIF_AUDIENCE,
      grantType: "urn:ietf:params:oauth:grant-type:token-exchange",
      requestedTokenType: "urn:ietf:params:oauth:token-type:access_token",
      scope: "https://www.googleapis.com/auth/cloud-platform",
      subjectTokenType: "urn:ietf:params:oauth:token-type:jwt",
      subjectToken: await selfAssertion(env),
    }),
  });
  if (!sts.ok) throw new Error(`federation refused it: ${sts.status} ${(await sts.text()).slice(0, 200)}`);
  const { access_token: federated } = await sts.json();

  const impersonate = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${env.SERVICE_ACCOUNT}:generateAccessToken`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${federated}`, "Content-Type": "application/json" },
      body: JSON.stringify({ scope: ["https://www.googleapis.com/auth/datastore"], lifetime: "3600s" }),
    },
  );
  if (!impersonate.ok) {
    throw new Error(`could not act as the service account: ${impersonate.status} ${(await impersonate.text()).slice(0, 200)}`);
  }
  const { accessToken, expireTime } = await impersonate.json();
  accessCache = { token: accessToken, expires: Date.parse(expireTime) - 300_000 };
  return accessToken;
}

async function selfAssertion(env) {
  const { kid, privateKey } = JSON.parse(env.OIDC_KEY);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid };
  const claims = { iss: env.OIDC_ISSUER, sub: SUBJECT, aud: env.WIF_AUDIENCE, iat: now, exp: now + 300 };
  const enc = (o) => bytesToBase64Url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc(header)}.${enc(claims)}`;
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToBytes(privateKey), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${bytesToBase64Url(new Uint8Array(sig))}`;
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}
function bytesToBase64Url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function pemToBytes(pem) {
  const body = pem.replace(/-----BEGIN [^-]+-----/, "").replace(/-----END [^-]+-----/, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}
