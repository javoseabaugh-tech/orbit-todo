// Date helpers for the redesign. Every date Orbit stores is a local
// "YYYY-MM-DD" string, and every reminder a local "YYYY-MM-DDTHH:MM:SS"
// string, so these never go through toISOString (that returns the UTC date,
// which has already rolled over on a Central-time evening).

const pad = (n) => String(n).padStart(2, "0");

export function dateStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(str, n) {
  const d = new Date(str + "T00:00:00");
  d.setDate(d.getDate() + n);
  return dateStr(d);
}

export function nowHM(d = new Date()) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// "2026-09-29" -> "Tue 29 Sep"
export function prettyDate(str) {
  const d = new Date(str + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

// Relative when it helps, a date otherwise.
export function dayLabel(str, today = dateStr()) {
  if (!str) return "No date";
  if (str === today) return "Today";
  if (str === addDays(today, 1)) return "Tomorrow";
  if (str === addDays(today, -1)) return "Yesterday";
  return prettyDate(str);
}

// "14:30" -> "2:30 pm"
export function fmtHM(hm) {
  if (!hm) return "";
  const [h, m] = hm.split(":").map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? "pm" : "am"}`;
}

// The time part of a stored reminder, "HH:MM", or null.
export function reminderHM(todo) {
  if (!todo?.timeSensitive || !todo.notifyAt) return null;
  return todo.notifyAt.slice(11, 16);
}
