import { D, FONT_DISPLAY } from "./tokens";
import { reminderHM, nowHM } from "./dates";

// Today as a 12-hour clock face. Each of today's timed reminders is a planet
// on the ring at its hour; the arc is how much of today is done; a small white
// moon marks the current time. The centre says how many of today's todos are
// still open, timed or not.
//
// Morning and afternoon share the face, like a real clock. Planets for a time
// that has already passed are dimmed so 9am and 9pm can't be confused for long.

const SIZE = 210;
const C = SIZE / 2;
const R = 86;

function point(minutes, radius = R) {
  const angle = ((minutes % 720) / 720) * 2 * Math.PI - Math.PI / 2;
  return [C + radius * Math.cos(angle), C + radius * Math.sin(angle)];
}

function toMinutes(hm) {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

export default function Dial({ todayTodos, isAssigned, onOpen }) {
  const total = todayTodos.length;
  const done = todayTodos.filter((t) => t.done).length;
  const open = total - done;
  const progress = total ? done / total : 0;
  const circumference = 2 * Math.PI * R;
  const nowMin = toMinutes(nowHM());
  const [mx, my] = point(nowMin);

  const planets = todayTodos
    .filter((t) => !t.done && reminderHM(t))
    .map((t) => ({ todo: t, min: toMinutes(reminderHM(t)) }));

  return (
    <div style={{ position: "relative", width: SIZE, height: SIZE, margin: "4px auto 10px", flexShrink: 0 }}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img"
        aria-label={total ? `${open} of ${total} left today` : "Nothing due today"}>
        <circle cx={C} cy={C} r={R} fill="none" stroke={D.line} strokeWidth="2" />
        {[0, 180, 360, 540].map((m) => {
          const [x1, y1] = point(m, R - 7);
          const [x2, y2] = point(m, R - 1);
          return <line key={m} x1={x1} y1={y1} x2={x2} y2={y2} stroke={D.faint} strokeWidth="2" strokeLinecap="round" />;
        })}
        {progress > 0 && (
          <circle cx={C} cy={C} r={R} fill="none" stroke={D.accent} strokeWidth="4" strokeLinecap="round"
            strokeDasharray={`${circumference * progress} ${circumference}`} transform={`rotate(-90 ${C} ${C})`}
            style={{ transition: "stroke-dasharray .6s cubic-bezier(.22,1,.36,1)" }} />
        )}
        <circle cx={mx} cy={my} r="3.5" fill={D.text} />
      </svg>

      {planets.map(({ todo, min }) => {
        const [x, y] = point(min);
        const past = min < nowMin;
        const color = isAssigned(todo) ? D.amber : D.accent2;
        return (
          <button key={todo.id} onClick={() => onOpen(todo)} title={todo.text}
            style={{
              position: "absolute", left: x - 11, top: y - 11, width: 22, height: 22, padding: 0,
              border: "none", background: "transparent", cursor: "pointer", display: "grid", placeItems: "center",
            }}>
            <span style={{
              width: 14, height: 14, borderRadius: "50%", background: color, opacity: past ? 0.45 : 1,
              boxShadow: past ? "none" : `0 0 0 4px ${D.bgBottom}, 0 0 14px ${color}`,
            }} />
          </button>
        );
      })}

      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none", textAlign: "center" }}>
        <div>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 40, lineHeight: 1, color: D.text }}>
            {total ? open : "0"}
          </div>
          <div style={{ fontSize: 12, color: D.muted, marginTop: 4 }}>
            {!total ? "nothing today" : open === 0 ? "all done today" : "left today"}
          </div>
        </div>
      </div>
    </div>
  );
}
