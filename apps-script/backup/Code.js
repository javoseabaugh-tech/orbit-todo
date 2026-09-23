/**
 * Orbit — Automatic Data Backup
 * ---------------------------------------------------------------
 * Runs every 4 hours (free, via Apps Script). Reads EVERY subcollection
 * under your Firestore user data automatically — it discovers them by
 * name rather than having them hardcoded, so todos/thoughts/categories/
 * people today, and Workbench/Camping/Nighttime Routine data whenever
 * those exist, all get backed up without ever needing to edit this
 * script again.
 *
 * Writes it all into ONE JSON file in your Google Drive, overwriting the
 * previous backup each run — so your Drive never fills up with old
 * copies, only the latest snapshot ever exists.
 *
 * A companion restoreFromBackup() function writes that file back into
 * Firestore if you ever need to recover.
 *
 * ONE-TIME SETUP — see README.md for full steps.
 * Script Properties needed (reuse the same values from your Telegram
 * digest script's properties — no need to generate a new service account):
 *   FIREBASE_PROJECT_ID          e.g. orbit-cbd4e
 *   FIREBASE_UID                 your Firebase user id
 *   SERVICE_ACCOUNT_EMAIL        from your service account JSON
 *   SERVICE_ACCOUNT_PRIVATE_KEY  from your service account JSON
 *   EXTRA_PATHS                  (optional) comma-separated extra
 *                                 top-level document paths to include,
 *                                 e.g. "households/seabaugh"
 * Then run setupBackupTrigger() once to schedule it every 4 hours.
 */

const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore";
const BACKUP_FILENAME = "orbit-backup.json";

function props_() {
  return PropertiesService.getScriptProperties();
}

// ---------- Auth: exchange service-account JWT for a Firestore access token ----------
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
  if (!body.access_token) throw new Error("Failed to get Firestore access token: " + res.getContentText());
  return body.access_token;
}

function firestoreDocsRoot_() {
  const projectId = props_().getProperty("FIREBASE_PROJECT_ID");
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

// ---------- Field conversion: Firestore's typed format <-> plain JS values ----------
function fieldToValue_(v) {
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.integerValue !== undefined) return parseInt(v.integerValue, 10);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.nullValue !== undefined) return null;
  if (v.timestampValue !== undefined) return { __ts: v.timestampValue };
  if (v.mapValue !== undefined) return docFieldsToObject_(v.mapValue.fields || {});
  if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(fieldToValue_);
  return null;
}

function docFieldsToObject_(fields) {
  const out = {};
  for (const key in fields) out[key] = fieldToValue_(fields[key]);
  return out;
}

function valueToField_(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "object" && v.__ts) return { timestampValue: v.__ts };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(valueToField_) } };
  if (typeof v === "object") return { mapValue: { fields: objectToFields_(v) } };
  return { stringValue: String(v) };
}

function objectToFields_(obj) {
  const fields = {};
  for (const key in obj) fields[key] = valueToField_(obj[key]);
  return fields;
}

// ---------- Firestore REST helpers ----------
function listCollectionIds_(token, parentPath) {
  const url = `${firestoreDocsRoot_()}/${parentPath}:listCollectionIds`;
  const res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + token },
    payload: JSON.stringify({ pageSize: 300 }),
    muteHttpExceptions: true,
  });
  const body = JSON.parse(res.getContentText());
  return body.collectionIds || [];
}

function listAllDocs_(token, collectionPath) {
  let docs = [];
  let pageToken = null;
  do {
    const url = `${firestoreDocsRoot_()}/${collectionPath}?pageSize=300${pageToken ? "&pageToken=" + pageToken : ""}`;
    const res = UrlFetchApp.fetch(url, {
      method: "get",
      headers: { Authorization: "Bearer " + token },
      muteHttpExceptions: true,
    });
    const body = JSON.parse(res.getContentText());
    (body.documents || []).forEach((doc) => {
      docs.push({ id: doc.name.split("/").pop(), fields: docFieldsToObject_(doc.fields || {}) });
    });
    pageToken = body.nextPageToken || null;
  } while (pageToken);
  return docs;
}

function getDoc_(token, docPath) {
  const url = `${firestoreDocsRoot_()}/${docPath}`;
  const res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { Authorization: "Bearer " + token },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) return null;
  const doc = JSON.parse(res.getContentText());
  return docFieldsToObject_(doc.fields || {});
}

function setDoc_(token, docPath, dataObj) {
  const url = `${firestoreDocsRoot_()}/${docPath}`;
  UrlFetchApp.fetch(url, {
    method: "patch",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + token },
    payload: JSON.stringify({ fields: objectToFields_(dataObj) }),
    muteHttpExceptions: true,
  });
}

// ---------- Backup ----------
function runBackup() {
  const token = getAccessToken_();
  const uid = props_().getProperty("FIREBASE_UID");
  const userPath = `users/${uid}`;

  const collectionIds = listCollectionIds_(token, userPath);
  const collections = {};
  collectionIds.forEach((cid) => {
    collections[cid] = listAllDocs_(token, `${userPath}/${cid}`);
  });

  const extras = {};
  const extraPathsRaw = props_().getProperty("EXTRA_PATHS") || "";
  extraPathsRaw.split(",").map((p) => p.trim()).filter(Boolean).forEach((path) => {
    const data = getDoc_(token, path);
    if (data) extras[path] = data;
  });

  const backup = {
    exportedAt: new Date().toISOString(),
    uid: uid,
    collections: collections,
    extras: extras,
  };

  saveToDrive_(JSON.stringify(backup, null, 2));
}

function saveToDrive_(jsonText) {
  const existing = DriveApp.getFilesByName(BACKUP_FILENAME);
  while (existing.hasNext()) {
    existing.next().setTrashed(true);
  }
  DriveApp.createFile(BACKUP_FILENAME, jsonText, MimeType.PLAIN_TEXT);
}

// ---------- Restore ----------
function restoreFromBackup() {
  const files = DriveApp.getFilesByName(BACKUP_FILENAME);
  if (!files.hasNext()) throw new Error("No backup file found named " + BACKUP_FILENAME);
  const backup = JSON.parse(files.next().getBlob().getDataAsString());

  const token = getAccessToken_();
  const uid = props_().getProperty("FIREBASE_UID");
  const userPath = `users/${uid}`;

  let restoredCount = 0;
  for (const cid in backup.collections) {
    backup.collections[cid].forEach((doc) => {
      setDoc_(token, `${userPath}/${cid}/${doc.id}`, doc.fields);
      restoredCount++;
    });
  }

  let extrasCount = 0;
  for (const path in backup.extras) {
    setDoc_(token, path, backup.extras[path]);
    extrasCount++;
  }

  Logger.log(
    "Restored " + restoredCount + " document(s) across " + Object.keys(backup.collections).length +
    " collection(s), plus " + extrasCount + " shared document(s). Backup was taken: " + backup.exportedAt
  );
}

// ---------- Trigger setup ----------
function setupBackupTrigger() {
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === "runBackup") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("runBackup").timeBased().everyHours(4).create();
}

// Handy for testing without waiting for the trigger — run this manually.
function testBackupNow() {
  runBackup();
  Logger.log("Backup complete — check your Google Drive for a file named " + BACKUP_FILENAME);
}