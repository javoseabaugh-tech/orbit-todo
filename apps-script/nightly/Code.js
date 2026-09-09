/**
 * Orbit — Nightly Routine 6pm nudge
 *
 * Standalone Apps Script. Follows the same conventions as the digest project:
 * two-property service-account auth, owner notified via script properties,
 * everyone else via their own notifyConfig doc.
 *
 * READS ONLY — never writes. The app is the only thing that creates nightly
 * documents. This works out which recurring templates match tonight purely to
 * compose the message, so the nudge is right even on days you haven't opened
 * the app.
 *
 * Script Properties (all copied from the digest project):
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_UID
 *   SERVICE_ACCOUNT_EMAIL
 *   SERVICE_ACCOUNT_PRIVATE_KEY
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_CHAT_ID
 *   USER_NAME               (optional)
 */

const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore";
const SEND_WHEN_EMPTY = false;   // true = still message on empty nights

function props_() {
  return PropertiesService.getScriptProperties();
}

/* ------------------------------------------------------------------ *
 * Entry points
 * ------------------------------------------------------------------ */

function sendNightlyNudge() {
  const token = getAccessToken_();
  const today = todayString_();
  const ownerUid = props_().getProperty("FIREBASE_UID");

  const people = listRootCollection_(token, "access")
    .filter(function (d) { return d.uid; })
    .map(function (d) { return { uid: d.uid, email: d.email || d.id }; });

  // The owner may not have an access doc of their own — make sure they're in
  // the list exactly once regardless.
  if (ownerUid && !people.some(function (p) { return p.uid === ownerUid; })) {
    people.push({ uid: ownerUid, email: null });
  }

  // notifyConfig doc IDs come from the signed-in email as Firebase reports it,
  // while access doc IDs are lower-cased by the app. Fetching the collection
  // once and matching case-insensitively means a capital letter in someone's
  // address can't silently drop them from the nudge.
  const configByEmail = {};
  listRootCollection_(token, "notifyConfig").forEach(function (c) {
    configByEmail[String(c.id).toLowerCase()] = c;
  });

  Logger.log("Composing for %s — %s people", today, people.length);

  people.forEach(function (p) {
    try {
      const dest = resolveDestination_(p, ownerUid, configByEmail);
      if (!dest) {
        Logger.log("%s — no telegram config, skipping", p.email || p.uid);
        return;
      }

      const list = tonightFor_(token, p.uid, today);
      if (!list.pending.length && !SEND_WHEN_EMPTY) {
        Logger.log("%s — nothing pending, skipping", p.email || p.uid);
        return;
      }

      sendViaTelegramCustom_(dest.token, dest.chatId, buildMessage_(list));
      Logger.log("%s — sent (%s pending)", p.email || p.uid, list.pending.length);
    } catch (e) {
      // One person's bad token must not stop everyone else's message.
      Logger.log("%s — FAILED: %s", p.email || p.uid, e.message);
    }
  });
}

function testNightlyNow() {
  sendNightlyNudge();
}

function createTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "sendNightlyNudge") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("sendNightlyNudge").timeBased().everyDays(1).atHour(18).create();
  Logger.log("Trigger created for the 6pm hour (%s)", Session.getScriptTimeZone());
}

/**
 * A trigger outlives the code it points at: delete a function and its trigger
 * stays installed, firing into nothing, while the trigger list still looks
 * healthy. That is how this project's sibling silently lost two features.
 */
function checkTriggers() {
  Logger.log("Script timezone: %s — today is %s", Session.getScriptTimeZone(), todayString_());
  const triggers = ScriptApp.getProjectTriggers();
  if (!triggers.length) {
    Logger.log("NO TRIGGERS INSTALLED — run createTrigger().");
    return;
  }
  triggers.forEach(function (t) {
    const fn = t.getHandlerFunction();
    let defined;
    try {
      defined = typeof globalThis[fn] === "function";
    } catch (e) {
      defined = true; // can't tell — don't cry wolf
    }
    Logger.log("trigger: %s (%s)%s", fn, t.getEventType(), defined ? "" : "  <-- NOT DEFINED IN THIS PROJECT?");
  });
  if (!triggers.some(function (t) { return t.getHandlerFunction() === "sendNightlyNudge"; })) {
    Logger.log("MISSING: sendNightlyNudge has no trigger.");
  }
}

/** Prints what the script can actually see, without sending anything. */
function debugDump() {
  const token = getAccessToken_();
  const today = todayString_();
  const ownerUid = props_().getProperty("FIREBASE_UID");

  Logger.log("today (script tz %s): %s", Session.getScriptTimeZone(), today);
  Logger.log("owner uid: %s", ownerUid);

  const access = listRootCollection_(token, "access");
  Logger.log("access docs: %s", JSON.stringify(access.map(function (d) {
    return { id: d.id, uid: d.uid, email: d.email };
  })));

  const configByEmail = {};
  listRootCollection_(token, "notifyConfig").forEach(function (c) {
    configByEmail[String(c.id).toLowerCase()] = c;
  });
  access.filter(function (d) { return d.uid; }).forEach(function (d) {
    const email = d.email || d.id;
    const dest = resolveDestination_({ uid: d.uid, email: email }, ownerUid, configByEmail);
    Logger.log("  %s — %s", email, dest ? "will be nudged" : "SKIPPED, no telegram config");
  });

  Logger.log("--- owner nightly ---");
  Logger.log(JSON.stringify(listCollection_(token, ownerUid, "nightly")));

  Logger.log("--- owner nightlyTemplates ---");
  Logger.log(JSON.stringify(listCollection_(token, ownerUid, "nightlyTemplates")));

  Logger.log("--- composed ---");
  const list = tonightFor_(token, ownerUid, today);
  Logger.log("pending %s, done %s", list.pending.length, list.doneCount);
  Logger.log(buildMessage_(list));
}

/* ------------------------------------------------------------------ *
 * Where does this person's message go?
 * ------------------------------------------------------------------ */

function resolveDestination_(person, ownerUid, configByEmail) {
  if (person.uid === ownerUid) {
    const t = props_().getProperty("TELEGRAM_BOT_TOKEN");
    const c = props_().getProperty("TELEGRAM_CHAT_ID");
    return (t && c) ? { token: t, chatId: c } : null;
  }

  if (!person.email) return null;
  const cfg = configByEmail[String(person.email).toLowerCase()];
  if (!cfg || !cfg.telegramBotToken || !cfg.telegramChatId) return null;
  return { token: cfg.telegramBotToken, chatId: cfg.telegramChatId };
}

/* ------------------------------------------------------------------ *
 * Composing
 * ------------------------------------------------------------------ */

function tonightFor_(token, uid, today) {
  const items = listCollection_(token, uid, "nightly");
  const templates = listCollection_(token, uid, "nightlyTemplates");

  const seen = {};
  items.forEach(function (it) { seen[it.id] = true; });

  const pending = [];
  let doneCount = 0;

  items.forEach(function (it) {
    if ((it.forDate || today) !== today) return;
    if (it.skipped) return;
    if (it.done) { doneCount++; return; }
    pending.push({ text: it.text, carried: !!it.rolledOver });
  });

  // Templates firing tonight that haven't been materialised yet, because the
  // app hasn't been opened today. Virtual only — nothing is written.
  templates.forEach(function (tpl) {
    if (!templateMatches_(tpl, today)) return;
    if (seen[tpl.id + "_" + today]) return;   // exists already, or tombstoned
    pending.push({ text: tpl.text, carried: false });
  });

  return { pending: pending, doneCount: doneCount };
}

function buildMessage_(list) {
  if (!list.pending.length) {
    return "🌙 Nothing left for tonight. Sleep well.";
  }

  const lines = ["🌙 Tonight", ""];
  list.pending.forEach(function (p) {
    lines.push("• " + p.text + (p.carried ? "  (carried over)" : ""));
  });

  lines.push("");
  if (list.doneCount) {
    lines.push(list.doneCount + " already done — " + list.pending.length + " to go.");
  }
  lines.push(closingLine_(list.pending.length));

  return lines.join("\n");
}

/** Rotates by day so it doesn't read like the same robot every night. */
function closingLine_(pendingCount) {
  const few = [
    "Just the one. Easy.",
    "One thing, then rest.",
    "Small night. Take it gently."
  ];
  const some = [
    "A short list. You've got this.",
    "Nothing here is urgent — just yours.",
    "Take them one at a time.",
    "No rush. Whatever gets done, gets done."
  ];
  const many = [
    "Pick the one that matters most and start there.",
    "You don't have to finish all of it tonight.",
    "Start with the easiest one — momentum helps."
  ];

  const pool = pendingCount === 1 ? few : (pendingCount <= 3 ? some : many);
  const day = Math.floor(Date.now() / 86400000);
  return pool[day % pool.length];
}

/* ------------------------------------------------------------------ *
 * Recurrence — mirrors templateMatches() in src/Nightly.jsx.
 * If the rules change there, change them here too.
 * ------------------------------------------------------------------ */

function templateMatches_(tpl, dateStr) {
  const start = tpl.startDate || dateStr;
  if (dateStr < start) return false;

  const rec = tpl.recurrence || { type: "daily" };
  const t = dparts_(dateStr);
  const s = dparts_(start);

  if (rec.type === "daily") return true;

  if (rec.type === "weekly") {
    return new Date(t.y, t.m - 1, t.d).getDay() === new Date(s.y, s.m - 1, s.d).getDay();
  }

  if (rec.type === "monthly") {
    // new Date(y, m, 0) is the last day of month m — clamps the 31st onto a
    // short month's end rather than skipping that month entirely.
    const lastDay = new Date(t.y, t.m, 0).getDate();
    return t.d === Math.min(s.d, lastDay);
  }

  if (rec.type === "custom") {
    const n = Number(rec.intervalDays) || 1;
    return daysBetween_(start, dateStr) % n === 0;
  }

  return false;
}

function dparts_(s) {
  const p = String(s).split("-").map(Number);
  return { y: p[0], m: p[1], d: p[2] };
}

// Date.UTC, not local Date math — a DST boundary in between would otherwise
// throw every custom interval off by one.
function daysBetween_(a, b) {
  const A = dparts_(a), B = dparts_(b);
  return Math.round((Date.UTC(B.y, B.m - 1, B.d) - Date.UTC(A.y, A.m - 1, A.d)) / 86400000);
}

function todayString_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
}

/* ------------------------------------------------------------------ *
 * Firestore REST — same shape as the digest project
 * ------------------------------------------------------------------ */

function firestoreRootUrl_() {
  const projectId = props_().getProperty("FIREBASE_PROJECT_ID");
  return "https://firestore.googleapis.com/v1/projects/" + projectId +
         "/databases/(default)/documents";
}

/** Lists a subcollection under an arbitrary user, with paging. */
function listCollection_(token, uid, collectionId) {
  const out = [];
  let pageToken = "";

  do {
    let url = firestoreRootUrl_() + "/users/" + uid + "/" + collectionId + "?pageSize=300";
    if (pageToken) url += "&pageToken=" + encodeURIComponent(pageToken);

    const res = UrlFetchApp.fetch(url, {
      method: "get",
      headers: { Authorization: "Bearer " + token },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) {
      throw new Error("Firestore list " + collectionId + " → " + res.getContentText());
    }

    const body = JSON.parse(res.getContentText());
    (body.documents || []).forEach(function (d) { out.push(docToObject_(d)); });
    pageToken = body.nextPageToken || "";
  } while (pageToken);

  return out;
}

/**
 * pageSize is explicit: the REST default is small, and a silently truncated
 * access list would drop whoever sorted last out of the nudge without any
 * error to notice.
 */
function listRootCollection_(token, collectionId) {
  const out = [];
  let pageToken = "";

  do {
    let url = firestoreRootUrl_() + "/" + collectionId + "?pageSize=300";
    if (pageToken) url += "&pageToken=" + encodeURIComponent(pageToken);

    const res = UrlFetchApp.fetch(url, {
      method: "get",
      headers: { Authorization: "Bearer " + token },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) {
      throw new Error("Firestore list " + collectionId + " → " + res.getContentText());
    }

    const body = JSON.parse(res.getContentText());
    (body.documents || []).forEach(function (d) { out.push(docToObject_(d)); });
    pageToken = body.nextPageToken || "";
  } while (pageToken);

  return out;
}

function docToObject_(doc) {
  const out = { id: doc.name.split("/").pop() };
  const fields = doc.fields || {};
  for (const key in fields) out[key] = fieldValue_(fields[key]);
  return out;
}

function fieldValue_(v) {
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.integerValue !== undefined) return parseInt(v.integerValue, 10);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.nullValue !== undefined) return null;
  if (v.timestampValue !== undefined) return v.timestampValue;
  // The recurrence field is a map — the digest never needed these two.
  if (v.mapValue !== undefined) {
    const out = {};
    const f = v.mapValue.fields || {};
    for (const k in f) out[k] = fieldValue_(f[k]);
    return out;
  }
  if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(fieldValue_);
  return null;
}

/* ------------------------------------------------------------------ *
 * Telegram
 * ------------------------------------------------------------------ */

function sendViaTelegramCustom_(botToken, chatId, message) {
  const url = "https://api.telegram.org/bot" + botToken + "/sendMessage";
  const res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ chat_id: chatId, text: message }),
    muteHttpExceptions: true
  });
  const body = JSON.parse(res.getContentText());
  if (!body.ok) {
    throw new Error("Telegram send failed: " + res.getContentText());
  }
}

/* ------------------------------------------------------------------ *
 * Auth — same two-property pattern as the digest
 * ------------------------------------------------------------------ */

function getAccessToken_() {
  const p = props_();
  const clientEmail = p.getProperty("SERVICE_ACCOUNT_EMAIL");
  const rawKey = p.getProperty("SERVICE_ACCOUNT_PRIVATE_KEY");
  if (!clientEmail || !rawKey) {
    throw new Error("Missing SERVICE_ACCOUNT_EMAIL or SERVICE_ACCOUNT_PRIVATE_KEY");
  }
  const privateKey = rawKey.replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: clientEmail,
    scope: FIRESTORE_SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  };

  const encode = function (obj) {
    return Utilities.base64EncodeWebSafe(JSON.stringify(obj)).replace(/=+$/, "");
  };
  const unsigned = encode(header) + "." + encode(claimSet);
  const signatureBytes = Utilities.computeRsaSha256Signature(unsigned, privateKey);
  const jwt = unsigned + "." + Utilities.base64EncodeWebSafe(signatureBytes).replace(/=+$/, "");

  const res = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
    method: "post",
    payload: {
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    },
    muteHttpExceptions: true
  });
  const body = JSON.parse(res.getContentText());
  if (!body.access_token) {
    throw new Error("Failed to get Firestore access token: " + res.getContentText());
  }
  return body.access_token;
}