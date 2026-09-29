import { lazy, Suspense, useState } from "react";
import { Check, Repeat, ChevronDown } from "lucide-react";
import Dial from "./Dial";
import { D, FONT_DISPLAY, THEME_ID, faceColor, initials } from "./tokens";

// The Water theme draws its own dial. Loaded only for people using Water, so
// Space users never download it.
const WaterDial = lazy(() => import("../themes/water/WaterDial"));
const WATER = THEME_ID === "water";
import { dateStr, addDays, dayLabel, fmtHM, reminderHM } from "./dates";

// One list (Work or Personal): today's dial on top, then the todos grouped by
// when they're due. Tapping a row opens it in the edit sheet; the circle on
// the left ticks it off.

function sortWithin(items) {
  return [...items].sort((a, b) => {
    const ta = reminderHM(a), tb = reminderHM(b);
    if (ta && tb && ta !== tb) return ta.localeCompare(tb);
    if (ta && !tb) return -1;
    if (!ta && tb) return 1;
    const oa = typeof a.order === "number" ? a.order : Infinity;
    const ob = typeof b.order === "number" ? b.order : Infinity;
    if (oa !== ob) return oa - ob;
    return (a.createdAt?.toMillis?.() ?? Date.now()) - (b.createdAt?.toMillis?.() ?? Date.now());
  });
}

function groupTodos(todos, today) {
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 7);
  const open = todos.filter((t) => !t.done);
  const groups = [
    { key: "overdue", title: "Overdue", tone: "red", items: open.filter((t) => t.due && t.due < today) },
    { key: "today", title: "Today", items: open.filter((t) => t.due === today) },
    { key: "tomorrow", title: "Tomorrow", items: open.filter((t) => t.due === tomorrow) },
    { key: "week", title: "This week", showDate: true, items: open.filter((t) => t.due > tomorrow && t.due <= weekEnd) },
    { key: "later", title: "Later", showDate: true, items: open.filter((t) => t.due > weekEnd) },
    { key: "someday", title: "Someday", items: open.filter((t) => !t.due) },
  ];
  groups.forEach((g) => {
    // Earliest date first; within one date, timed reminders by time, then
    // the saved manual order, then oldest first.
    const byDate = new Map();
    g.items.forEach((t) => {
      const k = t.due || "";
      if (!byDate.has(k)) byDate.set(k, []);
      byDate.get(k).push(t);
    });
    g.items = [...byDate.keys()].sort().flatMap((k) => sortWithin(byDate.get(k)));
  });
  return groups.filter((g) => g.items.length);
}

function Face({ person, size = 24 }) {
  return (
    <span title={person.name} style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center",
      background: faceColor(person.email || person.name), color: D.onAmber,
      fontSize: size * 0.42, fontWeight: 800,
    }}>{initials(person.name)}</span>
  );
}

function TodoRow({ todo, assignee, sharedFrom, showDate, today, onToggle, onOpen }) {
  const hm = reminderHM(todo);
  const overdue = !todo.done && todo.due && todo.due < today;
  const theirs = !!assignee || !!sharedFrom;
  const ring = theirs ? D.amber : D.accent;
  const meta = [];
  if (showDate || overdue) meta.push(dayLabel(todo.due, today));
  if (todo.categoryName && !assignee) meta.push(todo.categoryName);

  return (
    <div style={WATER ? {
      display: "flex", alignItems: "center", gap: 12, padding: "12px 4px 12px 0",
      borderBottom: `1px solid ${D.line}`, textShadow: D.textShadow,
      animation: "rowIn .35s cubic-bezier(.22,1,.36,1) both",
    } : {
      display: "flex", alignItems: "center", gap: 12, padding: "11px 12px 11px 10px", borderRadius: 18,
      background: D.surface, animation: "rowIn .35s cubic-bezier(.22,1,.36,1) both",
    }}>
      <button onClick={() => onToggle(todo)} aria-label={todo.done ? "Mark not done" : "Mark done"} style={{
        width: 30, height: 30, flexShrink: 0, padding: 0, border: "none", background: "transparent",
        display: "grid", placeItems: "center", cursor: "pointer",
      }}>
        <span style={{
          width: 22, height: 22, borderRadius: "50%", display: "grid", placeItems: "center",
          border: `2px solid ${todo.done ? D.green : ring}`, background: todo.done ? D.green : "transparent",
          transition: "background .2s ease, border-color .2s ease",
        }}>
          {todo.done && <Check size={13} strokeWidth={3.2} color={D.bgBottom} style={{ animation: "tick .4s both" }} />}
        </span>
      </button>

      <button onClick={() => onOpen(todo)} style={{
        flex: 1, minWidth: 0, textAlign: "left", border: "none", background: "transparent", padding: 0,
        cursor: "pointer", color: "inherit", display: "flex", flexDirection: "column", gap: 3,
      }}>
        <span style={{
          fontSize: 15, fontWeight: 600, lineHeight: 1.3, color: todo.done ? D.faint : D.text,
          textDecoration: todo.done ? "line-through" : "none", overflowWrap: "anywhere",
        }}>{todo.text}</span>
        {(meta.length > 0 || todo.recurrence || sharedFrom) && (
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: overdue ? D.red : D.muted, flexWrap: "wrap" }}>
            {todo.recurrence && <Repeat size={11} />}
            {sharedFrom && <span style={{ color: D.amber, fontWeight: 700 }}>Shared with you</span>}
            {meta.join(" · ")}
          </span>
        )}
      </button>

      {assignee && <Face person={assignee} />}
      {hm && (
        <span style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 700, color: theirs ? D.amber : D.muted, fontVariantNumeric: "tabular-nums" }}>
          {fmtHM(hm)}
        </span>
      )}
    </div>
  );
}

export default function TodoSection({ todos, assigneeOf, sharedFromOf, onToggle, onOpen, listTail }) {
  const today = dateStr();
  const [showDone, setShowDone] = useState(false);
  const groups = groupTodos(todos, today);
  const todayTodos = todos.filter((t) => t.due === today || (!t.done && t.due && t.due < today));
  const done = todos.filter((t) => t.done).sort((a, b) => (b.due || "").localeCompare(a.due || ""));

  const isAssigned = (t) => !!assigneeOf(t) || !!sharedFromOf(t);
  const list = (
    <div className="orbit-scroll" style={{ flex: 1, minHeight: 0, padding: `${WATER ? 4 : 0}px 16px ${listTail}` }}>
      {!WATER && <Dial todayTodos={todayTodos} isAssigned={isAssigned} onOpen={onOpen} />}

      {groups.length === 0 && (
        <div style={{ textAlign: "center", color: D.muted, fontSize: 14, padding: "18px 8px 8px" }}>
          Nothing open here. Tap + to add something.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {groups.map((g) => (
          <section key={g.key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h2 style={{
              margin: "0 4px", fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 700, letterSpacing: ".06em",
              textTransform: "uppercase", color: g.tone === "red" ? D.red : D.muted,
              display: "flex", justifyContent: "space-between",
            }}>
              <span>{g.title}</span><span style={{ fontWeight: 600 }}>{g.items.length}</span>
            </h2>
            {g.items.map((t) => (
              <TodoRow key={t.id} todo={t} today={today} showDate={g.showDate}
                assignee={assigneeOf(t)} sharedFrom={sharedFromOf(t)} onToggle={onToggle} onOpen={onOpen} />
            ))}
          </section>
        ))}

        {done.length > 0 && (
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={() => setShowDone((v) => !v)} style={{
              border: "none", background: "transparent", padding: "0 4px", cursor: "pointer", color: D.muted,
              fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              Done · {done.length}
              <ChevronDown size={15} style={{ transform: showDone ? "rotate(180deg)" : "none", transition: "transform .2s ease" }} />
            </button>
            {showDone && done.map((t) => (
              <TodoRow key={t.id} todo={t} today={today} showDate
                assignee={assigneeOf(t)} sharedFrom={sharedFromOf(t)} onToggle={onToggle} onOpen={onOpen} />
            ))}
          </section>
        )}
      </div>
    </div>
  );
  if (!WATER) return list;

  // Water: the well stays put and only the list scrolls under it.
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ flexShrink: 0, padding: "0 16px" }}>
        <Suspense fallback={<div style={{ height: 310 }} />}>
          <WaterDial todayTodos={todayTodos} isAssigned={isAssigned} onOpen={onOpen} />
        </Suspense>
      </div>
      {list}
    </div>
  );
}
