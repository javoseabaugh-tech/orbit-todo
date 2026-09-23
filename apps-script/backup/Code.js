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
 * Writes each run into its own dated JSON file inside a Drive folder, so the
 * history survives a bad run. A backup that overwrites itself is only a
 * backup against losing the database — not against a bug, a bad restore, or
 * a silently empty snapshot, each of which would otherwise destroy the last
 * good copy within four hours.
 *
 * Retention keeps every backup from the last 2 days, then the newest one from
 * each day for 30 days. At ~65 KB a file that is a couple of megabytes.
 *
 * A companion restoreFromBackup() function writes the newest of those files
 * back into Firestore if you ever need to recover. Run previewRestore() first
 * — it shows which file would be used and what is in it, without writing.
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
const BACKUP_FOLDER_NAME = "Orbit backups";
const BACKUP_PREFIX = "orbit-backup-";

// The single flat file written by every version of this script before the
// folder existed. Still read as a last resort by restore, never written.
const LEGACY_BACKUP_FILENAME = "orbit-backup.json";

// Keep every backup taken in the last N days...
const KEEP_EVERY_BACKUP_DAYS = 2;
// ...then just the newest one from each day, going back this far.
const KEEP_DAILY_FOR_DAYS = 30;

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
  if (res.getResponseCode() !== 200) {
    throw new Error(`listCollectionIds ${parentPath} failed (${res.getResponseCode()}): ` + res.getContentText());
  }
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
    if (res.getResponseCode() !== 200) {
      throw new Error(`list ${collectionPath} failed (${res.getResponseCode()}): ` + res.getContentText());
    }
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
  const res = UrlFetchApp.fetch(url, {
    method: "patch",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + token },
    payload: JSON.stringify({ fields: objectToFields_(dataObj) }),
    muteHttpExceptions: true,
  });
  // A restore that quietly skipped half the documents is worse than one that
  // stops and says which document it choked on.
  if (res.getResponseCode() >= 300) {
    throw new Error(`Restore write to ${docPath} failed (${res.getResponseCode()}): ` + res.getContentText());
  }
}

// ---------- Backup ----------
function runBackup() {
  const token = getAccessToken_();
  const uid = props_().getProperty("FIREBASE_UID");
  const userPath = `users/${uid}`;

  const collectionIds = listCollectionIds_(token, userPath);
  const collections = {};
  let documentCount = 0;
  collectionIds.forEach((cid) => {
    const docs = listAllDocs_(token, `${userPath}/${cid}`);
    collections[cid] = docs;
    documentCount += docs.length;
  });

  const extras = {};
  const extraPathsRaw = props_().getProperty("EXTRA_PATHS") || "";
  extraPathsRaw.split(",").map((p) => p.trim()).filter(Boolean).forEach((path) => {
    const data = getDoc_(token, path);
    if (data) extras[path] = data;
  });

  // An empty snapshot is never worth keeping. Before the helpers above checked
  // their response codes, an expired key or a wrong uid produced exactly this:
  // a well-formed backup file containing nothing, which then replaced the last
  // good one. Belt and braces — refuse to store it.
  if (!documentCount && !Object.keys(extras).length) {
    throw new Error(
      "Backup aborted: Firestore returned no documents at all. Nothing was written, so the " +
      "existing backups are untouched. Check SERVICE_ACCOUNT_* and FIREBASE_UID."
    );
  }

  const backup = {
    exportedAt: new Date().toISOString(),
    uid: uid,
    collections: collections,
    extras: extras,
  };

  const saved = saveBackup_(JSON.stringify(backup, null, 2));
  Logger.log(
    `Backed up ${documentCount} document(s) across ${collectionIds.length} collection(s) ` +
    `plus ${Object.keys(extras).length} shared document(s) to ${saved.name} (${saved.bytes} bytes).` +
    (saved.trashed.length ? ` Pruned ${saved.trashed.length} old backup(s).` : "")
  );
  return saved;
}

// The folder every dated backup lives in. Passing createIfMissing:false lets
// read-only callers ask "is there one yet?" without making one.
function backupFolder_(createIfMissing) {
  const existing = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  if (existing.hasNext()) return existing.next();
  if (createIfMissing === false) return null;
  return DriveApp.createFolder(BACKUP_FOLDER_NAME);
}

// Every dated backup in the folder, newest first. Anything not matching the
// naming pattern is ignored outright, so nothing else in the folder is ever
// a candidate for pruning.
function backupFiles_(folder) {
  const pattern = /^orbit-backup-(\d{4}-\d{2}-\d{2})-\d{4}\.json$/;
  const out = [];
  const it = folder.getFiles();
  while (it.hasNext()) {
    const file = it.next();
    const m = pattern.exec(file.getName());
    if (!m) continue;
    out.push({ file, name: file.getName(), day: m[1], time: file.getDateCreated().getTime() });
  }
  out.sort((a, b) => b.time - a.time);
  return out;
}

function saveBackup_(jsonText) {
  const folder = backupFolder_();
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd-HHmm");
  const name = `${BACKUP_PREFIX}${stamp}.json`;

  // Write the new one BEFORE pruning the old ones. If createFile throws we
  // still have every backup we had a moment ago, which is the whole point.
  const file = folder.createFile(name, jsonText, MimeType.PLAIN_TEXT);
  const trashed = pruneBackups_(folder, file.getDateCreated().getTime());
  return { name, bytes: jsonText.length, trashed };
}

// Keep everything from the last KEEP_EVERY_BACKUP_DAYS days, then one per day
// back to KEEP_DAILY_FOR_DAYS. Files arrive newest-first, so the first file
// seen for a given day is that day's newest and is the one kept.
function pruneBackups_(folder, nowMs) {
  const keepAllAfter = nowMs - KEEP_EVERY_BACKUP_DAYS * 86400000;
  const keepDailyAfter = nowMs - KEEP_DAILY_FOR_DAYS * 86400000;
  const keptForDay = {};
  const trashed = [];

  backupFiles_(folder).forEach((f) => {
    if (f.time >= keepAllAfter) {
      keptForDay[f.day] = true;
      return;
    }
    if (f.time >= keepDailyAfter && !keptForDay[f.day]) {
      keptForDay[f.day] = true;
      return;
    }
    f.file.setTrashed(true);
    trashed.push(f.name);
  });

  return trashed;
}

// ---------- Restore ----------

// The file a restore would read: newest dated backup, or the pre-folder flat
// file if this script has not run since the folder was introduced.
function latestBackupFile_() {
  const folder = backupFolder_(false);
  if (folder) {
    const files = backupFiles_(folder);
    if (files.length) return files[0].file;
  }
  const legacy = DriveApp.getFilesByName(LEGACY_BACKUP_FILENAME);
  if (legacy.hasNext()) return legacy.next();
  return null;
}

function readBackupFile_(fileId) {
  const file = fileId ? DriveApp.getFileById(fileId) : latestBackupFile_();
  if (!file) {
    throw new Error(`No backup found — no dated files in "${BACKUP_FOLDER_NAME}" and no ${LEGACY_BACKUP_FILENAME}.`);
  }
  return { file, backup: JSON.parse(file.getBlob().getDataAsString()) };
}

// Dry run: which file a restore would use, and what it would write. Touches
// nothing. Run this before restoreFromBackup(), every time.
function previewRestore(fileId) {
  const { file, backup } = readBackupFile_(fileId);
  Logger.log(`Would restore from: ${file.getName()} (${file.getSize()} bytes, taken ${backup.exportedAt})`);
  Logger.log(`Target: users/${props_().getProperty("FIREBASE_UID")}`);
  if (backup.uid && backup.uid !== props_().getProperty("FIREBASE_UID")) {
    Logger.log(`  WARNING: this backup was taken from uid ${backup.uid}, which is NOT the configured FIREBASE_UID.`);
  }
  let total = 0;
  for (const cid in backup.collections) {
    const n = backup.collections[cid].length;
    total += n;
    Logger.log(`  ${cid}: ${n} document(s)`);
  }
  const extras = Object.keys(backup.extras || {});
  extras.forEach((p) => Logger.log(`  extra: ${p}`));
  Logger.log(`${total} document(s) plus ${extras.length} shared document(s) would be written. Nothing was written by this preview.`);
}

// Restores the newest backup, or a specific one if you pass a Drive file id
// (checkBackups() lists them). Overwrites whatever is in Firestore now.
function restoreFromBackup(fileId) {
  const { file, backup } = readBackupFile_(fileId);

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
    " collection(s), plus " + extrasCount + " shared document(s). Source: " + file.getName() +
    ", taken " + backup.exportedAt
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
  const saved = runBackup();
  Logger.log(`Backup complete — "${BACKUP_FOLDER_NAME}" in your Drive now holds ${saved.name}.`);
}

// ---------- Diagnostics ----------

// What backups actually exist, newest first. A backup you have never looked
// at is a backup you do not have — run this now and then.
function checkBackups() {
  const folder = backupFolder_(false);
  if (!folder) {
    Logger.log(`No "${BACKUP_FOLDER_NAME}" folder yet — runBackup() creates it on its next run.`);
  } else {
    const files = backupFiles_(folder);
    Logger.log(`"${BACKUP_FOLDER_NAME}" holds ${files.length} dated backup(s), newest first:`);
    files.forEach((f) => {
      Logger.log(`  ${f.name}  ${f.file.getSize()} bytes  id=${f.file.getId()}`);
    });
    if (files.length) {
      const bytes = files.reduce((sum, f) => sum + f.file.getSize(), 0);
      Logger.log(`  total ${bytes} bytes. Retention: every backup for ${KEEP_EVERY_BACKUP_DAYS} day(s), then daily for ${KEEP_DAILY_FOR_DAYS}.`);
    }
  }

  const legacy = DriveApp.getFilesByName(LEGACY_BACKUP_FILENAME);
  if (legacy.hasNext()) {
    const f = legacy.next();
    Logger.log(`Legacy ${LEGACY_BACKUP_FILENAME} still present (${f.getSize()} bytes, ${f.getDateCreated()}). It is never written or pruned now; delete it once a few dated backups exist.`);
  }

  const triggers = ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === "runBackup");
  Logger.log(triggers.length
    ? `runBackup trigger installed (${triggers.length}).`
    : "NO runBackup TRIGGER — nothing is backing anything up. Run setupBackupTrigger().");
}