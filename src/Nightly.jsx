import { useEffect, useRef, useState } from "react";
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc,
} from "firebase/firestore";
import { Plus, Trash2, Check, ChevronLeft, Calendar, X } from "lucide-react";
import { db } from "./firebase";

// This screen is intentionally dark regardless of the system theme — it's the
// night screen. Kept as one exported object so the weekly moon tracker can
// import the same values instead of redefining them.
export const NIGHT = {
  bg: "#1a1216",
  surface: "#241c20",
  border: "#332a2f",
  borderStrong: "#4f4247",
  textBright: "#f0e6da",
  text: "#e8ddd2",
  textMuted: "#8f7f74",
  textFaint: "#6e6058",
  gold: "#c39d66",
  goldDim: "#3a2f24",
  moonDark: "#2a2118",
};

// Local calendar date. NOT toISOString().slice(0,10) — that returns the UTC
// date, which has already rolled to tomorrow during our evening. Same bug that
// broke time-sensitive reminders.
export function localDateString(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function prettyDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric",
  });
}

function shortDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// progress 0..1 — the lit part waxes from new moon to full.
export function Moon({ size = 78, progress = 0, id = "moon" }) {
  const c = size / 2;
  const r = size * 0.385;
  const shift = progress * 2 * r;
  const reduce = typeof window !== "undefined" && window.matchMedia
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
      aria-label={`Moon, ${Math.round(progress * 100)} percent lit`}>
      <defs>
        <clipPath id={`clip-${id}`}>
          <circle cx={c} cy={c} r={r} />
        </clipPath>
      </defs>
      <g clipPath={`url(#clip-${id})`}>
        <circle cx={c} cy={c} r={r} fill={NIGHT.moonDark} />
        <circle cx={c} cy={c} r={r} fill={NIGHT.gold} />
        <circle
          cx={c - shift}
          cy={c}
          r={r}
          fill={NIGHT.moonDark}
          style={reduce ? undefined : { transition: "cx 700ms ease" }}
        />
      </g>
    </svg>
  );
}

export default function Nightly({ uid, onBack }) {
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState("");
  const [draftDate, setDraftDate] = useState("");
  const [today, setToday] = useState(localDateString());
  const [loaded, setLoaded] = useState(false);
  const dateRef = useRef(null);

  // Keep "today" honest if the app sits open across midnight, or is resumed
  // from a frozen iOS standalone instance.
  useEffect(() => {
    const refresh = () => setToday(localDateString());
    document.addEventListener("visibilitychange", refresh);
    const id = setInterval(refresh, 60000);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const q = query(collection(db, "users", uid, "nightly"), orderBy("createdAt", "asc"));
    return onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoaded(true);
    });
  }, [uid]);

  // One snapshot, split in memory. No composite indexes, and the queue below
  // costs nothing extra.
  const tonight = items.filter((it) => (it.forDate || today) === today);
  const upcoming = items
    .filter((it) => (it.forDate || today) > today)
    .sort((a, b) => a.forDate.localeCompare(b.forDate));

  const doneCount = tonight.filter((it) => it.done).length;
  const progress = tonight.length ? doneCount / tonight.length : 0;
  const allDone = tonight.length > 0 && doneCount === tonight.length;

  async function addItem() {
    const text = draft.trim();
    if (!text) return;
    const forDate = draftDate || today;
    setDraft("");
    setDraftDate("");
    await addDoc(collection(db, "users", uid, "nightly"), {
      text,
      done: false,
      forDate,
      rolledOver: false,
      templateId: null,
      createdAt: serverTimestamp(),
    });
  }

  async function toggleDone(item) {
    await updateDoc(doc(db, "users", uid, "nightly", item.id), { done: !item.done });
  }

  async function removeItem(id) {
    await deleteDoc(doc(db, "users", uid, "nightly", id));
  }

  const row = {
    display: "flex", alignItems: "center", gap: 12, padding: "12px 2px",
    borderBottom: `0.5px solid ${NIGHT.border}`,
  };

  function Item({ item, muted }) {
    return (
      <div style={row}>
        <button
          onClick={() => toggleDone(item)}
          title={item.done ? "Mark not done" : "Mark done"}
          style={{
            width: 20, height: 20, minWidth: 20, borderRadius: 10,
            border: `1.5px solid ${item.done ? NIGHT.gold : NIGHT.borderStrong}`,
            background: item.done ? NIGHT.gold : "transparent",
            color: NIGHT.bg,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", padding: 0,
          }}
        >
          {item.done && <Check size={12} strokeWidth={3} />}
        </button>

        <span style={{
          flex: 1, fontSize: 15,
          color: item.done ? NIGHT.textFaint : (muted ? NIGHT.textMuted : NIGHT.text),
          textDecoration: item.done ? "line-through" : "none",
        }}>
          {item.text}
        </span>

        {muted && (
          <span style={{ fontSize: 12, color: NIGHT.textFaint }}>{shortDate(item.forDate)}</span>
        )}

        <button
          onClick={() => removeItem(item.id)}
          title="Remove"
          style={{ color: NIGHT.textFaint, cursor: "pointer", display: "flex", padding: 0 }}
        >
          <Trash2 size={15} />
        </button>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: NIGHT.bg,
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "22px 20px 40px" }}>

        <button
          onClick={onBack}
          title="Back"
          style={{
            display: "flex", alignItems: "center", gap: 3, marginBottom: 20,
            color: NIGHT.textMuted, fontSize: 14, cursor: "pointer", padding: 0,
          }}
        >
          <ChevronLeft size={16} /> Back
        </button>

        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <Moon progress={progress} id="tonight" />
        </div>

        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <div style={{
            fontFamily: "'Fraunces', Georgia, serif", fontSize: 23, fontWeight: 600,
            color: NIGHT.textBright,
          }}>
            Tonight's focus
          </div>
          <div style={{ fontSize: 13, marginTop: 4, color: allDone ? NIGHT.gold : NIGHT.textMuted }}>
            {allDone
              ? "That's everything. Sleep well."
              : `${prettyDate(today)}${tonight.length ? ` · ${doneCount} of ${tonight.length}` : ""}`}
          </div>
        </div>

        {loaded && tonight.length === 0 && (
          <div style={{
            textAlign: "center", color: NIGHT.textMuted, fontSize: 14,
            padding: "26px 10px", borderTop: `0.5px solid ${NIGHT.border}`,
            borderBottom: `0.5px solid ${NIGHT.border}`,
          }}>
            Nothing set for tonight. Add the first thing below.
          </div>
        )}

        {tonight.length > 0 && (
          <div style={{ borderTop: `0.5px solid ${NIGHT.border}` }}>
            {tonight.map((item) => <Item key={item.id} item={item} />)}
          </div>
        )}

        {upcoming.length > 0 && (
          <div style={{ marginTop: 30 }}>
            <div style={{
              fontSize: 11, letterSpacing: "0.09em", textTransform: "uppercase",
              color: NIGHT.textFaint, marginBottom: 8,
            }}>
              Coming up
            </div>
            <div style={{ borderTop: `0.5px solid ${NIGHT.border}` }}>
              {upcoming.map((item) => <Item key={item.id} item={item} muted />)}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 26, alignItems: "center" }}>
          <div style={{ flex: 1, position: "relative" }}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
              placeholder="What matters tonight?"
              style={{
                width: "100%",
                background: NIGHT.surface,
                border: `0.5px solid ${NIGHT.border}`,
                borderRadius: 10,
                padding: "11px 40px 11px 14px",
                fontSize: 15,
                color: NIGHT.text,
                outline: "none",
              }}
            />
            <input
              ref={dateRef}
              type="date"
              value={draftDate}
              min={today}
              onChange={(e) => setDraftDate(e.target.value)}
              onClick={(e) => {
                if (typeof e.currentTarget.showPicker === "function") e.currentTarget.showPicker();
              }}
              style={{
                position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)",
                width: 34, height: 34, opacity: 0, border: "none", padding: 0,
                cursor: "pointer", zIndex: 2,
              }}
            />
            <button
              title="Schedule for a later night"
              style={{
                position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                color: draftDate ? NIGHT.gold : NIGHT.textFaint,
                display: "flex", padding: 4,
                pointerEvents: "none",
              }}
            >
              <Calendar size={16} />
            </button>
          </div>

          <button
            onClick={addItem}
            title="Add"
            style={{
              width: 42, height: 42, minWidth: 42, borderRadius: 10,
              background: draft.trim() ? NIGHT.gold : NIGHT.goldDim,
              color: draft.trim() ? NIGHT.bg : NIGHT.textFaint,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: draft.trim() ? "pointer" : "default", padding: 0,
            }}
          >
            <Plus size={20} />
          </button>
        </div>

        {draftDate && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6, marginTop: 10,
            fontSize: 12, color: NIGHT.gold,
          }}>
            Scheduled for {shortDate(draftDate)}
            <button
              onClick={() => setDraftDate("")}
              title="Clear date"
              style={{ color: NIGHT.textFaint, cursor: "pointer", display: "flex", padding: 0 }}
            >
              <X size={13} />
            </button>
          </div>
        )}

      </div>
    </div>
  );
}