const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore";
const GEMINI_MODEL = "gemini-1.5-flash";

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

  const prompt = `You are Star, a friendly, witty personal assistant. Write a short, warm, funny message to start ${name}'s day.

Today's date: ${today} (${weekday})

Items due today:
${itemsBlock}

Instructions:
- Start with exactly: "Good morning ${name}, this is Star."
- Since there is at least one item due today: include one short, fun trivia fact loosely inspired by the topic of one of the items above (just one sentence, keep it light), then give a friendly, concise summary of what's due today.
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
