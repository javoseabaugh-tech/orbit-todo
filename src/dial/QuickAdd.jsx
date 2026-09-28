import { useEffect, useRef, useState } from "react";
import { X, Trash2, Clock, Calendar, Repeat } from "lucide-react";
import { D, FONT_DISPLAY, FONT_BODY, faceColor, initials } from "./tokens";
import { dateStr, addDays, dayLabel, fmtHM, reminderHM, nowHM } from "./dates";

// The add/edit sheet. One text field, then rows of chips:
//   When   Today · Tomorrow · a date · no date
//   Time   optional; setting one makes it a reminder (Telegram pings then)
//   Repeat none · daily · weekly · monthly
//   Who    Me or anyone you share Work with (owner, Work list only)
//   List   Work · Personal
//
// It sits on the bottom edge and rides up with the on-screen keyboard, so the
// field you're typing in is never hidden behind it.

function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}

const REPEATS = [
  { id: "none", label: "Once" },
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
];

function Chip({ on, onClick, children, tone, style }) {
  const amber = tone === "amber";
  return (
    <button type="button" onClick={onClick} style={{
      position: "relative", display: "inline-flex", alignItems: "center", gap: 6,
      fontFamily: FONT_BODY, fontSize: 13, fontWeight: 700, lineHeight: 1,
      padding: "8px 12px", borderRadius: 999, border: "none", cursor: "pointer",
      background: on ? (amber ? D.amber : D.chipOn) : D.chip,
      color: on ? (amber ? D.onAmber : D.chipOnText) : D.chipText,
      transition: "background .2s ease, color .2s ease",
      ...style,
    }}>
      {children}
    </button>
  );
}

// A chip with a native date/time input stretched invisibly over it, so a tap
// opens the phone's own picker on every browser (showPicker() isn't reliable
// on older iOS).
function PickerChip({ type, value, onChange, on, children }) {
  return (
    <Chip on={on} onClick={() => {}}>
      {children}
      <input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)}
        aria-label={type === "date" ? "Pick a date" : "Pick a time"}
        style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer", border: "none" }} />
    </Chip>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
      <span style={{ width: 62, flexShrink: 0, paddingTop: 9, fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: D.sheetMuted }}>
        {label}
      </span>
      <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 6, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

export default function QuickAdd({ todo, defaultList, people, canAssign, assigneeOf, onSave, onDelete, onClose }) {
  const editing = !!todo;
  const today = dateStr();
  const inputRef = useRef(null);
  const inset = useKeyboardInset();

  const [text, setText] = useState(todo?.text || "");
  const [list, setList] = useState(todo?.list || defaultList || "work");
  const [due, setDue] = useState(editing ? todo.due || "" : today);
  const [time, setTime] = useState(reminderHM(todo) || "");
  const [repeat, setRepeat] = useState(todo?.recurrence?.type || "none");
  const initialWho = editing ? (assigneeOf(todo)?.id || "me") : "me";
  const [who, setWho] = useState(initialWho);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!editing) inputRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const tomorrow = addDays(today, 1);
  const pickedOther = due && due !== today && due !== tomorrow;
  const showWho = canAssign && list === "work" && people.length > 0;
  const ready = text.trim().length > 0;
  // A time with no date lands today, or tomorrow once today's slot has passed.
  const remindDay = due || (time && time <= nowHM() ? tomorrow : today);

  function save() {
    if (!ready) return;
    onSave({
      text: text.trim(),
      list,
      due: due || null,
      time: time || null,
      repeat,
      // Only report a person when the chip actually changed, so saving an
      // edit never rewrites a todo's existing category by accident.
      who: who !== initialWho || !editing ? who : undefined,
    });
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={editing ? "Edit todo" : "New todo"}
      style={{ position: "fixed", inset: 0, zIndex: 80 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: D.scrim, animation: "fadeIn .2s ease" }} />
      <div style={{
        position: "absolute", left: 10, right: 10, bottom: `calc(10px + ${inset}px + env(safe-area-inset-bottom))`,
        maxWidth: 560, margin: "0 auto", background: D.sheet, color: D.sheetText, borderRadius: 28,
        padding: 18, display: "flex", flexDirection: "column", gap: 14,
        boxShadow: "0 30px 80px -30px rgba(0,0,0,.6)", animation: "sheetIn .32s cubic-bezier(.22,1,.36,1)",
        maxHeight: `calc(100dvh - 40px - ${inset}px)`, overflowY: "auto",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <textarea ref={inputRef} value={text} rows={1}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } }}
            placeholder={list === "work" ? "What needs doing at work?" : "What needs doing?"}
            style={{
              flex: 1, border: "none", background: "transparent", resize: "none", padding: "4px 0",
              fontFamily: FONT_BODY, fontSize: 18, fontWeight: 600, lineHeight: 1.35, color: D.sheetText,
              fieldSizing: "content", minHeight: 30, outline: "none",
            }} />
          <button type="button" onClick={onClose} aria-label="Close"
            style={{ border: "none", background: "transparent", color: D.sheetMuted, padding: 4, cursor: "pointer", display: "flex" }}>
            <X size={20} />
          </button>
        </div>

        <Row label="When">
          <Chip on={due === today} onClick={() => setDue(today)}>Today</Chip>
          <Chip on={due === tomorrow} onClick={() => setDue(tomorrow)}>Tomorrow</Chip>
          <PickerChip type="date" value={due} onChange={(v) => setDue(v || "")} on={pickedOther}>
            <Calendar size={13} />{pickedOther ? dayLabel(due, today) : "Date"}
          </PickerChip>
          <Chip on={!due} onClick={() => { setDue(""); }}>Someday</Chip>
        </Row>

        <Row label="Remind">
          <PickerChip type="time" value={time} onChange={setTime} on={!!time}>
            <Clock size={13} />{time ? fmtHM(time) : "Set a time"}
          </PickerChip>
          {time && (
            <Chip onClick={() => setTime("")} style={{ padding: "8px 10px" }} aria-label="Remove time">
              <X size={13} />
            </Chip>
          )}
        </Row>

        <Row label="Repeat">
          {REPEATS.map((r) => (
            <Chip key={r.id} on={repeat === r.id} onClick={() => setRepeat(r.id)}>
              {r.id !== "none" && repeat === r.id && <Repeat size={12} />}{r.label}
            </Chip>
          ))}
          {repeat === "custom" && (
            <Chip on>Every {todo?.recurrence?.intervalDays || 1} days</Chip>
          )}
        </Row>

        {showWho && (
          <Row label="Who">
            <Chip on={who === "me"} onClick={() => setWho("me")}>Me</Chip>
            {people.map((p) => (
              <Chip key={p.id} tone="amber" on={who === p.id} onClick={() => setWho(p.id)}>
                <span style={{
                  width: 18, height: 18, borderRadius: "50%", display: "grid", placeItems: "center",
                  fontSize: 9.5, fontWeight: 800, background: who === p.id ? D.onAmber : faceColor(p.email),
                  color: who === p.id ? D.amber : D.onAmber,
                }}>{initials(p.name)}</span>
                {p.name}
              </Chip>
            ))}
          </Row>
        )}

        <Row label="List">
          <Chip on={list === "work"} onClick={() => setList("work")}>Work</Chip>
          <Chip on={list === "personal"} onClick={() => setList("personal")}>Personal</Chip>
        </Row>

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 2 }}>
          {editing && onDelete && (
            confirmDelete ? (
              <button type="button" onClick={onDelete} style={{
                border: "none", borderRadius: 16, padding: "13px 16px", cursor: "pointer",
                background: D.red, color: "#fff", fontFamily: FONT_BODY, fontWeight: 700, fontSize: 14,
              }}>Delete it</button>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} aria-label="Delete" style={{
                border: "none", borderRadius: 16, padding: 13, cursor: "pointer", display: "flex",
                background: D.chip, color: D.red,
              }}><Trash2 size={18} /></button>
            )
          )}
          <button type="button" onClick={save} disabled={!ready} style={{
            flex: 1, border: "none", borderRadius: 16, padding: "14px 16px", cursor: ready ? "pointer" : "default",
            background: ready ? D.chipOn : D.chip, color: ready ? D.chipOnText : D.chipText,
            fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15, opacity: ready ? 1 : 0.7,
          }}>
            {editing ? "Save" : time ? `Add reminder · ${dayLabel(remindDay, today)} ${fmtHM(time)}` : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
