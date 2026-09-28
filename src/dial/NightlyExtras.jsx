import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { getMyNotifyConfig } from "../notifyConfig";
import { NIGHT } from "../Nightly";
import { addDays, fmtHM, reminderHM } from "./dates";
import { faceColor, initials } from "./tokens";

// Two additions to the Nightly screen, both read-only over existing data:
//   StreakStrip  - how the last two weeks of nights went, and a forgiving streak
//   TomorrowPlan - end the evening with tomorrow sorted

// ---------- streaks ----------
// A night belongs to the date an item was first meant for (firstDate survives
// a rollover), so carrying something forward doesn't rewrite history.
function nightsByDate(items) {
  const out = {};
  items.forEach((it) => {
    if (it.skipped) return;
    const date = it.firstDate || it.forDate;
    if (!date) return;
    const n = out[date] || (out[date] = { total: 0, done: 0 });
    n.total += 1;
    if (it.done) n.done += 1;
  });
  return out;
}

// Forgiving on purpose: one missed night doesn't reset the streak; two in a
// row do. Nights with nothing planned don't count either way. Tonight only
// counts once it's finished, so an evening in progress never looks broken.
export function computeStreak(items, today) {
  const nights = nightsByDate(items);
  const t = nights[today];
  let date = t && t.total && t.done === t.total ? today : addDays(today, -1);
  let streak = 0;
  let missesInRow = 0;
  for (let i = 0; i < 90; i++, date = addDays(date, -1)) {
    const n = nights[date];
    if (!n || !n.total) continue;
    if (n.done === n.total) {
      streak += 1;
      missesInRow = 0;
    } else {
      missesInRow += 1;
      if (missesInRow >= 2) break;
    }
  }
  return streak;
}

function Dot({ state, isToday }) {
  const size = 14;
  const base = { width: size, height: size, borderRadius: "50%", flexShrink: 0, boxSizing: "border-box" };
  let style;
  if (state === "full") style = { ...base, background: NIGHT.goldGradient, boxShadow: `0 0 8px -2px ${NIGHT.goldDeep}` };
  else if (state === "part") style = { ...base, background: `linear-gradient(90deg, ${NIGHT.gold} 50%, transparent 50%)`, border: `1.5px solid ${NIGHT.goldBorder}` };
  else if (state === "missed") style = { ...base, border: `1.5px solid ${NIGHT.borderStrong}` };
  else style = { ...base, width: 5, height: 5, margin: "0 4.5px", background: NIGHT.border };
  return <span title={isToday ? "Tonight" : undefined} style={{ ...style, outline: isToday ? `1px solid ${NIGHT.goldBorder}` : "none", outlineOffset: 2 }} />;
}

export function StreakStrip({ items, today }) {
  const nights = nightsByDate(items);
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const states = days.map((d) => {
    const n = nights[d];
    if (!n || !n.total) return "none";
    if (n.done === n.total) return "full";
    if (d === today) return n.done ? "part" : "none";
    return n.done ? "part" : "missed";
  });
  const complete = states.filter((s) => s === "full").length;
  const streak = computeStreak(items, today);
  if (!Object.keys(nights).length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }} aria-label={`${complete} of the last 14 nights finished`}>
        {states.map((s, i) => <Dot key={days[i]} state={s} isToday={days[i] === today} />)}
      </div>
      <div style={{ fontSize: 12.5, color: NIGHT.textMuted }}>
        {streak > 1 ? (
          <><b style={{ color: NIGHT.gold }}>{streak}-night streak</b> · {complete} of the last 14</>
        ) : (
          <>{complete} of the last 14 nights finished</>
        )}
      </div>
    </div>
  );
}

// ---------- set up tomorrow ----------
function PlanRow({ todo, assignee, actions }) {
  const hm = reminderHM(todo);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 2px", borderBottom: `1px solid ${NIGHT.border}` }}>
      <button onClick={() => actions.onOpen(todo)} style={{
        flex: 1, minWidth: 0, textAlign: "left", background: "transparent", border: "none", padding: 0,
        cursor: "pointer", color: NIGHT.text, fontFamily: "inherit", fontSize: 14.5, lineHeight: 1.4,
      }}>
        {todo.text}
        <span style={{ display: "block", fontSize: 11.5, color: NIGHT.textFaint, marginTop: 2 }}>
          {todo.list === "work" ? "Work" : "Personal"}{hm ? ` · ${fmtHM(hm)}` : ""}{todo.isShared ? " · shared with you" : ""}
        </span>
      </button>
      {assignee && (
        <span title={assignee.name} style={{
          width: 22, height: 22, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center",
          background: faceColor(assignee.email || assignee.name), color: NIGHT.ink, fontSize: 9.5, fontWeight: 800,
        }}>{initials(assignee.name)}</span>
      )}
      {actions.push && (
        <>
          <button onClick={() => actions.onDone(todo)} title="Done" aria-label="Mark done" style={{
            width: 32, height: 32, borderRadius: 10, border: `1px solid ${NIGHT.borderStrong}`, background: "transparent",
            color: NIGHT.textMuted, display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0,
          }}><Check size={15} /></button>
          <button onClick={() => actions.onPush(todo)} style={{
            display: "flex", alignItems: "center", gap: 5, padding: "7px 11px", borderRadius: 10, flexShrink: 0,
            border: `1px solid ${NIGHT.goldBorder}`, background: NIGHT.goldDim, color: NIGHT.gold,
            fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
          }}>Tomorrow <ArrowRight size={13} /></button>
        </>
      )}
    </div>
  );
}

export function TomorrowPlan({ plan, highlight }) {
  if (!plan) return null;
  const { leftovers, tomorrow, assigneeOf } = plan;
  const label = { fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: NIGHT.textFaint, marginBottom: 6 };
  return (
    <div style={{
      marginTop: 30, padding: "16px 16px 6px", borderRadius: 20,
      border: `1px solid ${highlight ? NIGHT.goldBorder : NIGHT.border}`,
      background: highlight ? NIGHT.goldDim : "transparent",
    }}>
      <div style={{ fontFamily: "'Bricolage Grotesque', system-ui, sans-serif", fontSize: 18, fontWeight: 600, color: NIGHT.textBright }}>
        Set up tomorrow
      </div>
      <div style={{ fontSize: 12.5, color: NIGHT.textMuted, margin: "3px 0 12px" }}>
        {leftovers.length
          ? "Push what didn't happen today, tick off what did, tap anything to change it."
          : "Nothing left over from today."}
      </div>

      {leftovers.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={label}>Left from today · {leftovers.length}</div>
          <div style={{ borderTop: `1px solid ${NIGHT.border}` }}>
            {leftovers.map((t) => (
              <PlanRow key={t.id} todo={t} assignee={assigneeOf(t)} actions={{ ...plan, push: true }} />
            ))}
          </div>
        </div>
      )}

      <div style={label}>Already tomorrow · {tomorrow.length}</div>
      {tomorrow.length ? (
        <div style={{ borderTop: `1px solid ${NIGHT.border}`, marginBottom: 10 }}>
          {tomorrow.map((t) => (
            <PlanRow key={t.id} todo={t} assignee={assigneeOf(t)} actions={{ ...plan, push: false }} />
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: NIGHT.textFaint, padding: "4px 0 12px" }}>A clear day so far.</div>
      )}
    </div>
  );
}

// ---------- staging test tool ----------
// STAGING ONLY. Sends tonight's list to your own bot with the same ✓ buttons
// the 6pm nudge uses, so tapping to tick off can be tried against the staging
// Worker without the Apps Script (which only runs against live). Uses the bot
// saved in your own Telegram settings; set that up with a test bot on staging.
export function TestNudge({ email, tonight }) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    setMsg("");
    try {
      const cfg = await getMyNotifyConfig(email);
      if (!cfg?.telegramBotToken || !cfg?.telegramChatId) {
        setMsg("Set up Telegram first (account menu → Notifications), using a test bot.");
        return;
      }
      const pending = tonight.filter((it) => !it.done);
      const lines = ["🌙 Tonight (staging test)", "", ...pending.map((it) => `• ${it.scope === "house" ? "🏠 " : ""}${it.text}`)];
      const rows = pending.map((it) => {
        const label = (it.scope === "house" ? "🏠 " : "") + it.text;
        return [{
          text: "✓ " + (label.length > 32 ? label.slice(0, 31) + "…" : label),
          callback_data: `n:${it.scope === "house" ? "h" : "u"}:${it.id}`,
        }];
      });
      const res = await fetch(`https://api.telegram.org/bot${cfg.telegramBotToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: cfg.telegramChatId,
          text: pending.length ? lines.join("\n") : "🌙 Nothing left for tonight (staging test).",
          ...(rows.length ? { reply_markup: { inline_keyboard: rows } } : {}),
        }),
      });
      const body = await res.json();
      setMsg(body.ok ? "Sent. Tap a ✓ in Telegram, then check the list here." : `Telegram said: ${body.description}`);
    } catch (e) {
      setMsg("Couldn't send: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 26, padding: 14, borderRadius: 16, border: `1px dashed ${NIGHT.borderStrong}` }}>
      <div style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: NIGHT.gold, marginBottom: 6 }}>Staging test tool</div>
      <button onClick={send} disabled={busy} style={{
        padding: "9px 14px", borderRadius: 12, border: `1px solid ${NIGHT.goldBorder}`, background: NIGHT.goldDim,
        color: NIGHT.gold, fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
      }}>{busy ? "Sending…" : "Send me a test nudge"}</button>
      {msg && <div style={{ fontSize: 12.5, color: NIGHT.textMuted, marginTop: 8 }}>{msg}</div>}
    </div>
  );
}
