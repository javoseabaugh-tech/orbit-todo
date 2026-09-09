// Orbit notifications — daily digest + time-sensitive reminders, for every
// person in the `access` list who has connected their own Telegram bot.
//
// Routing: `access/{email}` supplies the uid (self-registered by the app on
// sign-in) and `notifyConfig/{email}` supplies that person's own bot token and
// chat ID (written by the in-app Telegram wizard). A person is notifiable only
// when both halves exist — everyone else is skipped silently. Run
// checkRecipients() to see exactly who that resolves to.
//
// Free-quota notes (consumer Google account: 20k UrlFetch calls/day, 90 min of
// trigger runtime/day). The reminder trigger is the only thing that runs often,
// so it is built to cost one HTTP call on a quiet run:
//   - the Firestore token is cached for 50 min, so 288 runs need ~29 token
//     fetches instead of 288
//   - reminders use ONE collection-group query across every user's todos, so
//     the cost does not grow with the number of people
//   - the routing table (access + notifyConfig) is only fetched on runs that
//     actually have a reminder to deliver
// A normal day lands near 400 calls and ~10 min of runtime. See README.

const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore";
const GEMINI_MODEL = "gemini-3.5-flash";

// Reminders whose time slipped past by more than this are marked as notified
// without sending, so an outage doesn't dump a backlog of stale pings at once.
const MAX_LATE_MINUTES = 180;

function props_() {
  return PropertiesService.getScriptProperties();
}

// ---------- Firestore plumbing ----------

function getAccessToken_() {
  // Cached because the reminder trigger runs every 5 minutes and a token is
  // good for an hour — without this, minting tokens alone would be 288 of the
  // day's HTTP calls.
  const cache = CacheService.getScriptCache();
  const cached = cache.get("orbit_fs_token");
  if (cached) return cached;

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
  // 50 min, comfortably inside the token's own 60 min lifetime.
  cache.put("orbit_fs_token", body.access_token, 3000);
  return body.access_token;
}

function rootUrl_() {
  const projectId = props_().getProperty("FIREBASE_PROJECT_ID");
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

function userBaseUrl_(uid) {
  return `${rootUrl_()}/users/${uid}`;
}

function fetchJson_(url, options) {
  const res = UrlFetchApp.fetch(url, options);
  if (res.getResponseCode() >= 300) {
    throw new Error(`Firestore ${res.getResponseCode()}: ${res.getContentText()}`);
  }
  return JSON.parse(res.getContentText());
}

// One user's subcollection, e.g. users/{uid}/todos.
function runQuery_(token, uid, collectionId, filters) {
  const rows = fetchJson_(`${userBaseUrl_(uid)}:runQuery`, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + token },
    payload: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where: { compositeFilter: { op: "AND", filters } },
      },
    }),
    muteHttpExceptions: true,
  });
  return (rows || []).filter((r) => r.document).map((r) => docToObject_(r.document));
}

// The same subcollection across EVERY user in one request. This is what keeps
// the 5-minute reminder trigger flat-cost no matter how many people are in the
// app. Requires the COLLECTION_GROUP index in firestore.indexes.json.
function runCollectionGroupQuery_(token, collectionId, filters) {
  const rows = fetchJson_(`${rootUrl_()}:runQuery`, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + token },
    payload: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId, allDescendants: true }],
        where: { compositeFilter: { op: "AND", filters } },
      },
    }),
    muteHttpExceptions: true,
  });
  return (rows || []).filter((r) => r.document).map((r) => docToObject_(r.document));
}

function listCollection_(token, uid, collectionId) {
  const body = fetchJson_(`${userBaseUrl_(uid)}/${collectionId}`, {
    method: "get",
    headers: { Authorization: "Bearer " + token },
    muteHttpExceptions: true,
  });
  return (body.documents || []).map(docToObject_);
}

// A top-level collection (access, notifyConfig) rather than a per-user one.
function listRootCollection_(token, collectionId) {
  const body = fetchJson_(`${rootUrl_()}/${collectionId}?pageSize=300`, {
    method: "get",
    headers: { Authorization: "Bearer " + token },
    muteHttpExceptions: true,
  });
  return (body.documents || []).map(docToObject_);
}

// PATCH one field on one document by its full resource name, leaving every
// other field alone. Taking the path (rather than a uid + id) is what lets this
// write to any user's todo from a collection-group result.
function patchBooleanFieldByPath_(token, docPath, fieldPath, value) {
  const res = UrlFetchApp.fetch(
    `https://firestore.googleapis.com/v1/${docPath}?updateMask.fieldPaths=${fieldPath}`,
    {
      method: "patch",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + token },
      payload: JSON.stringify({ fields: { [fieldPath]: { booleanValue: value } } }),
      muteHttpExceptions: true,
    }
  );
  if (res.getResponseCode() >= 300) {
    throw new Error(`Firestore patch failed (${res.getResponseCode()}): ` + res.getContentText());
  }
}

function docToObject_(doc) {
  // _path is kept because collection-group results are the only way to know
  // which user a document belongs to.
  const out = { id: doc.name.split("/").pop(), _path: doc.name };
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

// ".../documents/users/{uid}/todos/{id}" -> "{uid}"
function uidFromPath_(path) {
  const m = /\/documents\/users\/([^/]+)\//.exec(path || "");
  return m ? m[1] : null;
}

function eqFilter_(field, value) {
  const valueObj = typeof value === "boolean" ? { booleanValue: value } : { stringValue: value };
  return { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: valueObj } };
}

function lteFilter_(field, value) {
  return { fieldFilter: { field: { fieldPath: field }, op: "LESS_THAN_OR_EQUAL", value: { stringValue: value } } };
}

// ---------- Who gets notified ----------

// Best-effort first name. `access.name` wins if you ever add it; the owner
// falls back to the USER_NAME script property; otherwise it's derived from the
// email so a new person still gets addressed by something human.
function displayName_(accessDoc, email, isOwner) {
  if (accessDoc.name) return accessDoc.name;
  if (isOwner) {
    const configured = props_().getProperty("USER_NAME");
    if (configured) return configured;
  }
  const local = String(email).split("@")[0].replace(/[._\-+].*$/, "").replace(/\d+/g, "");
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "there";
}

function recipients_(token) {
  const ownerUid = props_().getProperty("FIREBASE_UID");
  const access = listRootCollection_(token, "access");
  const configs = listRootCollection_(token, "notifyConfig");

  // notifyConfig doc IDs come from the signed-in email as Firebase reports it,
  // while access doc IDs are lower-cased by the app — so join case-insensitively.
  const configByEmail = {};
  configs.forEach((c) => { configByEmail[String(c.id).toLowerCase()] = c; });

  const out = [];
  access.forEach((a) => {
    const email = String(a.email || a.id).toLowerCase();
    // No uid means they've never signed in, so there's no users/{uid} data to read.
    if (!a.uid) return;

    const cfg = configByEmail[email] || {};
    const isOwner = a.uid === ownerUid;
    let botToken = cfg.telegramBotToken;
    let chatId = cfg.telegramChatId;

    // The owner predates the per-person wizard and may have no notifyConfig doc
    // at all. Falling back to the script properties that have been delivering
    // his digest all along means going multi-user can't knock him offline.
    if (isOwner && (!botToken || !chatId)) {
      botToken = props_().getProperty("TELEGRAM_BOT_TOKEN");
      chatId = props_().getProperty("TELEGRAM_CHAT_ID");
    }
    if (!botToken || !chatId) return;

    out.push({
      email,
      uid: a.uid,
      role: a.role || "unknown",
      isOwner,
      botToken,
      chatId,
      name: displayName_(a, email, isOwner),
      // Star swears in the owner's digest by his own choice. That was never a
      // decision anyone else opted into, so everybody else gets the same warmth
      // without the profanity. Set `starProfanity: true` on someone's access doc
      // to turn it on for them (or false on the owner's to turn it off).
      profanity: a.starProfanity !== undefined && a.starProfanity !== null
        ? a.starProfanity === true
        : isOwner,
    });
  });
  return out;
}

// ---------- Telegram ----------

function sendTelegram_(botToken, chatId, message) {
  const res = UrlFetchApp.fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
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

// ---------- Daily digest ----------

function todayString_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function gatherDueToday_(token, uid) {
  const today = todayString_();

  const todosDue = runQuery_(token, uid, "todos", [eqFilter_("due", today), eqFilter_("done", false)]);
  const thoughtsDue = runQuery_(token, uid, "thoughts", [eqFilter_("due", today), eqFilter_("done", false)]);
  const people = listCollection_(token, uid, "people");
  const personName = (id) => (people.find((p) => p.id === id) || {}).name;

  const lines = [];
  todosDue.forEach((t) => lines.push(`- [${t.list === "work" ? "Work" : "Personal"}] ${t.text}`));
  thoughtsDue.forEach((t) => {
    const who = personName(t.personId);
    lines.push(`- [Thought${who ? " → " + who : ""}] ${t.text}`);
  });

  return { today, lines, count: lines.length };
}

function composeStarMessage_(today, lines, name, profanity) {
  const apiKey = props_().getProperty("GEMINI_API_KEY");
  const weekday = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "EEEE");
  const itemsBlock = lines.length ? lines.join("\n") : "(nothing due today)";

  const voice = profanity
    ? `You are Star, a funny, foul-mouthed personal assistant with a sharp sense of humor.`
    : `You are Star, a funny, warm personal assistant with a sharp sense of humor.`;
  const toneRule = profanity
    ? `- Swear freely for comedic effect — real curse words are fair game, including "fuck", "fucking", "shit", "ass", "damn", "hell", "badass", etc. Drop an F-bomb when it genuinely makes the line funnier. Don't force one into every sentence — land it where it hits — but don't hold back either. Keep it good-natured, hyping ${name} up, never mean-spirited toward them. Hard limits: absolutely no slurs, and nothing hateful, bigoted, or sexual.`
    : `- Be genuinely funny and a little cheeky, but keep it clean — no profanity. Keep it good-natured, hyping ${name} up, never mean-spirited toward them. Hard limits: absolutely no slurs, and nothing hateful, bigoted, or sexual.`;

  const prompt = `${voice} Write a short, warm, hilarious message to start ${name}'s day. This message is private — it only ever goes to ${name}.

Today's date: ${today} (${weekday})

Items due today:
${itemsBlock}

Instructions:
- Start with exactly: "Good morning ${name}, this is Star."
- Since there is at least one item due today: include one short, fun trivia fact loosely inspired by the topic of one of the items above (just one sentence, keep it light), then give a friendly, concise summary of what's due today.
${toneRule}
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

function sendDailyDigest() {
  const token = getAccessToken_();
  const people = recipients_(token);
  let sent = 0;

  people.forEach((r) => {
    // One person's broken bot token or empty day must not stop everyone else's
    // digest, so each recipient is isolated.
    try {
      const { today, lines, count } = gatherDueToday_(token, r.uid);
      if (count === 0) return;
      sendTelegram_(r.botToken, r.chatId, composeStarMessage_(today, lines, r.name, r.profanity));
      sent++;
    } catch (err) {
      Logger.log(`Digest failed for ${r.email}: ${err.message}`);
    }
  });

  Logger.log(`Digest run: ${people.length} recipient(s), ${sent} sent.`);
  return { recipients: people.length, sent };
}

// ---------- Time-sensitive reminders ----------
//
// A todo becomes time-sensitive when the app writes `timeSensitive: true`,
// `notifyAt: "YYYY-MM-DDTHH:MM:SS"` and `notified: false` (see setTimeSensitive
// in src/App.jsx). notifyAt is a local wall-clock string with no timezone in
// it, so every comparison here uses the script's own timezone — one shared
// timezone for everyone. checkTriggers() prints which one is in use.
//
// The filters mirror the COLLECTION_GROUP index in firestore.indexes.json
// exactly: notified (ASC), timeSensitive (ASC), notifyAt (ASC).

function localNowString_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
}

// "2026-09-09T14:30:00" -> minutes it sits behind `now`, or 0 if unparseable.
function minutesLate_(notifyAt, now) {
  const parsed = new Date(String(notifyAt).replace(" ", "T"));
  if (isNaN(parsed.getTime())) return 0;
  return Math.round((now.getTime() - parsed.getTime()) / 60000);
}

// "2026-09-09T14:30:00" -> "2:30pm"
function formatClock_(notifyAt) {
  const hhmm = String(notifyAt).slice(11, 16).split(":");
  const h = parseInt(hhmm[0], 10);
  const m = hhmm[1] || "00";
  if (isNaN(h)) return notifyAt;
  return `${h % 12 || 12}:${m}${h >= 12 ? "pm" : "am"}`;
}

function gatherDueReminders_(token) {
  const due = runCollectionGroupQuery_(token, "todos", [
    eqFilter_("notified", false),
    eqFilter_("timeSensitive", true),
    lteFilter_("notifyAt", localNowString_()),
  ]);
  // `done` is filtered here rather than in the query so the deployed index
  // keeps working — a fourth field would need a new one, and the result set at
  // any given minute is tiny.
  return due.filter((t) => t.done !== true && t.notifyAt && uidFromPath_(t._path));
}

function reminderMessage_(todo) {
  const list = todo.list === "work" ? "Work" : "Personal";
  return `⏰ ${formatClock_(todo.notifyAt)} — [${list}] ${todo.text}`;
}

function sendTimeSensitiveReminders() {
  const token = getAccessToken_();
  const todos = gatherDueReminders_(token);
  // The overwhelming majority of runs find nothing. Returning here keeps a
  // quiet run at a single HTTP call and never touches the routing table.
  if (!todos.length) return { due: 0, sent: 0, skipped: 0 };

  const byUid = {};
  recipients_(token).forEach((r) => { byUid[r.uid] = r; });

  const now = new Date();
  let sent = 0;
  let skipped = 0;

  todos.forEach((todo) => {
    // Each reminder is isolated: one bad token, one deleted doc, or one
    // Telegram hiccup must not stop the rest of the batch from going out.
    try {
      if (minutesLate_(todo.notifyAt, now) > MAX_LATE_MINUTES) {
        patchBooleanFieldByPath_(token, todo._path, "notified", true);
        skipped++;
        return;
      }
      const r = byUid[uidFromPath_(todo._path)];
      if (!r) {
        // Owner of this todo hasn't connected Telegram. Deliberately NOT marked
        // as notified — if they connect within the stale window they still get
        // it, and if they don't, the stale branch above clears it later.
        Logger.log(`No Telegram recipient for uid ${uidFromPath_(todo._path)} — "${todo.text}" left pending.`);
        return;
      }
      // Send first, mark second. If the send succeeds but the mark fails, the
      // reminder repeats next run — visible and fixable. Marking first would
      // turn the same failure into a silent drop, which is exactly the failure
      // mode this whole function exists to avoid.
      sendTelegram_(r.botToken, r.chatId, reminderMessage_(todo));
      patchBooleanFieldByPath_(token, todo._path, "notified", true);
      sent++;
    } catch (err) {
      Logger.log(`Reminder failed for "${todo.text}" (${todo.id}): ${err.message}`);
    }
  });

  Logger.log(`Time-sensitive run: ${todos.length} due, ${sent} sent, ${skipped} stale.`);
  return { due: todos.length, sent, skipped };
}

// ---------- Triggers ----------

function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === "sendDailyDigest") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("sendDailyDigest").timeBased().everyDays(1).atHour(6).create();
}

function setupTimeSensitiveTrigger() {
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === "sendTimeSensitiveReminders") ScriptApp.deleteTrigger(t);
  });
  // 5 minutes, not 1: at ~2s per run, every-minute would spend roughly half the
  // 90 min/day trigger budget on empty checks and leave little for the digest.
  ScriptApp.newTrigger("sendTimeSensitiveReminders").timeBased().everyMinutes(5).create();
}

// Installs every trigger this project needs. Safe to re-run — each setup
// function clears its own handler's triggers first, so nothing duplicates.
function setupAllTriggers() {
  setupDailyTrigger();
  setupTimeSensitiveTrigger();
  checkTriggers();
}

// ---------- Diagnostics ----------

// Run this whenever notifications go quiet. A missing handler here is the whole
// answer — a deleted trigger leaves the code in place and simply never runs it.
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

// Who would actually receive anything, and why someone is being skipped.
// Never logs bot tokens.
function checkRecipients() {
  const token = getAccessToken_();
  const ownerUid = props_().getProperty("FIREBASE_UID");
  const access = listRootCollection_(token, "access");
  const configs = listRootCollection_(token, "notifyConfig");
  const configByEmail = {};
  configs.forEach((c) => { configByEmail[String(c.id).toLowerCase()] = c; });

  Logger.log(`${access.length} person/people in the access list:`);
  access.forEach((a) => {
    const email = String(a.email || a.id).toLowerCase();
    const cfg = configByEmail[email] || {};
    const isOwner = a.uid === ownerUid;
    const hasBot = !!(cfg.telegramBotToken && cfg.telegramChatId) ||
      (isOwner && !!props_().getProperty("TELEGRAM_BOT_TOKEN"));
    let verdict;
    if (!a.uid) verdict = "SKIPPED — never signed in (no uid on access doc)";
    else if (!hasBot) verdict = "SKIPPED — hasn't connected Telegram in the app";
    else verdict = "will be notified";
    Logger.log(`  ${email} [${a.role || "?"}]${isOwner ? " (owner)" : ""} — ${verdict}`);
  });

  const live = recipients_(token);
  Logger.log(`\n${live.length} recipient(s) active: ${live.map((r) => `${r.name} <${r.email}>${r.profanity ? " [Star swears]" : ""}`).join(", ") || "none"}`);
}

// Dry run: shows what sendTimeSensitiveReminders would do, across all users,
// without sending anything or marking anything as notified.
function previewTimeSensitive() {
  const token = getAccessToken_();
  const todos = gatherDueReminders_(token);
  const byUid = {};
  recipients_(token).forEach((r) => { byUid[r.uid] = r; });
  const now = new Date();

  Logger.log(`Local now: ${localNowString_()} — ${todos.length} reminder(s) currently due across all users.`);
  todos.forEach((t) => {
    const uid = uidFromPath_(t._path);
    const r = byUid[uid];
    const late = minutesLate_(t.notifyAt, now);
    let verdict;
    if (late > MAX_LATE_MINUTES) verdict = `STALE (${late} min late, would be silently marked read)`;
    else if (!r) verdict = `NO RECIPIENT for uid ${uid} — would stay pending`;
    else verdict = `would send to ${r.name} <${r.email}> (${late} min late)`;
    Logger.log(`${reminderMessage_(t)} — ${verdict}`);
  });
}

// Sends the owner a digest right now, whether or not anything is due.
function testSendNow() {
  const token = getAccessToken_();
  const owner = recipients_(token).filter((r) => r.isOwner)[0];
  if (!owner) throw new Error("No owner recipient resolved — run checkRecipients().");
  const { today, lines } = gatherDueToday_(token, owner.uid);
  const itemLines = lines.length ? lines : ["- [Test] Nothing was actually due — this is a manual test send"];
  sendTelegram_(owner.botToken, owner.chatId, composeStarMessage_(today, itemLines, owner.name, owner.profanity));
}
