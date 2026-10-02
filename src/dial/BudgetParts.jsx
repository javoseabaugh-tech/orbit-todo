import { useState } from "react";
import { X, Trash2, ExternalLink, Plus, ChevronDown, Check, Undo2, Pencil } from "lucide-react";
import { cycleLabel, checkPayment, planFor, halfOf, paymentTotal } from "./billCycles";
import { D, FONT_DISPLAY, FONT_BODY } from "./tokens";
import useKeyboardInset from "./useKeyboardInset";

// The Budget screen's pieces in the Orbit Dial look. They only display and
// call back; every change still goes through Budget.jsx's own state and its
// single save path. The pay-cycle rules live in billCycles.js.

export function fmtMoney(n, cents = false) {
  const v = Number.isFinite(Number(n)) ? Number(n) : 0;
  const whole = Math.abs(v - Math.round(v)) < 0.005;
  return v.toLocaleString("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: cents || !whole ? 2 : 0, maximumFractionDigits: 2,
  });
}

// ---------- overview: rings + legend ----------
export function Overview({ paid, scheduled, unpaid, left, allDone }) {
  const total = paid + scheduled + unpaid;
  const R = 54, C = 2 * Math.PI * R;
  let offset = 0;
  const segs = [
    { v: paid, color: D.green },
    { v: scheduled, color: D.amber },
    { v: unpaid, color: D.red },
  ].filter((s) => s.v > 0).map((s) => {
    const len = total ? (s.v / total) * C : 0;
    const seg = { ...s, len, offset };
    offset += len;
    return seg;
  });
  const rows = [
    { label: "Paid", v: paid, color: D.green },
    { label: "Scheduled", v: scheduled, color: D.amber },
    { label: "Unpaid", v: unpaid, color: D.red },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "136px 1fr", gap: 14, alignItems: "center" }}>
      <div style={{ position: "relative", width: 136, height: 136 }}>
        <svg viewBox="0 0 136 136" width="136" height="136" role="img" aria-label={`${fmtMoney(left)} left after bills`}>
          <circle cx="68" cy="68" r={R} fill="none" stroke={D.surfaceStrong} strokeWidth="14" />
          {segs.map((s, i) => (
            <circle key={i} cx="68" cy="68" r={R} fill="none" stroke={s.color} strokeWidth="14"
              strokeDasharray={`${Math.max(0, s.len - 2)} ${C}`} strokeDashoffset={-s.offset}
              transform="rotate(-90 68 68)" strokeLinecap="butt" />
          ))}
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
          <div>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 19, color: left < 0 ? D.red : D.text, fontVariantNumeric: "tabular-nums" }}>
              {fmtMoney(left)}
            </div>
            <div style={{ fontSize: 10.5, color: D.muted }}>left</div>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 13.5 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 7, color: D.muted }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: r.color }} />{r.label}
            </span>
            <b style={{ fontVariantNumeric: "tabular-nums" }}>{fmtMoney(r.v)}</b>
          </div>
        ))}
        <div style={{ height: 1, background: D.line, margin: "2px 0" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
          <span style={{ color: D.muted }}>{allDone ? "All handled" : "Left after bills"}</span>
          <b style={{ color: left < 0 ? D.red : D.green, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(left)}</b>
        </div>
      </div>
    </div>
  );
}

// ---------- accounts ----------
export function AccountTile({ name, balance, assigned, onOpen }) {
  const left = balance - assigned;
  return (
    <button onClick={onOpen} style={{
      flex: "1 1 0", minWidth: 0, textAlign: "left", border: "none", cursor: "pointer", borderRadius: 16,
      padding: "10px 12px", background: D.surface, color: D.text, fontFamily: FONT_BODY,
      display: "flex", flexDirection: "column", gap: 2,
    }}>
      <span style={{ fontSize: 11.5, color: D.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
      <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 17, color: left < 0 ? D.red : D.text, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(left)}</span>
      <span style={{ fontSize: 11, color: D.faint, fontVariantNumeric: "tabular-nums" }}>of {fmtMoney(balance)}</span>
    </button>
  );
}

// ---------- the shared bottom sheet ----------
function Sheet({ title, onClose, children }) {
  const inset = useKeyboardInset();
  return (
    <div role="dialog" aria-modal="true" aria-label={title} style={{ position: "fixed", inset: 0, zIndex: 220 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: D.scrim, animation: "fadeIn .2s ease" }} />
      <div style={{
        position: "absolute", left: 10, right: 10, bottom: `calc(10px + ${inset}px + env(safe-area-inset-bottom))`,
        maxWidth: 520, margin: "0 auto", background: D.sheet, color: D.sheetText, borderRadius: 28, padding: 18,
        display: "flex", flexDirection: "column", gap: 14, fontFamily: FONT_BODY,
        boxShadow: "0 30px 80px -30px rgba(0,0,0,.6)", animation: "sheetIn .32s cubic-bezier(.22,1,.36,1)",
        maxHeight: `calc(100dvh - 40px - ${inset}px)`, overflowY: "auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ margin: 0, flex: 1, fontFamily: FONT_DISPLAY, fontSize: 19, fontWeight: 800 }}>{title}</h2>
          <button onClick={onClose} aria-label="Close" style={{ border: "none", background: "transparent", color: D.sheetMuted, cursor: "pointer", display: "flex", padding: 4 }}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const chip = (on, color) => ({
  display: "inline-flex", alignItems: "center", gap: 6, border: "none", borderRadius: 999, cursor: "pointer",
  padding: "9px 13px", fontFamily: FONT_BODY, fontSize: 13, fontWeight: 700,
  background: on ? (color || D.chipOn) : D.chip, color: on ? (color ? "#0A0D1F" : D.chipOnText) : D.chipText,
});
const field = {
  width: "100%", border: "none", borderRadius: 14, padding: "12px 14px", fontFamily: FONT_BODY, fontSize: 16,
  background: D.chip, color: D.chipText, outline: "none",
};
const label = { fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: D.sheetMuted, marginBottom: 6, display: "block" };
const primaryBtn = (on) => ({
  width: "100%", border: "none", borderRadius: 16, padding: 14, cursor: on ? "pointer" : "default",
  background: on ? D.chipOn : D.chip, color: on ? D.chipOnText : D.chipText, opacity: on ? 1 : 0.6,
  fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15,
});

export function AccountSheet({ account, period, assigned, canDelete, onRename, onBalance, onDelete, onClose }) {
  const [name, setName] = useState(account.name);
  const raw = account.balances?.[period];
  const [balance, setBalance] = useState(raw === undefined ? "" : String(raw));
  const [confirm, setConfirm] = useState(false);
  const bal = balance === "" ? 0 : Number(balance);
  return (
    <Sheet title={account.name} onClose={onClose}>
      <label>
        <span style={label}>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && onRename(name.trim())} style={field} />
      </label>
      <label>
        <span style={label}>Available the {period === "15" ? "15th" : "30th"}</span>
        <input type="number" inputMode="decimal" value={balance} placeholder="0.00"
          onChange={(e) => setBalance(e.target.value)} onBlur={() => onBalance(balance)}
          style={{ ...field, fontVariantNumeric: "tabular-nums" }} />
      </label>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: D.sheetMuted }}>
        <span>Assigned {fmtMoney(assigned, true)}</span>
        <b style={{ color: bal - assigned < 0 ? D.red : D.sheetText }}>Left {fmtMoney(bal - assigned, true)}</b>
      </div>
      {canDelete && (confirm ? (
        <button style={{ ...primaryBtn(true), background: D.red, color: "#fff" }} onClick={onDelete}>
          Delete account (its bills keep their amounts)
        </button>
      ) : (
        <button style={{ ...chip(false), color: D.red, justifyContent: "center" }} onClick={() => setConfirm(true)}>
          <Trash2 size={15} /> Delete account
        </button>
      ))}
    </Sheet>
  );
}

// ---------- pay cycles ----------
const cyclesText = (c) => (c.length === 2 ? "15th & 30th" : c[0] === "15" ? "15th" : "30th");

// A bill still owed this cycle (or carried forward). Tap to pay or skip.
export function OpenBillTile({ item, onOpen }) {
  const { bill, occ, owed, pastDue } = item;
  const full = planFor(bill, occ)?.amount || owed;
  const color = pastDue ? D.red : D.accent;
  return (
    <button onClick={onOpen} style={{
      minWidth: 0, textAlign: "left", border: "none", cursor: "pointer", borderRadius: 14,
      padding: "9px 11px", background: D.surface, color: D.text, fontFamily: FONT_BODY,
      display: "flex", flexDirection: "column", gap: 3, boxShadow: `inset 3px 0 0 ${color}`,
    }}>
      <span style={{ fontSize: 12.5, color: D.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {bill.name || "Unnamed"}
      </span>
      <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(owed)}</span>
      <span style={{ fontSize: 10.5, fontWeight: 800, color: pastDue ? D.red : D.faint, textTransform: "uppercase", letterSpacing: ".04em" }}>
        {pastDue ? `Past due · ${cycleLabel(occ)}` : owed < full ? `left of ${fmtMoney(full)}` : "Due"}
      </span>
    </button>
  );
}

// One payment in "Payments scheduled" or "Paid": who, how much, from where.
export function PaymentRow({ bill, payment, accounts, action, onAction, onUndo }) {
  const from = (payment.splits || []).filter((x) => Number(x.amount) > 0)
    .map((x) => `${accounts.find((a) => a.id === x.bankId)?.name || "No account"}${payment.splits.length > 1 ? ` ${fmtMoney(x.amount)}` : ""}`)
    .join(" + ");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 14, background: D.surface }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{bill.name}</div>
        <div style={{ fontSize: 11.5, color: D.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {from}{payment.occ !== payment.in ? ` · for ${cycleLabel(payment.occ)}` : ""}
        </div>
      </div>
      <b style={{ fontFamily: FONT_DISPLAY, fontSize: 15, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(paymentTotal(payment))}</b>
      {action && (
        <button onClick={onAction} style={{ ...chip(false), padding: "7px 10px", fontSize: 12 }}>
          <Check size={13} /> {action}
        </button>
      )}
      <button onClick={onUndo} aria-label={action ? "Cancel this payment" : "Undo paid"} title={action ? "Cancel this payment" : "Undo paid"} style={{
        border: "none", background: "transparent", color: D.faint, cursor: "pointer", display: "flex", padding: 4,
      }}><Undo2 size={15} /></button>
    </div>
  );
}

// A section header that can fold its rows away ("Paid · 3").
export function Fold({ title, count, open, onToggle, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button onClick={onToggle} aria-expanded={open} style={{
        border: "none", background: "transparent", cursor: "pointer", padding: 0, color: D.muted,
        display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: FONT_DISPLAY,
        fontSize: 13, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
      }}>
        <span>{title} · {count}</span>
        <ChevronDown size={16} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
      </button>
      {open && children}
    </div>
  );
}

// Paying a bill: how much, from which account (or split), schedule it, mark
// it already paid, or skip it this cycle. Never more than what's owed.
export function PaySheet({ item, accounts, loginUrl, onPay, onSkip, onEdit, onClose }) {
  const { bill, occ, owed, pastDue } = item;
  const first = accounts.find((a) => a.id === bill.bankId)?.id || accounts[0]?.id || "";
  const [split, setSplit] = useState(false);
  const [bankId, setBankId] = useState(first);
  const [amount, setAmount] = useState(String(owed));
  const [parts, setParts] = useState(() => Object.fromEntries(accounts.map((a) => [a.id, a.id === first ? String(owed) : ""])));
  const [confirmSkip, setConfirmSkip] = useState(false);
  const splits = split
    ? accounts.map((a) => ({ bankId: a.id, amount: parts[a.id] === "" ? 0 : Number(parts[a.id]) })).filter((x) => x.amount !== 0)
    : [{ bankId, amount: amount === "" ? 0 : Number(amount) }];
  const error = checkPayment(splits.length ? splits : [{ bankId, amount: 0 }], owed);
  const total = splits.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const ok = !error;
  return (
    <Sheet title={bill.name || "Bill"} onClose={onClose}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 13.5, color: D.sheetMuted, marginTop: -6 }}>
        <span style={{ color: pastDue ? D.red : D.sheetMuted, fontWeight: pastDue ? 700 : 400 }}>
          {pastDue ? `Past due from ${cycleLabel(occ)}` : `Due ${cycleLabel(occ)}`}
        </span>
        <span><b style={{ color: D.sheetText }}>{fmtMoney(owed, true)}</b> left</span>
      </div>

      <div>
        <span style={label}>Pay from</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {accounts.map((a) => (
            <button key={a.id} style={chip(!split && bankId === a.id)} onClick={() => { setSplit(false); setBankId(a.id); }}>{a.name}</button>
          ))}
          {accounts.length > 1 && <button style={chip(split)} onClick={() => setSplit(true)}>Split</button>}
        </div>
      </div>

      {!split ? (
        <label>
          <span style={label}>Amount</span>
          <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
            style={{ ...field, fontVariantNumeric: "tabular-nums" }} />
        </label>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {accounts.map((a) => (
            <label key={a.id} style={{ display: "grid", gridTemplateColumns: "1fr 140px", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{a.name}</span>
              <input type="number" inputMode="decimal" placeholder="0.00" value={parts[a.id] ?? ""}
                onChange={(e) => setParts((p) => ({ ...p, [a.id]: e.target.value }))}
                style={{ ...field, fontVariantNumeric: "tabular-nums" }} />
            </label>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: D.sheetMuted }}>
            <span>Total</span><b style={{ color: D.sheetText }}>{fmtMoney(total, true)}</b>
          </div>
        </div>
      )}

      {error && total > 0 && <div style={{ fontSize: 13, color: D.red, fontWeight: 600, marginTop: -4 }}>{error}</div>}

      <button style={primaryBtn(ok)} disabled={!ok} onClick={() => onPay(splits, "scheduled")}>Schedule payment</button>
      <div style={{ display: "flex", gap: 8, marginTop: -4 }}>
        <button style={{ ...chip(false), flex: 1, justifyContent: "center", padding: 12, opacity: ok ? 1 : 0.5 }} disabled={!ok} onClick={() => onPay(splits, "paid")}>
          <Check size={15} /> Already paid
        </button>
        {confirmSkip ? (
          <button style={{ ...chip(true, D.red), color: "#fff", flex: 1, justifyContent: "center", padding: 12 }} onClick={onSkip}>Yes, no payment</button>
        ) : (
          <button style={{ ...chip(false), flex: 1, justifyContent: "center", padding: 12 }} onClick={() => setConfirmSkip(true)}>
            Skip {owed < (planFor(bill, occ)?.amount || 0) ? "the rest" : "this payment"}
          </button>
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {loginUrl && (
          <a href={loginUrl} target="_blank" rel="noopener noreferrer" style={{ ...chip(false), textDecoration: "none", flex: 1, justifyContent: "center", padding: 12 }}>
            <ExternalLink size={15} /> Open site
          </a>
        )}
        <button style={{ ...chip(false), flex: 1, justifyContent: "center", padding: 12 }} onClick={onEdit}>
          <Pencil size={14} /> Edit bill
        </button>
      </div>
    </Sheet>
  );
}

// Setting a bill up: name, amount, which paydays, usual account. New bills
// are created as logins in the Bills section (credentials can be added later).
export function BillSetupSheet({ bill, current, accounts, onSave, onRemove, onClose }) {
  const plan = bill ? planFor(bill, current) : null;
  const [name, setName] = useState(bill?.name || "");
  const [amount, setAmount] = useState(plan ? String(plan.amount) : "");
  const [cycles, setCycles] = useState(plan ? plan.cycles : [halfOf(current)]);
  const [bankId, setBankId] = useState(bill?.bankId || accounts[0]?.id || "");
  const [confirm, setConfirm] = useState(false);
  const amt = parseFloat(amount);
  const ready = name.trim() && Number.isFinite(amt) && amt > 0 && cycles.length > 0;
  const opts = [[["15"], "15th"], [["30"], "30th"], [["15", "30"], "Both"]];
  return (
    <Sheet title={bill ? (plan ? "Edit bill" : "Set up bill") : "Add a bill"} onClose={onClose}>
      <label>
        <span style={label}>Bill</span>
        <input value={name} placeholder="e.g. Electric Co." onChange={(e) => setName(e.target.value)} style={field} />
      </label>
      <div>
        <span style={label}>Paid on</span>
        <div style={{ display: "flex", gap: 6 }}>
          {opts.map(([c, l]) => (
            <button key={l} style={{ ...chip(cycles.join() === c.join()), flex: 1, justifyContent: "center" }} onClick={() => setCycles(c)}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label>
          <span style={label}>{cycles.length === 2 ? "Amount each time" : "Amount"}</span>
          <input type="number" inputMode="decimal" value={amount} placeholder="0.00" onChange={(e) => setAmount(e.target.value)}
            style={{ ...field, fontVariantNumeric: "tabular-nums" }} />
        </label>
        <label>
          <span style={label}>Usually from</span>
          <select value={bankId} onChange={(e) => setBankId(e.target.value)} disabled={!accounts.length} style={field}>
            {!accounts.length && <option value="">Add an account first</option>}
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      </div>
      {plan && <div style={{ fontSize: 12, color: D.sheetMuted, marginTop: -4 }}>Changes apply from {cycleLabel(current)} on; earlier cycles keep what they were.</div>}
      <button style={primaryBtn(ready)} disabled={!ready} onClick={() => onSave({ name: name.trim(), amount: amt, cycles, bankId })}>
        {bill ? "Save" : <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Plus size={16} /> Add bill</span>}
      </button>
      {plan && (confirm ? (
        <button style={{ ...primaryBtn(true), background: D.red, color: "#fff" }} onClick={onRemove}>
          Take off the budget (login and history stay)
        </button>
      ) : (
        <button style={{ ...chip(false), color: D.red, justifyContent: "center" }} onClick={() => setConfirm(true)}>
          <Trash2 size={15} /> Take off the budget
        </button>
      ))}
    </Sheet>
  );
}

// Every login in the Bills section, set up or not, to edit or set up.
export function ManageBillsSheet({ bills, current, onPick, onAdd, onClose }) {
  const rows = bills.slice().sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }));
  return (
    <Sheet title="Bills" onClose={onClose}>
      {rows.length === 0 && <div style={{ fontSize: 14, color: D.sheetMuted }}>No bills yet.</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((b) => {
          const p = planFor(b, current);
          return (
            <button key={b.id} onClick={() => onPick(b)} style={{
              ...chip(false), borderRadius: 14, justifyContent: "space-between", padding: "11px 13px", textAlign: "left",
            }}>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.name || "Unnamed"}</span>
              <span style={{ fontWeight: 600, opacity: p ? 1 : 0.7, flexShrink: 0 }}>
                {p ? `${fmtMoney(p.amount)} · ${cyclesText(p.cycles)}` : "Set up"}
              </span>
            </button>
          );
        })}
      </div>
      <button style={primaryBtn(true)} onClick={onAdd}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Plus size={16} /> Add a bill</span>
      </button>
    </Sheet>
  );
}
