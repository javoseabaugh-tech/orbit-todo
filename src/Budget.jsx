import { useState, useEffect, useRef } from "react";
import { theme, glass, SPRING, EASE_OUT } from "./theme";
import { MONO, display, mix, accentButtonStyle, IconAction, GlassBackdrop } from "./ui";
import {
  Plus,
  Trash2,
  Check,
  AlertCircle,
  ArrowLeft,
  ExternalLink,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  ScanFace,
  RotateCcw,
} from "lucide-react";
import { getDoc, setDoc } from "firebase/firestore";
import { generateSaltB64, deriveKey, encryptText, decryptText, makeVerifier, checkVerifier } from "./vaultCrypto";
import { platformAuthAvailable, hasFaceUnlock, registerFaceUnlock, tryFaceUnlock, removeFaceUnlock } from "./faceUnlock";
import { D, FONT_DISPLAY, FONT_BODY, pageBackground } from "./dial/tokens";
import { Overview, AccountTile, BillTile, BillSheet, AddBillSheet, AccountSheet } from "./dial/BudgetParts";
import ImportFromBackup from "./dial/ImportFromBackup";

// Build-time constant: false in the live build, so the staging-only import
// tool below is dropped from the live bundle entirely.
const STAGING = import.meta.env.VITE_APP_ENV === "staging";

// Everything lives in one shared Firestore document so both of you see
// the same data. Change this id if you ever want a second household.

const DEFAULT_STATE = {
  accounts: [
    { id: "a1", name: "Bank Account 1", balances: { "15": 0, "30": 0 } },
  ],
  bills: [
    // { id, name, amount, dueDate: '15'|'30', bankId, status: 'unpaid'|'scheduled'|'skip'|'paid', paidAt }
  ],
  logins: [
    // { id, name, url, username, password: { iv, ct } }
  ],
  vaultMeta: null, // { salt, verifier: { iv, ct } } — set once, on first vault creation
};

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function normalizeStatus(b) {
  if (b.status === "unpaid" || b.status === "scheduled" || b.status === "skip" || b.status === "paid") {
    return b.status;
  }
  if (b.status === "open") return "unpaid";
  if (b.paid) return "paid";
  return "unpaid";
}


export default function Budget({ onBack, budgetRef, title = "Family Budget" }) {
  const [state, setState] = useState(DEFAULT_STATE);
  const [period, setPeriod] = useState("15");
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [sheet, setSheet] = useState(null); // null | { kind: 'add' | 'bill' | 'account', id? }
  const [view, setView] = useState("budget"); // 'budget' | 'logins'
  const [newLogin, setNewLogin] = useState({ name: "", url: "", username: "", password: "" });
  const [visiblePasswords, setVisiblePasswords] = useState({}); // { [loginId]: true }
  const [copiedFlag, setCopiedFlag] = useState(""); // e.g. "loginId-username"
  const skipNextSave = useRef(true);

  // ---------- Vault (zero-knowledge encryption for logins) ----------
  const [vaultKey, setVaultKey] = useState(null); // CryptoKey, in-memory only, never persisted
  const [vaultPassphrase, setVaultPassphrase] = useState("");
  const [vaultConfirm, setVaultConfirm] = useState("");
  const [vaultError, setVaultError] = useState("");
  const [vaultBusy, setVaultBusy] = useState(false);
  const [showForgotInfo, setShowForgotInfo] = useState(false);
  const [decryptedPasswords, setDecryptedPasswords] = useState({}); // { [loginId]: plaintext }
  const [faceIdAvailable, setFaceIdAvailable] = useState(false);
  const [faceIdEnabledHere, setFaceIdEnabledHere] = useState(hasFaceUnlock());
  const [offerFaceId, setOfferFaceId] = useState(false);
  const [faceIdBusy, setFaceIdBusy] = useState(false);
  const [faceIdMsg, setFaceIdMsg] = useState("");
  const pendingPassphraseRef = useRef(""); // held only until the Face ID offer is resolved

  useEffect(() => {
    platformAuthAvailable().then(setFaceIdAvailable);
  }, []);

  // Saving rewrites the whole budget document, so it must only ever run after
  // a load that actually succeeded. If the load fails (no signal and nothing
  // cached), the screen would otherwise show an empty budget, and the next
  // tap would save that emptiness over the real bills, accounts and vault.
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    (async () => {
      setLoaded(false);
      setLoadFailed(false);
      skipNextSave.current = true;
      try {
        const snap = await getDoc(budgetRef);
        if (snap.exists()) {
          const parsed = snap.data();
          const bills = (parsed.bills || []).map((b) => ({
            ...b,
            status: normalizeStatus(b),
          }));
          setState({
            accounts: parsed.accounts?.length ? parsed.accounts : DEFAULT_STATE.accounts,
            bills,
            logins: parsed.logins || [],
            vaultMeta: parsed.vaultMeta || null,
          });
        }
        setLoaded(true);
      } catch (e) {
        console.error("Failed to load household data:", e);
        setLoadFailed(true);
      }
    })();
  }, [loadAttempt]);

  useEffect(() => {
    if (!loaded) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    (async () => {
      try {
        await setDoc(budgetRef, state);
        setSaveError(false);
      } catch (e) {
        console.error("Failed to save household data:", e);
        setSaveError(true);
      }
    })();
  }, [state, loaded]);

  const billsThisPeriod = state.bills.filter((b) => b.dueDate === period);
  const unresolved = billsThisPeriod.filter((b) => b.status === "unpaid" || b.status === "scheduled");
  const paidThisPeriod = billsThisPeriod.filter((b) => b.status === "paid");
  const skippedThisPeriod = billsThisPeriod.filter((b) => b.status === "skip");
  const resolvedCount = paidThisPeriod.length + skippedThisPeriod.length;
  const allDone = billsThisPeriod.length > 0 && unresolved.length === 0 && resolvedCount > 0;


  const sortedLogins = (state.logins || [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const sortedLoginNames = Array.from(new Set(sortedLogins.map((l) => l.name).filter(Boolean))).sort(
    (a, b) => a.localeCompare(b)
  );

  function billLoginUrl(billName) {
    const login = (state.logins || []).find((l) => l.name === billName);
    if (!login || !login.url) return null;
    return /^https?:\/\//i.test(login.url) ? login.url : `https://${login.url}`;
  }

  // Only ever sums the bills for the given pay period, so the 15th's bills can
  // never spill into the 30th's math (and vice-versa). Defaults to the period
  // currently in focus.
  function accountTotal(bankId, forPeriod = period) {
    return state.bills
      .filter((b) => b.dueDate === forPeriod && b.bankId === bankId && b.status !== "skip")
      .reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  }

  function updateAccountBalance(accountId, value, forPeriod = period) {
    setState((s) => ({
      ...s,
      accounts: s.accounts.map((a) =>
        a.id === accountId
          ? { ...a, balances: { ...a.balances, [forPeriod]: value === "" ? "" : Number(value) } }
          : a
      ),
    }));
  }

  function updateAccountName(accountId, name) {
    setState((s) => ({
      ...s,
      accounts: s.accounts.map((a) => (a.id === accountId ? { ...a, name } : a)),
    }));
  }
  function addAccount() {
    setState((s) => {
      if (s.accounts.length >= 3) return s;
      const used = new Set(s.accounts.map((a) => a.id));
      const nextId = ["a1", "a2", "a3"].find((id) => !used.has(id));
      if (!nextId) return s;
      return {
        ...s,
        accounts: [...s.accounts, { id: nextId, name: `Bank Account ${nextId.slice(1)}`, balances: { "15": 0, "30": 0 } }],
      };
    });
  }
  const [confirmReset, setConfirmReset] = useState(false);

  function updateBill(id, patch) {
    setState((s) => ({
      ...s,
      bills: s.bills.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }));
  }

  function setStatus(bill, status) {
    updateBill(bill.id, {
      status,
      paidAt: status === "paid" || status === "skip" ? new Date().toISOString() : null,
    });
  }

  function deleteBill(id) {
    setState((s) => ({ ...s, bills: s.bills.filter((b) => b.id !== id) }));
  }

  async function addLogin() {
    if (!newLogin.name.trim() || !vaultKey) return;
    let url = newLogin.url.trim();
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
    const encryptedPassword = await encryptText(vaultKey, newLogin.password);
    setState((s) => ({
      ...s,
      logins: [
        ...(s.logins || []),
        {
          id: uid(),
          name: newLogin.name.trim(),
          url,
          username: newLogin.username.trim(),
          password: encryptedPassword,
        },
      ],
    }));
    setNewLogin({ name: "", url: "", username: "", password: "" });
  }

  function updateLogin(id, patch) {
    setState((s) => ({
      ...s,
      logins: (s.logins || []).map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));
  }

  async function updateLoginPassword(id, plaintext) {
    setDecryptedPasswords((d) => ({ ...d, [id]: plaintext }));
    if (!vaultKey) return;
    const encrypted = await encryptText(vaultKey, plaintext);
    updateLogin(id, { password: encrypted });
  }

  function deleteLogin(id) {
    setState((s) => ({ ...s, logins: (s.logins || []).filter((l) => l.id !== id) }));
  }

  // ---------- Vault setup / unlock ----------
  async function createVault() {
    setVaultError("");
    if (vaultPassphrase.length < 8) {
      setVaultError("Use at least 8 characters.");
      return;
    }
    if (vaultPassphrase !== vaultConfirm) {
      setVaultError("Those don't match — try again.");
      return;
    }
    setVaultBusy(true);
    try {
      const salt = generateSaltB64();
      const key = await deriveKey(vaultPassphrase, salt);
      const verifier = await makeVerifier(key);
      setState((s) => ({ ...s, vaultMeta: { salt, verifier } }));
      setVaultKey(key);
      if (faceIdAvailable && !hasFaceUnlock()) {
        pendingPassphraseRef.current = vaultPassphrase;
        setOfferFaceId(true);
      }
      setVaultPassphrase("");
      setVaultConfirm("");
    } catch (e) {
      console.error(e);
      setVaultError("Something went wrong setting up your vault — try again.");
    } finally {
      setVaultBusy(false);
    }
  }

  async function unlockVault() {
    setVaultError("");
    if (!vaultPassphrase) return;
    setVaultBusy(true);
    try {
      const key = await deriveKey(vaultPassphrase, state.vaultMeta.salt);
      const ok = await checkVerifier(key, state.vaultMeta.verifier);
      if (!ok) {
        setVaultError("Incorrect passphrase.");
        setVaultBusy(false);
        return;
      }
      setVaultKey(key);
      if (faceIdAvailable && !hasFaceUnlock()) {
        pendingPassphraseRef.current = vaultPassphrase;
        setOfferFaceId(true);
      }
      setVaultPassphrase("");
    } catch (e) {
      console.error(e);
      setVaultError("Something went wrong unlocking your vault — try again.");
    } finally {
      setVaultBusy(false);
    }
  }

  async function unlockWithFaceId() {
    setVaultError("");
    setFaceIdBusy(true);
    try {
      const passphrase = await tryFaceUnlock();
      if (!passphrase) {
        setVaultError("Face ID didn't complete — enter your passphrase instead.");
        return;
      }
      const key = await deriveKey(passphrase, state.vaultMeta.salt);
      const ok = await checkVerifier(key, state.vaultMeta.verifier);
      if (!ok) {
        // Shouldn't normally happen (would mean the cached passphrase is
        // stale after a passphrase change) — clear it so it doesn't loop.
        removeFaceUnlock();
        setFaceIdEnabledHere(false);
        setVaultError("Face ID unlock is out of date — enter your passphrase to reset it.");
        return;
      }
      setVaultKey(key);
    } finally {
      setFaceIdBusy(false);
    }
  }

  async function confirmEnableFaceId() {
    setFaceIdBusy(true);
    setFaceIdMsg("");
    const ok = await registerFaceUnlock(pendingPassphraseRef.current);
    pendingPassphraseRef.current = "";
    setFaceIdBusy(false);
    setOfferFaceId(false);
    if (ok) {
      setFaceIdEnabledHere(true);
    } else {
      setFaceIdMsg("Face ID isn't available on this device/browser — you'll keep using your passphrase here.");
    }
  }

  function declineFaceId() {
    pendingPassphraseRef.current = "";
    setOfferFaceId(false);
  }

  // Once unlocked, decrypt every saved password so the list can render
  // normally. Re-runs whenever the vault unlocks or the login list changes.
  useEffect(() => {
    if (!vaultKey) return;
    (async () => {
      const next = {};
      for (const login of state.logins || []) {
        if (login.password && typeof login.password === "object" && login.password.ct) {
          try {
            next[login.id] = await decryptText(vaultKey, login.password);
          } catch (e) {
            next[login.id] = "";
          }
        } else if (typeof login.password === "string") {
          // Legacy plaintext entry from before the vault existed.
          next[login.id] = login.password;
        }
      }
      setDecryptedPasswords(next);
    })();
  }, [vaultKey, state.logins]);

  function togglePasswordVisible(id) {
    setVisiblePasswords((v) => ({ ...v, [id]: !v[id] }));
  }

  async function copyToClipboard(text, flagKey) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedFlag(flagKey);
      setTimeout(() => setCopiedFlag((f) => (f === flagKey ? "" : f)), 1200);
    } catch (e) {
      // Clipboard permission denied or unavailable — fail quietly
    }
  }

  function resetAllToUnpaid() {
    setConfirmReset(true);
  }
  function doResetAllToUnpaid() {
    setConfirmReset(false);
    setState((s) => ({
      ...s,
      bills: s.bills.map((b) => ({ ...b, status: "unpaid", paidAt: null })),
    }));
  }

  if (loadFailed) {
    return (
      <div style={{ position: "relative", minHeight: "100vh", fontFamily: "'Geist', system-ui, sans-serif" }}>
        <GlassBackdrop />
        <div style={{
          position: "relative", zIndex: 1, minHeight: "100vh", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 14, padding: 24, textAlign: "center",
        }}>
          <AlertCircle size={26} color={theme.accentRed} />
          <p style={{ margin: 0, fontSize: 15, color: theme.textPrimary, maxWidth: 320, lineHeight: 1.5 }}>
            Couldn't load the budget. Nothing was changed. Check your connection and try again.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setLoadAttempt((n) => n + 1)} style={{ ...accentButtonStyle(true), padding: "10px 18px", borderRadius: 12, fontSize: 14, fontWeight: 600 }}>
              Try again
            </button>
            <button onClick={onBack} style={{ padding: "10px 18px", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer", border: `1px solid ${theme.glassBorder}`, background: "transparent", color: theme.textSecondary }}>
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div style={{ position: "relative", minHeight: "100vh", fontFamily: "'Geist', system-ui, sans-serif" }}>
        <GlassBackdrop />
        <div style={{ position: "relative", zIndex: 1, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{
            width: 22, height: 22, borderRadius: "50%",
            border: `2px solid ${theme.accentSoft}`, borderTopColor: theme.accentPlum,
            animation: "spin .8s linear infinite",
          }} />
        </div>
      </div>
    );
  }

  const vaultInput = {
    width: "100%", padding: "11px 13px", borderRadius: 14, fontSize: 14,
    color: theme.textPrimary, background: theme.inputBg, border: `1px solid ${theme.glassBorder2}`,
  };

  // Derived numbers for the budget view (the pinned top and the bill list).
  const accountLeft = (acc) => {
    const raw = acc.balances?.[period];
    return (raw === "" || raw === undefined ? 0 : Number(raw)) - accountTotal(acc.id, period);
  };
  const sumOf = (status) => billsThisPeriod
    .filter((b) => b.status === status)
    .reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const totalLeft = state.accounts.reduce((s, a) => s + accountLeft(a), 0);
  // Everything for the period stays on screen: open bills first (by name),
  // then the handled ones, dimmed, so the whole picture is visible without
  // toggling anything.
  const rank = { unpaid: 0, scheduled: 1, paid: 2, skip: 3 };
  const tiles = billsThisPeriod.slice().sort((a, b) =>
    (rank[a.status] ?? 0) - (rank[b.status] ?? 0) ||
    (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }));

  return (
    <div
      className="orbit-shell"
      style={{
        position: "relative", overflow: "hidden", display: "flex", flexDirection: "column",
        background: pageBackground, color: D.text, fontFamily: FONT_BODY,
      }}
    >
      <div style={{
        position: "relative", zIndex: 1, width: "100%", maxWidth: 640, margin: "0 auto",
        flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
        padding: "0 16px", paddingTop: "calc(10px + env(safe-area-inset-top))",
      }}>
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          {onBack && (
            <button onClick={onBack} aria-label="Back to Orbit" style={{
              width: 36, height: 36, borderRadius: 12, border: "none", cursor: "pointer",
              background: D.surface, color: D.text, display: "grid", placeItems: "center", flexShrink: 0,
            }}>
              <ArrowLeft size={18} />
            </button>
          )}
          <h1 style={{ margin: 0, flex: 1, minWidth: 0, fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 22, lineHeight: 1.15 }}>
            {title}
          </h1>
          <button onClick={() => setView(view === "budget" ? "logins" : "budget")} style={{
            border: "none", cursor: "pointer", borderRadius: 999, padding: "8px 13px", flexShrink: 0,
            fontFamily: FONT_BODY, fontSize: 13, fontWeight: 700, background: D.surface, color: D.text,
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <KeyRound size={14} />{view === "budget" ? "Logins" : "Bills"}
          </button>
        </div>

        {/* The top of the budget stays put: pay period, the ring, the
            accounts and the bills heading. Only the bill tiles scroll. */}
        {view === "budget" && (
          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 14, paddingBottom: 10 }}>
              <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 999, background: D.surface }}>
                {[["15", "15th"], ["30", "30th"]].map(([id, lbl]) => (
                  <button key={id} onClick={() => setPeriod(id)} aria-pressed={period === id} style={{
                    flex: 1, border: "none", cursor: "pointer", borderRadius: 999, padding: "8px 0",
                    fontFamily: FONT_BODY, fontSize: 14, fontWeight: 700,
                    background: period === id ? D.text : "transparent", color: period === id ? D.bgBottom : D.muted,
                  }}>{lbl}</button>
                ))}
              </div>

              <Overview paid={sumOf("paid")} scheduled={sumOf("scheduled")} unpaid={sumOf("unpaid")} left={totalLeft} allDone={allDone} />

              <div style={{ display: "flex", gap: 8 }}>
                {state.accounts.map((acc) => {
                  const raw = acc.balances?.[period];
                  return (
                    <AccountTile key={acc.id} name={acc.name}
                      balance={raw === "" || raw === undefined ? 0 : Number(raw)}
                      assigned={accountTotal(acc.id, period)}
                      onOpen={() => setSheet({ kind: "account", id: acc.id })} />
                  );
                })}
                {state.accounts.length < 3 && (
                  <button onClick={addAccount} aria-label="Add account" style={{
                    width: 44, flexShrink: 0, border: `1.5px dashed ${D.line}`, borderRadius: 16, cursor: "pointer",
                    background: "transparent", color: D.muted, display: "grid", placeItems: "center",
                  }}><Plus size={18} /></button>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <h2 style={{ margin: 0, fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: D.muted }}>
                  Bills · {unresolved.length} open
                </h2>
                <button onClick={resetAllToUnpaid} style={{ border: "none", background: "transparent", color: D.faint, fontFamily: FONT_BODY, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                  <RotateCcw size={12} /> Reset all to unpaid
                </button>
              </div>

          </div>
        )}

        {/* The only scroller. It runs to the screen edge (the negative margin
            cancels the page gutter) so its scroll bar sits in the gutter
            instead of on top of the tiles. */}
        <div className="orbit-scroll" style={{ flex: 1, minHeight: 0, margin: "0 -16px", padding: "0 16px 90px" }}>

        {view === "budget" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {tiles.length === 0 ? (
                <div style={{ textAlign: "center", color: D.muted, fontSize: 14, padding: "14px 8px" }}>
                  No bills for the {period === "15" ? "15th" : "30th"} yet. Tap + to add one.
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
                  {tiles.map((bill) => (
                    <BillTile key={bill.id} bill={bill} onOpen={() => setSheet({ kind: "bill", id: bill.id })} />
                  ))}
                </div>
              )}

              {STAGING && <ImportFromBackup budgetRef={budgetRef} onImported={() => setLoadAttempt((n) => n + 1)} />}
          </div>
        )}

        {view === "budget" && (
          <button onClick={() => setSheet({ kind: "add" })} aria-label="Add a bill" style={{
            position: "fixed", right: 20, bottom: "calc(22px + env(safe-area-inset-bottom))", zIndex: 50,
            width: 58, height: 58, borderRadius: "50%", border: "none", cursor: "pointer",
            background: D.amber, color: D.onAmber, display: "grid", placeItems: "center",
            boxShadow: `0 12px 30px -8px ${D.amber}`,
          }}>
            <Plus size={28} strokeWidth={2.6} />
          </button>
        )}

        {view === "logins" && !vaultKey && (
          <div style={{ ...glass.panel, padding: "26px 24px", borderRadius: 26, textAlign: "center" }}>
            <span style={{
              width: 48, height: 48, margin: "0 auto 16px", borderRadius: 17,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: theme.accentInk,
              background: `linear-gradient(140deg, ${theme.accentPlum}, ${theme.accent2})`,
              boxShadow: `0 10px 26px -10px ${theme.accentPlum}`,
            }}>
              <ShieldCheck size={22} />
            </span>

            {state.vaultMeta ? (
              <>
                <h2 style={{ ...display(20), margin: "0 0 6px" }}>Unlock your vault</h2>
                <p style={{ margin: "0 0 18px", fontSize: 13.5, lineHeight: 1.55, color: theme.textMuted }}>
                  Your logins are end-to-end encrypted. Enter your passphrase to view them this visit.
                </p>

                {faceIdEnabledHere && (
                  <>
                    <button
                      onClick={unlockWithFaceId}
                      disabled={faceIdBusy}
                      style={{
                        ...accentButtonStyle(!faceIdBusy), width: "100%", display: "flex",
                        alignItems: "center", justifyContent: "center", gap: 8,
                        padding: 12, borderRadius: 14, fontSize: 13.5, fontWeight: 600, marginBottom: 14,
                      }}
                    >
                      <ScanFace size={16} />
                      {faceIdBusy ? "Checking…" : "Unlock with Face ID"}
                    </button>
                    <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14, color: theme.textFainter }}>
                      <span style={{ flex: 1, height: 1, background: theme.glassBorder2 }} />
                      <span style={{ fontSize: 11.5 }}>or use your passphrase</span>
                      <span style={{ flex: 1, height: 1, background: theme.glassBorder2 }} />
                    </div>
                  </>
                )}

                <input
                  type="password"
                  value={vaultPassphrase}
                  onChange={(e) => setVaultPassphrase(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && unlockVault()}
                  placeholder="Vault passphrase"
                  autoComplete="current-password"
                  style={{ ...vaultInput, marginBottom: 11 }}
                />
                {vaultError && <p style={{ fontSize: 12, color: theme.accentRed, margin: "0 0 11px" }}>{vaultError}</p>}
                <button
                  onClick={unlockVault}
                  disabled={vaultBusy || !vaultPassphrase}
                  style={{ ...accentButtonStyle(!vaultBusy && !!vaultPassphrase), width: "100%", padding: 12, borderRadius: 14, fontSize: 13.5, fontWeight: 600 }}
                >
                  {vaultBusy ? "Unlocking…" : "Unlock"}
                </button>
                <button
                  onClick={() => setShowForgotInfo((v) => !v)}
                  style={{ border: "none", background: "transparent", color: theme.textFainter, fontSize: 11.5, marginTop: 14, cursor: "pointer" }}
                >
                  Forgot your passphrase?
                </button>
                {showForgotInfo && (
                  <p style={{ fontSize: 11.5, lineHeight: 1.55, color: theme.textMuted, marginTop: 8, textAlign: "left" }}>
                    This vault is encrypted so that only your passphrase can unlock it — not even Claude or Firebase can read it. That means there's genuinely no way to recover it if it's forgotten. The rest of the budget (accounts, bills) is completely unaffected either way.
                  </p>
                )}
                {faceIdEnabledHere && (
                  <button
                    onClick={() => { removeFaceUnlock(); setFaceIdEnabledHere(false); }}
                    style={{ border: "none", background: "transparent", color: theme.textFainter, fontSize: 11.5, marginTop: 8, cursor: "pointer", display: "block", width: "100%" }}
                  >
                    Remove Face ID from this device
                  </button>
                )}
              </>
            ) : (
              <>
                <h2 style={{ ...display(20), margin: "0 0 6px" }}>Set up your vault</h2>
                <p style={{ margin: "0 0 18px", fontSize: 13.5, lineHeight: 1.55, color: theme.textMuted }}>
                  Choose a passphrase to encrypt your logins. This is separate from your Google sign-in, and it's the only key — there's no recovery if it's forgotten.
                </p>
                <input
                  type="password"
                  value={vaultPassphrase}
                  onChange={(e) => setVaultPassphrase(e.target.value)}
                  placeholder="Create a passphrase (8+ characters)"
                  autoComplete="new-password"
                  style={{ ...vaultInput, marginBottom: 9 }}
                />
                <input
                  type="password"
                  value={vaultConfirm}
                  onChange={(e) => setVaultConfirm(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createVault()}
                  placeholder="Confirm passphrase"
                  autoComplete="new-password"
                  style={{ ...vaultInput, marginBottom: 11 }}
                />
                {vaultError && <p style={{ fontSize: 12, color: theme.accentRed, margin: "0 0 11px" }}>{vaultError}</p>}
                <button
                  onClick={createVault}
                  disabled={vaultBusy || !vaultPassphrase || !vaultConfirm}
                  style={{ ...accentButtonStyle(!vaultBusy && !!vaultPassphrase && !!vaultConfirm), width: "100%", padding: 12, borderRadius: 14, fontSize: 13.5, fontWeight: 600 }}
                >
                  {vaultBusy ? "Creating…" : "Create vault"}
                </button>
              </>
            )}
          </div>
        )}

        {view === "logins" && vaultKey && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 13 }}>
              <h2 style={{ ...display(17), margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <KeyRound size={17} color={theme.accentPlum} />
                Bill logins
              </h2>
              <span style={{ fontFamily: MONO, fontSize: 11.5, color: theme.textFainter }}>
                {(state.logins || []).length} saved
              </span>
            </div>

            {(state.logins || []).length === 0 && (
              <div style={{ padding: "30px 16px", borderRadius: 20, border: `1px dashed ${theme.glassBorder2}`, textAlign: "center", fontSize: 13, color: theme.textFainter }}>
                No logins saved yet. Add a bill's website, username, and password below.
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {sortedLogins.map((login, idx) => {
                const passwordVisible = !!visiblePasswords[login.id];
                const href = login.url
                  ? (/^https?:\/\//i.test(login.url) ? login.url : `https://${login.url}`)
                  : undefined;
                return (
                  <div
                    key={login.id}
                    style={{
                      ...glass.card, padding: 15, borderRadius: 22,
                      display: "flex", flexDirection: "column", gap: 9,
                      animation: `rowIn .4s ${EASE_OUT} ${Math.min(idx, 12) * 0.035}s both`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <input
                        type="text"
                        value={login.name}
                        onChange={(e) => updateLogin(login.id, { name: e.target.value })}
                        placeholder="Bill name"
                        style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, color: theme.textPrimary, background: "transparent", border: "none", padding: 0 }}
                      />
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open in your default browser"
                        style={{ padding: 5, borderRadius: 9, color: theme.textFainter, display: "flex", ...(login.url ? null : { opacity: 0.35, pointerEvents: "none" }) }}
                      >
                        <ExternalLink size={15} />
                      </a>
                      <IconAction onClick={() => deleteLogin(login.id)} title="Delete login" hoverColor={theme.accentRed}>
                        <Trash2 size={15} />
                      </IconAction>
                    </div>

                    <VaultField label="Website">
                      <input
                        type="text"
                        value={login.url}
                        onChange={(e) => updateLogin(login.id, { url: e.target.value })}
                        placeholder="example.com"
                        style={vaultValueStyle}
                      />
                      {login.url && (
                        <IconAction
                          onClick={() => copyToClipboard(href, `${login.id}-url`)}
                          title="Copy link"
                          hoverColor={theme.accentPlum}
                          active={copiedFlag === `${login.id}-url`}
                          activeColor={theme.accentPlum}
                          size={4}
                        >
                          {copiedFlag === `${login.id}-url` ? <Check size={14} /> : <Copy size={14} />}
                        </IconAction>
                      )}
                    </VaultField>

                    <VaultField label="Username">
                      <input
                        type="text"
                        value={login.username}
                        onChange={(e) => updateLogin(login.id, { username: e.target.value })}
                        placeholder="username or email"
                        style={vaultValueStyle}
                      />
                      <IconAction
                        onClick={() => copyToClipboard(login.username, `${login.id}-user`)}
                        title="Copy username"
                        hoverColor={theme.accentPlum}
                        active={copiedFlag === `${login.id}-user`}
                        activeColor={theme.accentPlum}
                        size={4}
                      >
                        {copiedFlag === `${login.id}-user` ? <Check size={14} /> : <Copy size={14} />}
                      </IconAction>
                    </VaultField>

                    <VaultField label="Password">
                      <input
                        type={passwordVisible ? "text" : "password"}
                        value={decryptedPasswords[login.id] ?? ""}
                        onChange={(e) => updateLoginPassword(login.id, e.target.value)}
                        placeholder="password"
                        autoComplete="new-password"
                        style={vaultValueStyle}
                      />
                      <IconAction
                        onClick={() => togglePasswordVisible(login.id)}
                        title={passwordVisible ? "Hide password" : "Show password"}
                        hoverColor={theme.accentPlum}
                        size={4}
                      >
                        {passwordVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                      </IconAction>
                      <IconAction
                        onClick={() => copyToClipboard(decryptedPasswords[login.id] || "", `${login.id}-pass`)}
                        title="Copy password"
                        hoverColor={theme.accentPlum}
                        active={copiedFlag === `${login.id}-pass`}
                        activeColor={theme.accentPlum}
                        size={4}
                      >
                        {copiedFlag === `${login.id}-pass` ? <Check size={14} /> : <Copy size={14} />}
                      </IconAction>
                    </VaultField>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 18, paddingTop: 18, borderTop: `1px solid ${theme.glassBorder2}`, display: "flex", flexDirection: "column", gap: 9 }}>
              <input
                type="text"
                autoComplete="off"
                placeholder="Bill name (e.g. Electric Co.)"
                value={newLogin.name}
                onChange={(e) => setNewLogin((n) => ({ ...n, name: e.target.value }))}
                style={vaultInput}
              />
              <input
                type="url"
                autoComplete="url"
                placeholder="Website URL"
                value={newLogin.url}
                onChange={(e) => setNewLogin((n) => ({ ...n, url: e.target.value }))}
                style={vaultInput}
              />
              <input
                type="text"
                autoComplete="username"
                placeholder="Username"
                value={newLogin.username}
                onChange={(e) => setNewLogin((n) => ({ ...n, username: e.target.value }))}
                style={vaultInput}
              />
              <input
                type="text"
                autoComplete="new-password"
                placeholder="Password"
                value={newLogin.password}
                onChange={(e) => setNewLogin((n) => ({ ...n, password: e.target.value }))}
                style={{ ...vaultInput, fontFamily: MONO }}
              />
              <button
                onClick={addLogin}
                disabled={!newLogin.name.trim()}
                style={{
                  ...accentButtonStyle(!!newLogin.name.trim()), width: "100%",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: 12, borderRadius: 14, fontSize: 13.5, fontWeight: 600,
                }}
              >
                <Plus size={16} />
                Add login
              </button>
            </div>

            <p style={{ margin: "16px 0 0", fontSize: 11.5, lineHeight: 1.55, textAlign: "center", color: theme.textFainter }}>
              End-to-end encrypted, unlocked only by your vault passphrase — not even Claude or Firebase can read your saved passwords.
            </p>
          </>
        )}

        {saveError && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginTop: 16,
            padding: "11px 14px", borderRadius: 14, fontSize: 12.5,
            color: theme.accentRed, background: mix(theme.accentRed, 12),
            border: `1px solid ${mix(theme.accentRed, 30)}`,
          }}>
            <AlertCircle size={14} />
            Couldn't save your changes — they may not persist after you close this.
          </div>
        )}
        </div>
      </div>

      {offerFaceId && (
        <BudgetModal onClose={declineFaceId} icon={<ScanFace size={22} />} title="Enable Face ID?">
          <p style={{ margin: "0 0 16px", fontSize: 13.5, lineHeight: 1.55, color: theme.textMuted }}>
            Unlock your logins with Face ID on this device instead of typing your passphrase each visit. Your passphrase stays the real key — this just lets Face ID release it faster on this specific device.
          </p>
          {faceIdMsg && <p style={{ fontSize: 12, color: theme.accentRed, marginBottom: 12 }}>{faceIdMsg}</p>}
          <button
            onClick={confirmEnableFaceId}
            disabled={faceIdBusy}
            style={{
              ...accentButtonStyle(!faceIdBusy), width: "100%", display: "flex",
              alignItems: "center", justifyContent: "center", gap: 8,
              padding: 12, borderRadius: 14, fontSize: 13.5, fontWeight: 600, marginBottom: 8,
            }}
          >
            <ScanFace size={16} />
            {faceIdBusy ? "Setting up…" : "Enable Face ID"}
          </button>
          <button onClick={declineFaceId} style={modalDismissStyle}>Not now</button>
        </BudgetModal>
      )}


      {confirmReset && (
        <BudgetModal onClose={() => setConfirmReset(false)} icon={<AlertCircle size={22} />} tone="red" title="Reset all bills to Unpaid?">
          <p style={{ margin: "0 0 16px", fontSize: 13.5, lineHeight: 1.55, color: theme.textMuted }}>
            This resets every bill on both the 15th and the 30th back to Unpaid, clearing all Scheduled, No payment needed, and Payment complete statuses.
          </p>
          <button onClick={doResetAllToUnpaid} style={dangerButtonStyle}>Reset all to Unpaid</button>
          <button onClick={() => setConfirmReset(false)} style={modalDismissStyle}>Cancel</button>
        </BudgetModal>
      )}

      {/* Add-bill form, anchored to the very top of the screen so it opens
          above the keyboard on mobile rather than being pushed behind it. */}
      {sheet?.kind === "add" && (
        <AddBillSheet period={period} accounts={state.accounts} loginNames={sortedLoginNames}
          onClose={() => setSheet(null)}
          onAdd={(b) => {
            const amount = parseFloat(b.amount);
            if (!b.name.trim() || !Number.isFinite(amount)) return;
            setState((s) => ({
              ...s,
              bills: [...s.bills, {
                id: uid(), name: b.name.trim(), amount, dueDate: b.dueDate === "30" ? "30" : "15",
                bankId: b.bankId, status: "unpaid", paidAt: null,
              }],
            }));
            if (b.dueDate !== period) setPeriod(b.dueDate);
            setSheet(null);
          }} />
      )}
      {sheet?.kind === "bill" && (() => {
        const bill = state.bills.find((x) => x.id === sheet.id);
        if (!bill) return null;
        return (
          <BillSheet bill={bill} accounts={state.accounts} loginNames={sortedLoginNames}
            loginUrl={billLoginUrl(bill.name)}
            onStatus={(s) => setStatus(bill, s)}
            onUpdate={(patch) => updateBill(bill.id, patch)}
            onDelete={() => { deleteBill(bill.id); setSheet(null); }}
            onClose={() => setSheet(null)} />
        );
      })()}
      {sheet?.kind === "account" && (() => {
        const acc = state.accounts.find((a) => a.id === sheet.id);
        if (!acc) return null;
        return (
          <AccountSheet account={acc} period={period} assigned={accountTotal(acc.id, period)}
            canDelete
            onRename={(name) => updateAccountName(acc.id, name)}
            onBalance={(v) => updateAccountBalance(acc.id, v, period)}
            onDelete={() => {
              setState((s) => ({
                ...s,
                accounts: s.accounts.filter((a) => a.id !== acc.id),
                bills: s.bills.map((b) => (b.bankId === acc.id ? { ...b, bankId: "" } : b)),
              }));
              setSheet(null);
            }}
            onClose={() => setSheet(null)} />
        );
      })()}
    </div>
  );
}

// A labelled vault row: monospace value with its reveal/copy buttons.
const vaultValueStyle = {
  flex: 1, minWidth: 0, fontFamily: MONO, fontSize: 12.5,
  color: theme.textPrimary, background: "transparent", border: "none", padding: 0,
  overflow: "hidden", textOverflow: "ellipsis",
};

function VaultField({ label, children }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 9, padding: "9px 11px", borderRadius: 12,
      background: theme.inputBg, border: `1px solid ${theme.glassBorder2}`,
    }}>
      <span style={{ width: 62, flexShrink: 0, fontSize: 11, fontWeight: 600, color: theme.textFainter }}>{label}</span>
      {children}
    </div>
  );
}

const modalDismissStyle = {
  border: "none", background: "transparent", color: theme.textMuted,
  fontSize: 13, cursor: "pointer", padding: "8px 0", width: "100%",
};

const dangerButtonStyle = {
  width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  padding: 12, borderRadius: 14, fontSize: 13.5, fontWeight: 600, marginBottom: 8,
  color: theme.accentInk, background: theme.accentRed, border: "none", cursor: "pointer",
  boxShadow: `0 10px 26px -10px ${theme.accentRed}`,
};

// Raised-glass confirm dialog shared by the three Budget prompts.
function BudgetModal({ onClose, icon, title, tone, children }) {
  const accent = tone === "red" ? theme.accentRed : theme.accentPlum;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200, background: theme.scrim,
        backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
        display: "flex", justifyContent: "center", padding: 20,
        animation: "fadeIn .2s ease",
        // Auto margins on the card centre it when it fits and collapse to 0 when
        // it doesn't, so a tall dialog can never put its own top off-screen the
        // way `align-items: center` does. See the Telegram wizard in App.jsx.
        alignItems: "flex-start", overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ ...glass.raised, maxWidth: 360, width: "100%", padding: 22, borderRadius: 28, textAlign: "center", margin: "auto 0", animation: `popIn .3s ${SPRING}` }}
      >
        <span style={{
          width: 48, height: 48, margin: "0 auto 16px", borderRadius: 17,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: theme.accentInk,
          background: tone === "red" ? accent : `linear-gradient(140deg, ${theme.accentPlum}, ${theme.accent2})`,
          boxShadow: `0 10px 26px -10px ${accent}`,
        }}>
          {icon}
        </span>
        <h2 style={{ ...display(20), margin: "0 0 6px" }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
