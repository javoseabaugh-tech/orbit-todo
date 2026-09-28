import { useRef, useState } from "react";
import { setDoc } from "firebase/firestore";
import { Upload } from "lucide-react";
import { D, FONT_BODY } from "./tokens";

// STAGING ONLY. Copies the household budget out of a live backup file (the
// orbit-backup-*.json files the Apps Script writes to Drive) into this
// staging project, so the redesign can be tried against real numbers.
//
// It only ever writes the one budget document it was given, and refuses to
// run against the live project even if it were somehow rendered there. The
// vault comes across still encrypted; your usual passphrase unlocks it.

const LIVE_PROJECT = "orbit-cbd4e";
const SOURCE_PATH = "households/seabaugh";

// The backup stores Firestore timestamps as { __ts: iso }; turn them back
// into Dates so they're written as timestamps again.
function revive(v) {
  if (Array.isArray(v)) return v.map(revive);
  if (v && typeof v === "object") {
    if (typeof v.__ts === "string" && Object.keys(v).length === 1) return new Date(v.__ts);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]));
  }
  return v;
}

export default function ImportFromBackup({ budgetRef, onImported }) {
  const inputRef = useRef(null);
  const [pending, setPending] = useState(null); // { data, exportedAt }
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  if (budgetRef?.firestore?.app?.options?.projectId === LIVE_PROJECT) return null;

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMsg("");
    try {
      const backup = JSON.parse(await file.text());
      const data = backup?.extras?.[SOURCE_PATH];
      if (!data) {
        setMsg("That file has no household budget in it. Pick an orbit-backup-….json file from the Orbit backups folder.");
        return;
      }
      setPending({ data: revive(data), exportedAt: backup.exportedAt });
    } catch (err) {
      setMsg("Couldn't read that file. Pick an orbit-backup-….json file.");
    }
  }

  async function confirm() {
    setBusy(true);
    try {
      await setDoc(budgetRef, pending.data);
      setPending(null);
      setMsg("Imported. This is staging only; live wasn't touched.");
      onImported();
    } catch (err) {
      console.error("import error", err);
      setMsg("Import failed: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  const btn = {
    border: "none", borderRadius: 14, padding: "11px 14px", cursor: "pointer", fontFamily: FONT_BODY,
    fontSize: 13.5, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 7,
  };
  const d = pending?.data;

  return (
    <div style={{ marginTop: 6, padding: 14, borderRadius: 18, border: `1.5px dashed ${D.line}`, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: D.amber }}>Staging test tool</div>
      {pending ? (
        <>
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>
            Replace this staging budget with the backup from{" "}
            <b>{pending.exportedAt ? new Date(pending.exportedAt).toLocaleString() : "that file"}</b>?{" "}
            It has {(d.bills || []).length} bills, {(d.accounts || []).length} accounts and {(d.logins || []).length} logins.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ ...btn, background: D.amber, color: D.onAmber }} disabled={busy} onClick={confirm}>
              {busy ? "Importing…" : "Replace staging budget"}
            </button>
            <button style={{ ...btn, background: D.surface, color: D.text }} onClick={() => setPending(null)}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 13, color: D.muted, lineHeight: 1.5 }}>
            Load your real budget from a live backup file to try this screen with real numbers. Only this staging copy changes.
          </div>
          <button style={{ ...btn, background: D.surface, color: D.text, alignSelf: "flex-start" }} onClick={() => inputRef.current?.click()}>
            <Upload size={15} /> Import from backup
          </button>
          <input ref={inputRef} type="file" accept="application/json,.json" onChange={pick} style={{ display: "none" }} />
        </>
      )}
      {msg && <div style={{ fontSize: 13, color: D.muted }}>{msg}</div>}
    </div>
  );
}
