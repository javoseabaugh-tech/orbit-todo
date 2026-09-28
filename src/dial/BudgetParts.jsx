import { useState } from "react";
import { X, Trash2, ExternalLink, Plus } from "lucide-react";
import { D, FONT_DISPLAY, FONT_BODY } from "./tokens";
import useKeyboardInset from "./useKeyboardInset";

// The Budget screen's pieces in the Orbit Dial look. They only display and
// call back; every change still goes through Budget.jsx's own state and its
// single save path, so the stored shape of the budget document is unchanged.

export const STATUS = {
  unpaid: { label: "Unpaid", color: () => D.red },
  scheduled: { label: "Scheduled", color: () => D.amber },
  paid: { label: "Paid", color: () => D.green },
  skip: { label: "No payment", color: () => D.faint },
};
const STATUS_ORDER = ["unpaid", "scheduled", "paid", "skip"];

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

// ---------- bills ----------
export function BillTile({ bill, onOpen }) {
  const st = STATUS[bill.status] || STATUS.unpaid;
  const resolved = bill.status === "paid" || bill.status === "skip";
  return (
    <button onClick={onOpen} style={{
      minWidth: 0, textAlign: "left", border: "none", cursor: "pointer", borderRadius: 14,
      padding: "9px 11px", background: D.surface, color: D.text, fontFamily: FONT_BODY,
      display: "flex", flexDirection: "column", gap: 3, opacity: resolved ? 0.55 : 1,
      boxShadow: `inset 3px 0 0 ${st.color()}`,
    }}>
      <span style={{ fontSize: 12.5, color: D.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: resolved ? "line-through" : "none" }}>
        {bill.name || "Unnamed"}
      </span>
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(bill.amount)}</span>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: st.color(), textTransform: "uppercase", letterSpacing: ".04em" }}>{st.label}</span>
      </span>
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

// Status is the thing you change most, so it leads and saves on tap.
export function BillSheet({ bill, accounts, loginNames, loginUrl, onStatus, onUpdate, onDelete, onClose }) {
  const [confirm, setConfirm] = useState(false);
  const [amount, setAmount] = useState(String(bill.amount ?? ""));
  return (
    <Sheet title={bill.name || "Bill"} onClose={onClose}>
      <div>
        <span style={label}>Status</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {STATUS_ORDER.map((s) => (
            <button key={s} style={chip(bill.status === s, bill.status === s ? STATUS[s].color() : null)} onClick={() => onStatus(s)}>
              {STATUS[s].label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label>
          <span style={label}>Amount</span>
          <input type="number" inputMode="decimal" value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={() => onUpdate({ amount: parseFloat(amount) || 0 })}
            style={{ ...field, fontVariantNumeric: "tabular-nums" }} />
        </label>
        <label>
          <span style={label}>Paid from</span>
          <select value={bill.bankId || ""} onChange={(e) => onUpdate({ bankId: e.target.value })} disabled={!accounts.length} style={field}>
            {!accounts.length && <option value="">No account</option>}
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      </div>

      <label>
        <span style={label}>Bill</span>
        <select value={bill.name} onChange={(e) => onUpdate({ name: e.target.value })} style={field}>
          {!loginNames.includes(bill.name) && bill.name && <option value={bill.name}>{bill.name} (no login saved)</option>}
          {loginNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>

      <div style={{ display: "flex", gap: 10 }}>
        {loginUrl && (
          <a href={loginUrl} target="_blank" rel="noopener noreferrer" style={{ ...chip(false), textDecoration: "none", flex: 1, justifyContent: "center", padding: 13 }}>
            <ExternalLink size={15} /> Open site
          </a>
        )}
        {confirm ? (
          <button style={{ ...chip(true, D.red), color: "#fff", flex: 1, justifyContent: "center", padding: 13 }} onClick={onDelete}>Delete bill</button>
        ) : (
          <button style={{ ...chip(false), color: D.red, justifyContent: "center", padding: 13 }} onClick={() => setConfirm(true)} aria-label="Delete bill">
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </Sheet>
  );
}

export function AddBillSheet({ period, accounts, loginNames, onAdd, onClose }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(period);
  const [bankId, setBankId] = useState(accounts[0]?.id || "");
  const ready = name.trim() && amount !== "" && Number.isFinite(parseFloat(amount));
  return (
    <Sheet title="Add a bill" onClose={onClose}>
      <div style={{ display: "flex", gap: 6 }}>
        <button style={chip(dueDate === "15")} onClick={() => setDueDate("15")}>Due the 15th</button>
        <button style={chip(dueDate === "30")} onClick={() => setDueDate("30")}>Due the 30th</button>
      </div>
      <label>
        <span style={label}>Bill</span>
        <select value={name} onChange={(e) => setName(e.target.value)} style={field}>
          <option value="">{loginNames.length ? "Choose a bill…" : "Add a login first"}</option>
          {loginNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label>
          <span style={label}>Amount</span>
          <input type="number" inputMode="decimal" value={amount} placeholder="0.00" onChange={(e) => setAmount(e.target.value)} style={field} />
        </label>
        <label>
          <span style={label}>Paid from</span>
          <select value={bankId} onChange={(e) => setBankId(e.target.value)} disabled={!accounts.length} style={field}>
            {!accounts.length && <option value="">Add an account first</option>}
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      </div>
      <button style={primaryBtn(ready)} disabled={!ready} onClick={() => onAdd({ name, amount, dueDate, bankId })}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Plus size={16} /> Add bill</span>
      </button>
    </Sheet>
  );
}

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
