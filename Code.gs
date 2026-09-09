const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore";
const GEMINI_MODEL = "gemini-3.5-flash";

function props_() {
  return PropertiesService.getScriptProperties();
}

function getAccessToken_() {
  const p = props_();
  const clientEmail = p.getProperty("SERVICE_ACCOUNT_EMAIL");
  const privateKey = p.getProperty("SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n");

  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claimSet = {
    iss: clientEmail,
    scope: FIRESTORE_SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const encode = (obj) => Utilities.base64EncodeWebSafe(JSON.stringify(obj)).replace(/=+$/, "");
  const unsigned = `${encode(header)}.${encode(claimSet)}`;
  const signatureBytes = Utilities.computeRsaSha256Signature(unsigned, privateKey);
  const signature = Utilities.base64EncodeWebSafe(signatureBytes).replace(/=+$/, "");
  const jwt = `${unsigned}.${signature}`;

  const res = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
    method: "post",
    payload: {
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    },
    muteHttpExceptions: true,
  });
  const body = JSON.parse(res.getContentText());
  if (!body.access_token) {
    throw new Error("Failed to get Firestore access token: " + res.getContentText());
  }
  return body.access_token;
}

function firestoreBaseUrl_() {
  const projectId = props_().getProperty("FIREBASE_PROJECT_ID");
  const uid = props_().getProperty("FIREBASE_UID");
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}`;
}

function runQuery_(token, collectionId, filters) {
  const url = `${firestoreBaseUrl_()}:runQuery`;
  const structuredQuery = {
    from: [{ collectionId }],
    where: { compositeFilter: { op: "AND", filters } },
  };
  const res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + token },
    payload: JSON.stringify({ structuredQuery }),
    muteHttpExceptions: true,
  });
  const rows = JSON.parse(res.getContentText());
  return (rows || []).filter((r) => r.document).map((r) => docToObject_(r.document));
}

function listCollection_(token, collectionId) {
  const url = `${firestoreBaseUrl_()}/${collectionId}`;
  const res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { Authorization: "Bearer " + token },
    muteHttpExceptions: true,
  });
  const body = JSON.parse(res.getContentText());
  return (body.documents || []).map(docToObject_);
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
  return null;
}

function eqFilter_(field, value) {
  const valueObj = typeof value === "boolean" ? { booleanValue: value } : { stringValue: value };
  return { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: valueObj } };
}

function lteFilter_(field, value) {
  return { fieldFilter: { field: { fieldPath: field }, op: "LESS_THAN_OR_EQUAL", value: { stringValue: value } } };
}

// PATCH a single field on one document, leaving every other field alone.
// updateMask is what keeps this from blanking the rest of the todo.
function patchBooleanField_(token, collectionId, docId, fieldPath, value) {
  const url = `${firestoreBaseUrl_()}/${collectionId}/${docId}?updateMask.fieldPaths=${fieldPath}`;
  const res = UrlFetchApp.fetch(url, {
    method: "patch",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + token },
    payload: JSON.stringify({ fields: { [fieldPath]: { booleanValue: value } } }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) {
    throw new Error(`Firestore patch failed (${res.getResponseCode()}): ` + res.getContentText());
  }
}

function todayString_() {
  const tz = Session.getScriptTimeZone();
  return Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
}

function gatherDueToday_() {
  const token = getAccessToken_();
  const today = todayString_();

  const todosDue = runQuery_(token, "todos", [eqFilter_("due", today), eqFilter_("done", false)]);
  const thoughtsDue = runQuery_(token, "thoughts", [eqFilter_("due", today), eqFilter_("done", false)]);
  const people = listCollection_(token, "people");
  const personName = (id) => (people.find((p) => p.id === id) || {}).name;

  const lines = [];
  todosDue.forEach((t) => lines.push(`- [${t.list === "work" ? "Work" : "Personal"}] ${t.text}`));
  thoughtsDue.forEach((t) => {
    const who = personName(t.personId);
    lines.push(`- [Thought${who ? " → " + who : ""}] ${t.text}`);
  });

  return { today, lines, count: lines.length };
}

function composeStarMessage_(today, lines) {
  const apiKey = props_().getProperty("GEMINI_API_KEY");
  const name = props_().getProperty("USER_NAME") || "there";
  const weekday = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "EEEE");
  const itemsBlock = lines.length ? lines.join("\n") : "(nothing due today)";

  const prompt = `You are Star, a funny, foul-mouthed personal assistant with a sharp sense of humor. Write a short, warm, hilarious message to start ${name}'s day. This message is private — it only ever goes to ${name} — so you can be as blunt and profane as it takes to be funny.

Today's date: ${today} (${weekday})

Items due today:
${itemsBlock}

Instructions:
- Start with exactly: "Good morning ${name}, this is Star."
- Since there is at least one item due today: include one short, fun trivia fact loosely inspired by the topic of one of the items above (just one sentence, keep it light), then give a friendly, concise summary of what's due today.
- Swear freely for comedic effect — real curse words are fair game, including "fuck", "fucking", "shit", "ass", "damn", "hell", "badass", etc. Drop an F-bomb when it genuinely makes the line funnier. Don't force one into every sentence — land it where it hits — but don't hold back either. Keep it good-natured, hyping ${name} up, never mean-spirited toward them. Hard limits: absolutely no slurs, and nothing hateful, bigoted, or sexual.
- Keep the whole message casual and warm, a few sentences. No markdown formatting, no hashtags, at most one emoji.`;

  const res = UrlFetchApp.fetch(
    `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      muteHttpExceptions: true,
    }
  );
  const data = JSON.parse(res.getContentText());
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no message: " + res.getContentText());
  return text.trim();
}

function sendViaTelegram_(message) {
  const botToken = props_().getProperty("TELEGRAM_BOT_TOKEN");
  const chatId = props_().getProperty("TELEGRAM_CHAT_ID");

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ chat_id: chatId, text: message }),
    muteHttpExceptions: true,
  });
  const body = JSON.parse(res.getContentText());
  if (!body.ok) {
    throw new Error("Telegram send failed: " + res.getContentText());
  }
}

function sendDailyDigest() {
  const { today, lines, count } = gatherDueToday_();
  if (count === 0) return;
  const message = composeStarMessage_(today, lines);
  sendViaTelegram_(message);
}

function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === "sendDailyDigest") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("sendDailyDigest").timeBased().everyDays(1).atHour(6).create();
}

// ---------- Time-sensitive reminders ----------
//
// A todo becomes time-sensitive when the app writes `timeSensitive: true`,
// `notifyAt: "YYYY-MM-DDTHH:MM:SS"` and `notified: false` (see
// setTimeSensitive in src/App.jsx). notifyAt is a local wall-clock string
// with no timezone in it, so every comparison here is done against the
// script's own timezone — if the Apps Script project's timezone drifts away
// from the phone's, reminders fire at the wrong moment. checkTriggers()
// prints the timezone it is using so this is easy to verify.
//
// The query mirrors the composite index in firestore.indexes.json exactly:
// notified (ASC), timeSensitive (ASC), notifyAt (ASC). Changing the filters
// here without updating that index will make the query fail.

// Reminders whose time slipped past by more than this are marked as notified
// without sending, so an outage doesn't dump a pile of stale pings at once.
// Raise it if you'd rather get very late reminders than none.
const MAX_LATE_MINUTES = 180;

function localNowString_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
}

// "2026-09-09T14:30:00" -> minutes it sits behind `now`, or 0 if unparseable.
function minutesLate_(notifyAt, now) {
  const parsed = new Date(notifyAt.replace(" ", "T"));
  if (isNaN(parsed.getTime())) return 0;
  return Math.round((now.getTime() - parsed.getTime()) / 60000);
}

// "2026-09-09T14:30:00" -> "2:30pm"
function formatClock_(notifyAt) {
  const hhmm = notifyAt.slice(11, 16).split(":");
  const h = parseInt(hhmm[0], 10);
  const m = hhmm[1] || "00";
  if (isNaN(h)) return notifyAt;
  return `${h % 12 || 12}:${m}${h >= 12 ? "pm" : "am"}`;
}

function gatherDueReminders_(token) {
  const nowStr = localNowString_();
  const due = runQuery_(token, "todos", [
    eqFilter_("notified", false),
    eqFilter_("timeSensitive", true),
    lteFilter_("notifyAt", nowStr),
  ]);
  // `done` is filtered here rather than in the query so the existing
  // composite index keeps working — a fourth field would need a new one,
  // and the result set at any given minute is tiny.
  return due.filter((t) => t.done !== true && t.notifyAt);
}

function reminderMessage_(todo) {
  const list = todo.list === "work" ? "Work" : "Personal";
  return `⏰ ${formatClock_(todo.notifyAt)} — [${list}] ${todo.text}`;
}

function sendTimeSensitiveReminders() {
  const token = getAccessToken_();
  const todos = gatherDueReminders_(token);
  const now = new Date();
  let sent = 0;
  let skipped = 0;

  todos.forEach((todo) => {
    // Each reminder is isolated: one bad token, one deleted doc, or one
    // Telegram hiccup must not stop the rest of the batch from going out.
    try {
      const late = minutesLate_(todo.notifyAt, now);
      if (late > MAX_LATE_MINUTES) {
        patchBooleanField_(token, "todos", todo.id, "notified", true);
        skipped++;
        Logger.log(`Skipped stale reminder (${late} min late): ${todo.text}`);
        return;
      }
      // Send first, mark second. If the send succeeds but the mark fails,
      // the reminder repeats next run — visible and fixable. Marking first
      // would turn the same failure into a silent drop, which is exactly
      // the failure mode this whole function exists to avoid.
      sendViaTelegram_(reminderMessage_(todo));
      patchBooleanField_(token, "todos", todo.id, "notified", true);
      sent++;
    } catch (err) {
      Logger.log(`Reminder failed for "${todo.text}" (${todo.id}): ${err.message}`);
    }
  });

  Logger.log(`Time-sensitive run: ${todos.length} due, ${sent} sent, ${skipped} stale.`);
  return { due: todos.length, sent, skipped };
}

function setupTimeSensitiveTrigger() {
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === "sendTimeSensitiveReminders") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("sendTimeSensitiveReminders").timeBased().everyMinutes(5).create();
}

// Installs every trigger this project needs. Safe to re-run — each setup
// function clears its own handler's triggers first, so nothing duplicates.
function setupAllTriggers() {
  setupDailyTrigger();
  setupTimeSensitiveTrigger();
  checkTriggers();
}

// Diagnostic: prints what is actually installed right now. Run this whenever
// notifications go quiet — a missing handler here is the whole answer.
function checkTriggers() {
  Logger.log("Script timezone: " + Session.getScriptTimeZone());
  Logger.log("Local now: " + localNowString_());
  const triggers = ScriptApp.getProjectTriggers();
  if (!triggers.length) {
    Logger.log("NO TRIGGERS INSTALLED — run setupAllTriggers().");
    return;
  }
  triggers.forEach((t) => Logger.log(`trigger: ${t.getHandlerFunction()} (${t.getEventType()})`));
  const handlers = triggers.map((t) => t.getHandlerFunction());
  ["sendDailyDigest", "sendTimeSensitiveReminders"].forEach((fn) => {
    if (handlers.indexOf(fn) === -1) Logger.log(`MISSING: ${fn} has no trigger.`);
  });
}

// Dry run: shows what sendTimeSensitiveReminders would do without sending
// anything or marking anything as notified. Run this first after installing.
function previewTimeSensitive() {
  const todos = gatherDueReminders_(getAccessToken_());
  const now = new Date();
  Logger.log(`Local now: ${localNowString_()} — ${todos.length} reminder(s) currently due.`);
  todos.forEach((t) => {
    const late = minutesLate_(t.notifyAt, now);
    const verdict = late > MAX_LATE_MINUTES ? `STALE (${late} min late, would be silently marked read)` : `would send (${late} min late)`;
    Logger.log(`${reminderMessage_(t)} — ${verdict}`);
  });
}

function testSendNow() {
  const { today, lines } = gatherDueToday_();
  const itemLines = lines.length ? lines : ["- [Test] Nothing was actually due — this is a manual test send"];
  const message = composeStarMessage_(today, itemLines);
  sendViaTelegram_(message);
}
function debugToken() {
  const t = props_().getProperty("TELEGRAM_BOT_TOKEN");
  Logger.log("length: " + t.length);
  Logger.log("start: " + t.slice(0, 15));
  Logger.log("end: " + t.slice(-10));
}
