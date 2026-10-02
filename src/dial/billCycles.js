// The budget's pay cycles and the bills paid in them. Pure functions, no
// React, so the rules live in one place.
//
// A cycle is a payday: the 15th or the 30th (the last day in February) of a
// month, keyed "YYYY-MM-15" / "YYYY-MM-30". A cycle runs from its payday to
// the day before the next one, so on the 2nd of October the current cycle is
// September 30th.
//
// A bill is a login in the Bills section. Its budget fields, all optional and
// added on top of the login (older app copies keep them untouched):
//   plan:     [{ from, amount, cycles }], each entry applies from cycle `from`
//             onward, so changing the amount or cycles never rewrites the past.
//             cycles is ["15"], ["30"] or ["15", "30"]; the full amount is due
//             in each of them. An empty plan means "not on the budget".
//   bankId:   the account it's usually paid from.
//   payments: [{ id, occ, in, splits: [{ bankId, amount }], status, at, paidAt }]
//             occ is the cycle the money is owed for, in the cycle it was paid
//             in (they differ when a short payment is caught up later); status
//             is "scheduled" until it posts, then "paid".
//   skips:    [occ], cycles marked "no payment".
// Whatever is still owed for a cycle carries forward as past due until it's
// paid or skipped.

const pad = (n) => String(n).padStart(2, "0");
const lastDay = (y, m) => new Date(y, m, 0).getDate(); // m is 1-12

export function cycleOf(date = new Date()) {
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  if (d >= Math.min(30, lastDay(y, m))) return `${y}-${pad(m)}-30`;
  if (d >= 15) return `${y}-${pad(m)}-15`;
  return m === 1 ? `${y - 1}-12-30` : `${y}-${pad(m - 1)}-30`;
}

export const halfOf = (key) => key.slice(8); // "15" | "30"

export function nextCycle(key) {
  const y = +key.slice(0, 4), m = +key.slice(5, 7);
  if (halfOf(key) === "15") return `${y}-${pad(m)}-30`;
  return m === 12 ? `${y + 1}-01-15` : `${y}-${pad(m + 1)}-15`;
}

export function prevCycle(key) {
  const y = +key.slice(0, 4), m = +key.slice(5, 7);
  if (halfOf(key) === "30") return `${y}-${pad(m)}-15`;
  return m === 1 ? `${y - 1}-12-30` : `${y}-${pad(m - 1)}-30`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function cycleLabel(key) {
  const y = +key.slice(0, 4), m = +key.slice(5, 7);
  const day = halfOf(key) === "15" ? 15 : Math.min(30, lastDay(y, m));
  return `${MONTHS[m - 1]} ${day}`;
}

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;
const sum = (xs) => money(xs.reduce((s, x) => s + (Number(x) || 0), 0));
export const paymentTotal = (p) => sum((p.splits || []).map((s) => s.amount));

// The plan entry in force for a cycle, or null.
export function planFor(bill, key) {
  let found = null;
  for (const e of bill.plan || []) if (e.from <= key && (!found || e.from >= found.from)) found = e;
  return found && found.cycles?.length && Number(found.amount) > 0 ? found : null;
}

export const isOnBudget = (bill, key) => !!planFor(bill, key) || (bill.plan || []).some((e) => e.from > key);

// The cycles a bill is due in, from its first plan entry up to `key`.
export function dueCycles(bill, key) {
  const plan = bill.plan || [];
  if (!plan.length) return [];
  let c = plan.reduce((a, e) => (e.from < a ? e.from : a), plan[0].from);
  const out = [];
  for (let guard = 0; c <= key && guard < 600; guard++, c = nextCycle(c)) {
    const p = planFor(bill, c);
    if (p && p.cycles.includes(halfOf(c))) out.push(c);
  }
  return out;
}

export function owedFor(bill, occ) {
  const p = planFor(bill, occ);
  if (!p || !p.cycles.includes(halfOf(occ)) || (bill.skips || []).includes(occ)) return 0;
  const put = sum((bill.payments || []).filter((x) => x.occ === occ).map(paymentTotal));
  return Math.max(0, money(Number(p.amount) - put));
}

// Everything still owed as of cycle `key`: this cycle's bills plus anything
// carried forward. [{ bill, occ, owed, pastDue }]
export function openItems(bills, key) {
  const out = [];
  for (const bill of bills) {
    for (const occ of dueCycles(bill, key)) {
      const owed = owedFor(bill, occ);
      if (owed > 0.004) out.push({ bill, occ, owed, pastDue: occ !== key });
    }
  }
  return out.sort((a, b) => (a.occ < b.occ ? -1 : a.occ > b.occ ? 1 : 0) ||
    (a.bill.name || "").localeCompare(b.bill.name || "", undefined, { sensitivity: "base" }));
}

// Payments as [{ bill, payment }], filtered.
export function paymentsWhere(bills, test) {
  const out = [];
  for (const bill of bills) for (const payment of bill.payments || []) if (test(payment)) out.push({ bill, payment });
  return out;
}

// Scheduled payments still waiting to post (from this cycle or earlier).
export const scheduledAsOf = (bills, key) => paymentsWhere(bills, (p) => p.status === "scheduled" && p.in <= key);
// Payments that posted, made in this cycle.
export const paidIn = (bills, key) => paymentsWhere(bills, (p) => p.status === "paid" && p.in === key);

// What's been put toward bills from an account in a cycle (scheduled or paid).
export function usedFrom(bills, bankId, key) {
  return sum(paymentsWhere(bills, (p) => p.in === key)
    .flatMap(({ payment }) => (payment.splits || []).filter((s) => s.bankId === bankId).map((s) => s.amount)));
}

// Checks a payment before it's saved. Returns an error message or "".
export function checkPayment(splits, owed) {
  const parts = splits.map((s) => Number(s.amount));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return "Enter an amount.";
  const total = sum(parts);
  if (total <= 0) return "Enter an amount.";
  if (splits.some((s) => Number(s.amount) > 0 && !s.bankId)) return "Choose an account.";
  if (total > owed + 0.004) return `That's more than the ${owed.toLocaleString("en-US", { style: "currency", currency: "USD" })} left on this bill.`;
  return "";
}

// Sets the amount/cycles from cycle `from` on, keeping earlier entries.
export function withPlan(bill, from, amount, cycles) {
  const plan = (bill.plan || []).filter((e) => e.from < from);
  return { ...bill, plan: [...plan, { from, amount: money(amount), cycles: [...cycles].sort() }] };
}

// One-time move of the old bills (one cycle, one status, no history) onto
// their logins. Only logins that have never had a plan are touched, and the
// old `bills` list is left exactly as it was. Returns null if nothing changed.
export function migrateOldBills(state, key, makeId) {
  const old = state.bills || [];
  if (!old.length) return null;
  const logins = (state.logins || []).map((l) => ({ ...l }));
  let changed = false;
  const now = new Date().toISOString();
  for (const b of old) {
    const name = (b.name || "").trim();
    const half = b.dueDate === "30" ? "30" : "15";
    const amount = money(b.amount);
    if (!name) continue;
    let l = logins.find((x) => x.name === name);
    if (l && l.kind === "credential") continue; // moved there on purpose
    if (l && "plan" in l && !l._migrating) continue; // already on the new budget
    if (!l) {
      l = { id: makeId(), name, url: "", username: "", password: null };
      logins.push(l);
    }
    l._migrating = true;
    l.kind = "bill";
    const cur = l.plan?.[0];
    const cycles = Array.from(new Set([...(cur?.cycles || []), half]));
    l.plan = [{ from: key, amount: Math.max(cur?.amount || 0, amount), cycles: cycles.sort() }];
    if (!l.bankId && b.bankId) l.bankId = b.bankId;
    // The old status only means something for the cycle we're in now.
    if (half === halfOf(key) && amount > 0) {
      if (b.status === "skip") l.skips = [...(l.skips || []), key];
      if (b.status === "paid" || b.status === "scheduled") {
        l.payments = [...(l.payments || []), {
          id: makeId(), occ: key, in: key, splits: [{ bankId: b.bankId || "", amount }],
          status: b.status, at: now, paidAt: b.status === "paid" ? (b.paidAt || now) : null,
        }];
      }
    }
    changed = true;
  }
  if (!changed) return null;
  for (const l of logins) delete l._migrating;
  return { ...state, logins };
}
