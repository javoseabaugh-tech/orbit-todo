import { useEffect, useRef, useState } from "react";
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query,
  serverTimestamp, setDoc, updateDoc,
} from "firebase/firestore";
import { Plus, Trash2, Check, ChevronLeft, Calendar, X, Repeat } from "lucide-react";
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

function parts(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { y, m, d };
}

function prettyDate(dateStr) {
  const { y, m, d } = parts(dateStr);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric",
  });
}

function shortDate(dateStr) {
  const { y, m, d } = parts(dateStr);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function weekdayName(dateStr) {
  const { y, m, d } = parts(dateStr);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long" });
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Date.UTC rather than local Date math — a DST boundary in between would
// otherwise make this off by one and quietly shift every custom interval.
function daysBetween(aStr, bStr) {
  const a = parts(aStr);
  const b = parts(bStr);
  return Math.round(
    (Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000
  );
}

// Does this template fire on the given night? Templates regenerate on every
// matching night regardless of whether the last one was completed — a skipped
// night reads as a missed night, it doesn't break the chain or roll forward.
export function templateMatches(tpl, dateStr) {
  const start = tpl.startDate || dateStr;
  if (dateStr < start) return false;
  const rec = tpl.recurrence || { type: "daily" };

  if (rec.type === "daily") return true;

  if (rec.type === "weekly") {
    const t = parts(dateStr);
    const s = parts(start);
    return new Date(t.y, t.m - 1, t.d).getDay() === new Date(s.y, s.m - 1, s.d).getDay();
  }

  if (rec.type === "monthly") {
    const t = parts(dateStr);
    const s = parts(start);
    // new Date(y, m, 0) is the last day of month m. Clamps the 31st onto the
    // 30th/28th rather than silently skipping short months entirely.
    const lastDay = new Date(t.y, t.m, 0).getDate();
    return t.d === Math.min(s.d, lastDay);
  }

  if (rec.type === "custom") {
    const n = Number(rec.intervalDays) || 1;
    return daysBetween(start, dateStr) % n === 0;
  }

  return false;
}

export function repeatLabel(tpl) {
  const rec = tpl.recurrence || {};
  if (rec.type === "daily") return "Every night";
  if (rec.type === "weekly") return `Every ${weekdayName(tpl.startDate)}`;
  if (rec.type === "monthly") return `Monthly, ${ordinal(parts(tpl.startDate).d)}`;
  if (rec.type === "custom") return `Every ${Number(rec.intervalDays) || 1} days`;
  return "Repeating";
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

const REPEAT_OPTIONS = [
  { key: null, label: "Once" },
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "custom", label: "Every N days" },
];

export default function Nightly({ uid, onBack }) {
  const [items, setItems] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [draft, setDraft] = useState("");
  const [draftDate, setDraftDate] = useState("");
  const [repeat, setRepeat] = useState(null);
  const [intervalDays, setIntervalDays] = useState("2");
  const [showRepeat, setShowRepeat] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [today, setToday] = useState(localDateString());
  const [loaded, setLoaded] = useState(false);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const taRef = useRef(null);
  const genRef = useRef(false);
  const rollRef = useRef(false);

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

  useEffect(() => {
    const q = query(collection(db, "users", uid, "nightlyTemplates"), orderBy("createdAt", "asc"));
    return onSnapshot(q, (snap) => {
      setTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setTemplatesLoaded(true);
    });
  }, [uid]);

  // Auto-grow the add field as you type, up to a cap. Reset to "auto" first or
  // scrollHeight only ever reports the already-grown height and never shrinks.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  // Materialise tonight's recurring items. Doc IDs are deterministic
  // (`${templateId}_${date}`) so this is idempotent — running it twice, on two
  // devices, or after a remount can't produce duplicates. Deleting a generated
  // item leaves a skipped:true tombstone behind at that same ID, which is what
  // stops it from immediately reappearing.
  useEffect(() => {
    if (!loaded || !templatesLoaded || genRef.current) return;
    const missing = templates.filter(
      (t) => templateMatches(t, today) && !items.some((it) => it.id === `${t.id}_${today}`)
    );
    if (!missing.length) return;

    genRef.current = true;
    (async () => {
      try {
        for (const tpl of missing) {
          await setDoc(doc(db, "users", uid, "nightly", `${tpl.id}_${today}`), {
            text: tpl.text,
            done: false,
            forDate: today,
            rolledOver: false,
            skipped: false,
            templateId: tpl.id,
            createdAt: serverTimestamp(),
          });
        }
      } catch (e) {
        console.error("Nightly: template generation failed", e);
      } finally {
        genRef.current = false;
      }
    })();
  }, [loaded, templatesLoaded, templates, items, today, uid]);

  // Rollover. Unfinished ONE-OFFS from earlier nights move to tonight and get
  // flagged so the row can pulse. Recurring items are deliberately excluded —
  // a template regenerates on its own schedule, so rolling a missed one forward
  // would double it up tonight and turn a missed night into a growing pile.
  // Also excluded: anything already done, and skipped tombstones.
  useEffect(() => {
    if (!loaded || rollRef.current) return;
    const stale = items.filter(
      (it) =>
        !it.done &&
        !it.skipped &&
        !it.templateId &&
        (it.forDate || today) < today
    );
    if (!stale.length) return;

    rollRef.current = true;
    (async () => {
      try {
        for (const it of stale) {
          await updateDoc(doc(db, "users", uid, "nightly", it.id), {
            forDate: today,
            rolledOver: true,
            // Kept so a later moon tracker can still tell which night this was
            // first meant for. Written once and never overwritten on a re-roll.
            firstDate: it.firstDate || it.forDate || today,
          });
        }
      } catch (e) {
        console.error("Nightly: rollover failed", e);
      } finally {
        rollRef.current = false;
      }
    })();
  }, [loaded, items, today, uid]);

  // One snapshot, split in memory. No composite indexes, and the queue below
  // costs nothing extra.
  const visible = items.filter((it) => !it.skipped);
  const tonight = visible.filter((it) => (it.forDate || today) === today);
  const upcoming = visible
    .filter((it) => (it.forDate || today) > today)
    .sort((a, b) => a.forDate.localeCompare(b.forDate));

  const doneCount = tonight.filter((it) => it.done).length;
  const progress = tonight.length ? doneCount / tonight.length : 0;
  const allDone = tonight.length > 0 && doneCount === tonight.length;
  const carriedCount = tonight.filter((it) => it.rolledOver && !it.done).length;

  const activeRepeat = REPEAT_OPTIONS.find((o) => o.key === repeat) || REPEAT_OPTIONS[0];

  async function addItem() {
    const text = draft.trim();
    if (!text) return;
    const startDate = draftDate || today;

    setDraft("");
    setDraftDate("");
    setRepeat(null);
    setShowRepeat(false);

    if (repeat) {
      // Branch rather than always setting intervalDays — passing undefined for
      // non-custom types is what Firestore rejected in the main app.
      const recurrence = repeat === "custom"
        ? { type: "custom", intervalDays: Number(intervalDays) || 1 }
        : { type: repeat };

      await addDoc(collection(db, "users", uid, "nightlyTemplates"), {
        text,
        recurrence,
        startDate,
        createdAt: serverTimestamp(),
      });
      // The generation effect picks it up from the snapshot and creates
      // tonight's instance if it matches — nothing to do here.
      return;
    }

    await addDoc(collection(db, "users", uid, "nightly"), {
      text,
      done: false,
      forDate: startDate,
      rolledOver: false,
      skipped: false,
      templateId: null,
      createdAt: serverTimestamp(),
    });
  }

  async function toggleDone(item) {
    await updateDoc(doc(db, "users", uid, "nightly", item.id), { done: !item.done });
  }

  // A generated item can't just be deleted — the template would recreate it on
  // the next open. Tombstone it instead; the template itself is untouched, so
  // it comes back tomorrow as normal.
  async function removeItem(item) {
    if (item.templateId) {
      await updateDoc(doc(db, "users", uid, "nightly", item.id), { skipped: true, done: false });
      return;
    }
    await deleteDoc(doc(db, "users", uid, "nightly", item.id));
  }

  // Deleting a template stops future nights only. Anything already generated
  // stays put — it's a real item for a real night at that point.
  async function removeTemplate(id) {
    await deleteDoc(doc(db, "users", uid, "nightlyTemplates", id));
  }

  // alignItems flex-start so a wrapped multi-line entry keeps its checkbox and
  // trash icon on the first line instead of floating to the vertical middle.
  const row = {
    display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 2px",
    borderBottom: `0.5px solid ${NIGHT.border}`,
  };

  const pill = (on) => ({
    display: "flex", alignItems: "center", gap: 6,
    padding: "6px 11px", borderRadius: 999,
    border: `0.5px solid ${on ? NIGHT.gold : NIGHT.border}`,
    background: on ? NIGHT.goldDim : "transparent",
    color: on ? NIGHT.gold : NIGHT.textMuted,
    fontSize: 12.5, fontFamily: "inherit", cursor: "pointer",
  });

  function Item({ item, muted }) {
    const carried = item.rolledOver && !item.done;
    return (
      <div style={row}>
        <button
          onClick={() => toggleDone(item)}
          title={item.done ? "Mark not done" : "Mark done"}
          style={{
            width: 20, height: 20, minWidth: 20, borderRadius: 10, marginTop: 1,
            border: `1.5px solid ${item.done ? NIGHT.gold : NIGHT.borderStrong}`,
            background: item.done ? NIGHT.gold : "transparent",
            color: NIGHT.bg,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", padding: 0, flexShrink: 0,
          }}
        >
          {item.done && <Check size={12} strokeWidth={3} />}
        </button>

        <span style={{
          flex: 1, minWidth: 0, fontSize: 15, lineHeight: 1.45,
          whiteSpace: "pre-wrap", overflowWrap: "anywhere",
          color: item.done ? NIGHT.textFaint : (muted ? NIGHT.textMuted : NIGHT.text),
          textDecoration: item.done ? "line-through" : "none",
        }}>
          {item.text}
          {item.templateId && (
            <Repeat
              size={12}
              style={{
                display: "inline", verticalAlign: "middle", marginLeft: 7,
                color: item.done ? NIGHT.textFaint : NIGHT.textMuted,
              }}
            />
          )}
        </span>

        {carried && (
          <span
            className="orbit-nightly-pulse"
            title={`Carried over from ${shortDate(item.firstDate || today)}`}
            aria-label="Carried over from an earlier night"
            style={{
              width: 6, height: 6, borderRadius: 3, background: NIGHT.gold,
              flexShrink: 0, marginTop: 8,
            }}
          />
        )}

        {muted && (
          <span style={{
            fontSize: 12, color: NIGHT.textFaint, whiteSpace: "nowrap",
            flexShrink: 0, marginTop: 2,
          }}>
            {shortDate(item.forDate)}
          </span>
        )}

        <button
          onClick={() => removeItem(item)}
          title={item.templateId ? "Skip tonight" : "Remove"}
          style={{
            color: NIGHT.textFaint, cursor: "pointer", display: "flex",
            padding: 0, flexShrink: 0, marginTop: 2,
          }}
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
      {/* Scoped here rather than index.css so the module stays self-contained. */}
      <style>{`
        @keyframes orbitNightlyPulse {
          0%, 100% { opacity: .28; transform: scale(.8); }
          50%      { opacity: .95; transform: scale(1); }
        }
        .orbit-nightly-pulse {
          animation: orbitNightlyPulse 2.8s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .orbit-nightly-pulse { animation: none; opacity: .8; }
        }
      `}</style>

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
          {carriedCount > 0 && !allDone && (
            <div style={{ fontSize: 12, marginTop: 5, color: NIGHT.textFaint }}>
              {carriedCount === 1
                ? "1 thing carried over from an earlier night"
                : `${carriedCount} things carried over from earlier nights`}
            </div>
          )}
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

        {/* alignItems flex-end keeps the + button pinned to the bottom of the
            field as the textarea grows upward. */}
        <div style={{ display: "flex", gap: 8, marginTop: 26, alignItems: "flex-end" }}>
          <textarea
            ref={taRef}
            value={draft}
            rows={1}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                addItem();
              }
            }}
            placeholder={repeat ? "What repeats each night?" : "What matters tonight?"}
            style={{
              flex: 1,
              minWidth: 0,
              background: NIGHT.surface,
              border: `0.5px solid ${NIGHT.border}`,
              borderRadius: 10,
              padding: "11px 14px",
              fontSize: 15,
              lineHeight: 1.4,
              fontFamily: "inherit",
              color: NIGHT.text,
              outline: "none",
              resize: "none",
              overflowY: "auto",
              maxHeight: 160,
              display: "block",
            }}
          />

          <button
            onClick={addItem}
            title="Add"
            style={{
              width: 42, height: 42, minWidth: 42, borderRadius: 10,
              background: draft.trim() ? NIGHT.gold : NIGHT.goldDim,
              color: draft.trim() ? NIGHT.bg : NIGHT.textFaint,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: draft.trim() ? "pointer" : "default", padding: 0,
              flexShrink: 0,
            }}
          >
            <Plus size={20} />
          </button>
        </div>

        {/* Date + repeat controls. The native date input sits invisibly on top
            of its pill rather than being hidden — showPicker() on a
            display:none input is unreliable in iOS Safari. */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <div style={{ position: "relative", display: "inline-flex" }}>
            <button title="Pick a night" style={pill(!!draftDate)}>
              <Calendar size={14} />
              {draftDate
                ? `${repeat ? "Starts" : "Scheduled for"} ${shortDate(draftDate)}`
                : "Tonight"}
            </button>
            <input
              type="date"
              value={draftDate}
              min={today}
              aria-label="Pick a night"
              onChange={(e) => setDraftDate(e.target.value)}
              onClick={(e) => {
                if (typeof e.currentTarget.showPicker === "function") e.currentTarget.showPicker();
              }}
              style={{
                position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
                opacity: 0, border: "none", padding: 0, cursor: "pointer", zIndex: 2,
              }}
            />
          </div>

          <button
            onClick={() => setShowRepeat((v) => !v)}
            title="Repeat"
            style={pill(!!repeat)}
          >
            <Repeat size={14} />
            {activeRepeat.label}
            {repeat === "custom" ? ` (${Number(intervalDays) || 1})` : ""}
          </button>

          {draftDate && (
            <button
              onClick={() => setDraftDate("")}
              title="Clear date"
              style={{
                display: "flex", alignItems: "center", gap: 4,
                color: NIGHT.textFaint, fontSize: 12, cursor: "pointer", padding: 0,
              }}
            >
              <X size={13} /> Clear
            </button>
          )}
        </div>

        {showRepeat && (
          <div style={{
            display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10,
            padding: "12px", borderRadius: 10,
            background: NIGHT.surface, border: `0.5px solid ${NIGHT.border}`,
          }}>
            {REPEAT_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                onClick={() => setRepeat(opt.key)}
                style={pill(repeat === opt.key)}
              >
                {opt.label}
              </button>
            ))}

            {repeat === "custom" && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "100%", marginTop: 4, color: NIGHT.textMuted, fontSize: 13,
              }}>
                Every
                <input
                  // Held as a string so it can be transiently empty while
                  // typing. Coerced once at save time instead — clamping on
                  // every keystroke is what made "30" come out as "130".
                  value={intervalDays}
                  inputMode="numeric"
                  onChange={(e) => setIntervalDays(e.target.value.replace(/[^0-9]/g, ""))}
                  style={{
                    width: 56, background: NIGHT.bg, color: NIGHT.text,
                    border: `0.5px solid ${NIGHT.borderStrong}`, borderRadius: 8,
                    padding: "6px 9px", fontSize: 14, fontFamily: "inherit", outline: "none",
                  }}
                />
                nights, starting {shortDate(draftDate || today)}
              </div>
            )}

            <div style={{ width: "100%", fontSize: 11.5, color: NIGHT.textFaint, marginTop: 2 }}>
              Repeating items come back every matching night on their own. A missed
              night stays missed — it won't pile up on tomorrow.
            </div>
          </div>
        )}

        {templates.length > 0 && (
          <div style={{ marginTop: 30 }}>
            <button
              onClick={() => setShowTemplates((v) => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: 0,
                fontSize: 11, letterSpacing: "0.09em", textTransform: "uppercase",
                color: NIGHT.textFaint, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <Repeat size={12} />
              Repeating · {templates.length}
            </button>

            {showTemplates && (
              <div style={{ marginTop: 8, borderTop: `0.5px solid ${NIGHT.border}` }}>
                {templates.map((tpl) => (
                  <div key={tpl.id} style={row}>
                    <span style={{
                      flex: 1, minWidth: 0, fontSize: 14, lineHeight: 1.45,
                      whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: NIGHT.textMuted,
                    }}>
                      {tpl.text}
                      <span style={{ display: "block", fontSize: 11.5, color: NIGHT.textFaint, marginTop: 2 }}>
                        {repeatLabel(tpl)}
                      </span>
                    </span>
                    <button
                      onClick={() => removeTemplate(tpl.id)}
                      title="Stop repeating"
                      style={{
                        color: NIGHT.textFaint, cursor: "pointer", display: "flex",
                        padding: 0, flexShrink: 0, marginTop: 2,
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}