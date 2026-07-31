import { useState, useEffect, useRef } from "react";
import { theme, glass, SPRING, EASE_OUT } from "./theme";
import { MONO, display, mix, accentButtonStyle, IconAction, GlassBackdrop } from "./ui";
import {
  Plus,
  Trash2,
  Check,
  PiggyBank,
  Wallet,
  AlertCircle,
  PartyPopper,
  ArrowLeft,
  ExternalLink,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  ScanFace,
  Receipt,
  RotateCcw,
  Landmark,
} from "lucide-react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { generateSaltB64, deriveKey, encryptText, decryptText, makeVerifier, checkVerifier } from "./vaultCrypto";
import { platformAuthAvailable, hasFaceUnlock, registerFaceUnlock, tryFaceUnlock, removeFaceUnlock } from "./faceUnlock";

// Everything lives in one shared Firestore document so both of you see
// the same data. Change this id if you ever want a second household.

const STATUS_LABELS = {
  unpaid: "Unpaid",
  scheduled: "Scheduled",
  skip: "No payment needed",
  paid: "Payment complete",
};

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

function money(n) {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function todayStamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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
  const [newBill, setNewBill] = useState({ name: "", amount: "", bankId: "a1" });
  const [editingAccountId, setEditingAccountId] = useState(null);
  const [revealAll, setRevealAll] = useState(false); // session-only: not saved
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

  useEffect(() => {
    (async () => {
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
      } catch (e) {
        console.error("Failed to load household data:", e);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

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

  // What actually renders in the list: everything, unless a bill is paid/skip
  // AND we haven't just exported (revealAll brings hidden rows back for review).
  // Sorted largest amount first.
  const visibleBills = (revealAll
    ? billsThisPeriod
    : billsThisPeriod.filter((b) => b.status !== "paid" && b.status !== "skip")
  )
    .slice()
    .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0));

  const sortedLogins = (state.logins || [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const sortedLoginNames = Array.from(new Set(sortedLogins.map((l) => l.name).filter(Boolean))).sort(
    (a, b) => a.localeCompare(b)
  );

  function accountName(bankId) {
    return state.accounts.find((a) => a.id === bankId)?.name || bankId;
  }

  function billLoginUrl(billName) {
    const login = (state.logins || []).find((l) => l.name === billName);
    if (!login || !login.url) return null;
    return /^https?:\/\//i.test(login.url) ? login.url : `https://${login.url}`;
  }

  function accountTotal(bankId) {
    return state.bills
      .filter((b) => b.dueDate === period && b.bankId === bankId && b.status !== "skip")
      .reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  }

  function updateAccountBalance(accountId, value) {
    setState((s) => ({
      ...s,
      accounts: s.accounts.map((a) =>
        a.id === accountId
          ? { ...a, balances: { ...a.balances, [period]: value === "" ? "" : Number(value) } }
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
  function deleteAccount(accountId) {
    setConfirmDelete(accountId);
  }
  function confirmDeleteAccount() {
    const accountId = confirmDelete;
    setConfirmDelete(null);
    if (!accountId) return;
    setState((s) => ({
      ...s,
      accounts: s.accounts.filter((a) => a.id !== accountId),
      bills: s.bills.map((b) => (b.bankId === accountId ? { ...b, bankId: "" } : b)),
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
  const [showAccounts, setShowAccounts] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);

  function addBill() {
    const amount = parseFloat(newBill.amount);
    if (!newBill.name.trim() || !Number.isFinite(amount)) return;
    setState((s) => ({
      ...s,
      bills: [
        ...s.bills,
        {
          id: uid(),
          name: newBill.name.trim(),
          amount,
          dueDate: period,
          bankId: newBill.bankId,
          status: "unpaid",
          paidAt: null,
        },
      ],
    }));
    setNewBill({ name: "", amount: "", bankId: newBill.bankId });
  }

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

  function unhideAll() {
    setRevealAll(true);
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

  const periodLabel = period === "15" ? "the 15th" : "the 30th";

  // Segmented control: accent-filled when active, transparent when not.
  const segStyle = (on) => ({
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6, flex: 1,
    padding: "9px 16px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer",
    border: "none",
    color: on ? theme.accentInk : theme.textMuted,
    background: on ? `linear-gradient(140deg, ${theme.accentPlum}, ${theme.accent2})` : "transparent",
    boxShadow: on ? `0 8px 20px -10px ${theme.accentPlum}` : "none",
    transition: `all .35s ${SPRING}`,
  });

  const fieldSm = {
    padding: "7px 11px", borderRadius: 11, fontSize: 12.5,
    color: theme.textSecondary, background: theme.inputBg,
    border: `1px solid ${theme.glassBorder2}`, cursor: "pointer",
  };
  const moneyInput = {
    padding: "7px 11px", borderRadius: 11, fontFamily: MONO, fontSize: 13, textAlign: "right",
    color: theme.textPrimary, background: theme.inputBg, border: `1px solid ${theme.glassBorder2}`,
  };
  const vaultInput = {
    width: "100%", padding: "11px 13px", borderRadius: 14, fontSize: 14,
    color: theme.textPrimary, background: theme.inputBg, border: `1px solid ${theme.glassBorder2}`,
  };

  return (
    <div
      className="orbit-shell"
      style={{
        position: "relative", overflow: "hidden", display: "flex", flexDirection: "column",
        color: theme.textPrimary, fontFamily: "'Geist', system-ui, sans-serif",
      }}
    >
      <GlassBackdrop />

      <div style={{
        position: "relative", zIndex: 1, width: "100%", maxWidth: 720, margin: "0 auto",
        flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
        padding: "24px 20px 0", animation: `screenIn .45s ${EASE_OUT}`,
      }}>
        {onBack && (
          <button
            onClick={onBack}
            style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, marginBottom: 20, fontSize: 13.5, color: theme.textMuted, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
          >
            <ArrowLeft size={16} />
            Back to Orbit
          </button>
        )}

        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
          <span style={{
            width: 40, height: 40, borderRadius: 14, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: theme.accentInk,
            background: `linear-gradient(140deg, ${theme.accentPlum}, ${theme.accent2})`,
            boxShadow: `0 10px 26px -10px ${theme.accentPlum}`,
          }}>
            <Wallet size={19} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ ...display(30, "-.03em"), margin: 0, lineHeight: 1 }}>{title}</h1>
            <p style={{ margin: "5px 0 0", fontSize: 13.5, color: theme.textMuted }}>Biweekly budget</p>
          </div>
        </div>

        <div style={{
          ...glass.card, flexShrink: 0, display: "flex", gap: 4, padding: 5, borderRadius: 999, marginBottom: 16,
        }}>
          <button style={segStyle(view === "budget")} onClick={() => setView("budget")}>
            <Receipt size={14} />
            Budget
          </button>
          <button style={segStyle(view === "logins")} onClick={() => setView("logins")}>
            <KeyRound size={14} />
            Logins
          </button>
        </div>

        {/* Everything below the Budget/Logins switch is the only scroller. */}
        <div className="orbit-scroll" style={{ flex: 1, minHeight: 0, paddingBottom: 90 }}>

        {view === "budget" && (
          <>
            <div style={{ display: "flex", gap: 4, padding: 5, borderRadius: 999, marginBottom: 18, maxWidth: 280, background: theme.inputBg, border: `1px solid ${theme.glassBorder2}` }}>
              <button style={segStyle(period === "15")} onClick={() => setPeriod("15")}>15th</button>
              <button style={segStyle(period === "30")} onClick={() => setPeriod("30")}>30th</button>
            </div>

            {showAccounts && (
              <div style={{ display: "flex", gap: 11, flexWrap: "wrap", marginBottom: 20 }}>
                {state.accounts.map((acc) => {
                  const spent = accountTotal(acc.id);
                  const balanceRaw = acc.balances?.[period];
                  const balance = balanceRaw === "" || balanceRaw === undefined ? 0 : Number(balanceRaw);
                  const remaining = balance - spent;
                  return (
                    <div key={acc.id} style={{ ...glass.card, flex: "1 1 180px", minWidth: 0, padding: 15, borderRadius: 22 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 11 }}>
                        <Landmark size={15} color={theme.accentPlum} style={{ flexShrink: 0 }} />
                        <input
                          type="text"
                          value={acc.name}
                          onChange={(e) => updateAccountName(acc.id, e.target.value)}
                          onFocus={() => setEditingAccountId(acc.id)}
                          onBlur={() => setEditingAccountId(null)}
                          title="Tap to rename"
                          style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: theme.textPrimary, background: "transparent", border: "none", padding: 0 }}
                        />
                        <IconAction onClick={() => deleteAccount(acc.id)} title="Delete account" hoverColor={theme.accentRed} size={3}>
                          <Trash2 size={14} />
                        </IconAction>
                      </div>

                      <label style={{ display: "block", fontSize: 11, color: theme.textFainter, marginBottom: 5 }}>
                        Available {periodLabel}
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={balanceRaw === undefined ? "" : balanceRaw}
                        onChange={(e) => updateAccountBalance(acc.id, e.target.value)}
                        placeholder="0.00"
                        style={{
                          width: "100%", padding: "8px 11px", borderRadius: 12, marginBottom: 11,
                          fontFamily: MONO, fontSize: 15, fontWeight: 600,
                          color: theme.textPrimary, background: theme.inputBg, border: `1px solid ${theme.glassBorder2}`,
                        }}
                      />

                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: theme.textMuted }}>
                        <span>Assigned</span>
                        <span style={{ fontFamily: MONO }}>{money(spent)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7, paddingTop: 7, borderTop: `1px solid ${theme.glassBorder2}`, fontSize: 12, color: theme.textMuted }}>
                        <span>Left</span>
                        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: remaining < 0 ? theme.accentRed : theme.greenDot }}>
                          {money(remaining)}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {state.accounts.length < 3 && (
                  <button
                    onClick={addAccount}
                    style={{
                      flex: "1 1 180px", minWidth: 0, minHeight: 120, padding: 15, borderRadius: 22,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                      fontSize: 13, fontWeight: 500, cursor: "pointer",
                      color: theme.textFainter, background: theme.inputBg,
                      border: `1px dashed ${theme.glassBorder2}`,
                    }}
                  >
                    <Plus size={15} />
                    Add account
                  </button>
                )}
              </div>
            )}

            {allDone && (
              <div style={{
                display: "flex", alignItems: "center", gap: 13, padding: 16, borderRadius: 22, marginBottom: 18,
                background: `linear-gradient(140deg, ${theme.accentSoft}, ${theme.glassFill})`,
                border: `1px solid ${theme.accentPlum}`,
                boxShadow: `inset 0 1px 0 ${theme.glassSpec}`,
                animation: `popIn .4s ${SPRING}`,
              }}>
                <PartyPopper size={22} color={theme.accentPlum} style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 600 }}>Every bill for {periodLabel} is handled</div>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: theme.textMuted, marginTop: 3 }}>
                    {paidThisPeriod.length} paid · {skippedThisPeriod.length} no payment needed · {money(paidThisPeriod.reduce((s, b) => s + (Number(b.amount) || 0), 0))} total paid
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 13 }}>
              <h2 style={{ ...display(17), margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <PiggyBank size={17} color={theme.accentPlum} />
                Bills due {periodLabel}
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button
                  onClick={resetAllToUnpaid}
                  title="Reset every bill on both pay periods to Unpaid"
                  style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 500, color: theme.textFainter, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                >
                  <RotateCcw size={12} />
                  Reset all to unpaid
                </button>
                {!revealAll && resolvedCount > 0 && (
                  <button
                    onClick={unhideAll}
                    style={{ fontSize: 12, fontWeight: 500, color: theme.accentPlum, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    Unhide {resolvedCount} hidden
                  </button>
                )}
                <span style={{ fontFamily: MONO, fontSize: 11.5, color: theme.textFainter }}>{unresolved.length} open</span>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {visibleBills.length === 0 && (
                <div style={{ padding: "30px 16px", borderRadius: 20, border: `1px dashed ${theme.glassBorder2}`, textAlign: "center", fontSize: 13, color: theme.textFainter }}>
                  No bills here yet. Add one below to start allocating this pay period.
                </div>
              )}
              {visibleBills.map((bill, idx) => {
                const scheduled = bill.status === "scheduled";
                const resolved = bill.status === "paid" || bill.status === "skip";
                const loginUrl = billLoginUrl(bill.name);
                const statusTint =
                  bill.status === "paid" ? theme.accentPlum : scheduled ? theme.goldDot : null;
                return (
                  <div
                    key={bill.id}
                    style={{
                      padding: 14, borderRadius: 20, display: "flex", flexDirection: "column", gap: 11,
                      background: scheduled
                        ? `linear-gradient(157deg, ${theme.glassHigh}, ${mix(theme.goldDot, 12, theme.glassFill)})`
                        : `linear-gradient(157deg, ${theme.glassHigh}, ${theme.glassFill})`,
                      backdropFilter: "blur(20px) saturate(180%)",
                      WebkitBackdropFilter: "blur(20px) saturate(180%)",
                      border: `1px solid ${scheduled ? mix(theme.goldDot, 38, theme.glassBorder) : theme.glassBorder}`,
                      boxShadow: `inset 0 1px 0 ${theme.glassSpec}, 0 10px 28px -22px ${theme.glassShadow}`,
                      opacity: resolved ? 0.62 : 1,
                      transition: "all .3s ease",
                      animation: `rowIn .4s ${EASE_OUT} ${Math.min(idx, 12) * 0.035}s both`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <select
                        value={bill.name}
                        onChange={(e) => updateBill(bill.id, { name: e.target.value })}
                        style={{
                          flex: 1, minWidth: 0, padding: "8px 11px", borderRadius: 12,
                          fontSize: 14, fontWeight: 600, cursor: "pointer",
                          background: theme.inputBg, border: `1px solid ${theme.glassBorder2}`,
                          textDecoration: resolved ? "line-through" : "none",
                          color: resolved ? theme.textFainter : theme.textPrimary,
                        }}
                      >
                        {!sortedLoginNames.includes(bill.name) && bill.name && (
                          <option value={bill.name}>{bill.name} (no login saved)</option>
                        )}
                        {sortedLoginNames.length === 0 && !bill.name && <option value="">Add a login first</option>}
                        {sortedLoginNames.map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                      {loginUrl && (
                        <>
                          <a
                            href={loginUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`Open ${bill.name} in your default browser`}
                            style={{ flexShrink: 0, padding: 5, borderRadius: 9, color: theme.textFainter, display: "flex" }}
                          >
                            <ExternalLink size={15} />
                          </a>
                          <IconAction
                            onClick={() => copyToClipboard(loginUrl, `${bill.id}-link`)}
                            title="Copy link"
                            hoverColor={theme.accentPlum}
                            active={copiedFlag === `${bill.id}-link`}
                            activeColor={theme.accentPlum}
                          >
                            {copiedFlag === `${bill.id}-link` ? <Check size={14} /> : <Copy size={14} />}
                          </IconAction>
                        </>
                      )}
                      <IconAction onClick={() => deleteBill(bill.id)} title="Delete bill" hoverColor={theme.accentRed}>
                        <Trash2 size={15} />
                      </IconAction>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                      <select
                        value={bill.status}
                        onChange={(e) => setStatus(bill, e.target.value)}
                        style={{
                          padding: "7px 11px", borderRadius: 11, fontSize: 12, fontWeight: 600,
                          cursor: "pointer", flexShrink: 0,
                          color: statusTint || theme.textMuted,
                          background: statusTint ? mix(statusTint, 14) : theme.inputBg,
                          border: `1px solid ${statusTint ? mix(statusTint, 40) : theme.glassBorder2}`,
                        }}
                      >
                        <option value="unpaid">Unpaid</option>
                        <option value="scheduled">Scheduled</option>
                        <option value="skip">No payment needed</option>
                        <option value="paid">Payment complete</option>
                      </select>

                      <input
                        type="number"
                        inputMode="decimal"
                        value={bill.amount}
                        onChange={(e) => updateBill(bill.id, { amount: parseFloat(e.target.value) || 0 })}
                        style={{ ...moneyInput, width: 104 }}
                      />

                      <select
                        value={bill.bankId || ""}
                        onChange={(e) => updateBill(bill.id, { bankId: e.target.value })}
                        disabled={state.accounts.length === 0}
                        style={{ ...fieldSm, marginLeft: "auto", fontSize: 12, ...(state.accounts.length === 0 ? { opacity: 0.5, cursor: "not-allowed" } : null) }}
                      >
                        {state.accounts.length === 0 ? (
                          <option value="">No account</option>
                        ) : (
                          state.accounts.map((acc) => <option key={acc.id} value={acc.id}>{acc.name}</option>)
                        )}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 18, paddingTop: 18, borderTop: `1px solid ${theme.glassBorder2}`, display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
              <select
                value={newBill.name}
                onChange={(e) => setNewBill((n) => ({ ...n, name: e.target.value }))}
                style={{ ...fieldSm, flex: "1 1 160px", minWidth: 0, padding: "10px 13px", borderRadius: 13, fontSize: 13.5, color: theme.textPrimary }}
              >
                <option value="">{sortedLoginNames.length === 0 ? "Add a login first" : "Select a bill…"}</option>
                {sortedLoginNames.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <input
                type="number"
                inputMode="decimal"
                placeholder="Amount"
                value={newBill.amount}
                onChange={(e) => setNewBill((n) => ({ ...n, amount: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && addBill()}
                style={{ ...moneyInput, width: 112, flexShrink: 0, padding: "10px 13px", borderRadius: 13 }}
              />
              <select
                value={newBill.bankId}
                onChange={(e) => setNewBill((n) => ({ ...n, bankId: e.target.value }))}
                disabled={state.accounts.length === 0}
                style={{ ...fieldSm, flexShrink: 0, padding: "10px 13px", borderRadius: 13, fontSize: 13, ...(state.accounts.length === 0 ? { opacity: 0.5, cursor: "not-allowed" } : null) }}
              >
                {state.accounts.length === 0 ? (
                  <option value="">Add an account first</option>
                ) : (
                  state.accounts.map((acc) => <option key={acc.id} value={acc.id}>{acc.name}</option>)
                )}
              </select>
              <button
                onClick={addBill}
                disabled={!newBill.name.trim() || newBill.amount === ""}
                style={{
                  ...accentButtonStyle(!!newBill.name.trim() && newBill.amount !== ""),
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "10px 18px", borderRadius: 13, fontSize: 13, fontWeight: 600, flexShrink: 0,
                }}
              >
                <Plus size={15} />
                Add
              </button>
            </div>

            <p style={{ margin: "16px 0 0", fontSize: 11.5, lineHeight: 1.55, textAlign: "center", color: theme.textFainter }}>
              Bill status saves automatically. Mark a bill "no payment needed" or "payment complete" and it steps out of the way — unhide brings everything back for a check without changing anything.
            </p>

            {/* Floating bubble: minimises the account cards, and shows each
                account's remaining balance while they're collapsed. */}
            <button
              onClick={() => setShowAccounts((v) => !v)}
              title={showAccounts ? "Minimize accounts" : "Expand accounts"}
              style={{
                position: "fixed", right: 24, bottom: 24, minWidth: 54, height: 54, padding: "0 18px",
                borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 14,
                zIndex: 45, border: "none", cursor: "pointer",
                color: theme.accentInk,
                background: `linear-gradient(140deg, ${theme.accentPlum}, ${theme.accent2})`,
                boxShadow: `0 14px 34px -10px ${theme.accentPlum}, inset 0 1px 0 rgba(255,255,255,.4)`,
                transition: `all .4s ${SPRING}`,
              }}
            >
              {showAccounts ? (
                <Landmark size={20} />
              ) : state.accounts.length > 0 ? (
                state.accounts.map((acc, idx) => {
                  const balanceRaw = acc.balances?.[period];
                  const balance = balanceRaw === "" || balanceRaw === undefined ? 0 : Number(balanceRaw);
                  const remaining = balance - accountTotal(acc.id);
                  return (
                    <span key={acc.id} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      {idx > 0 && <span style={{ width: 1, height: 26, background: "rgba(255,255,255,.28)" }} />}
                      <span style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.15 }}>
                        <span style={{ fontSize: 9.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", opacity: 0.8, maxWidth: 62, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {acc.name}
                        </span>
                        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
                          {money(remaining)}
                        </span>
                      </span>
                    </span>
                  );
                })
              ) : (
                <Landmark size={20} />
              )}
            </button>
          </>
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

      {confirmDelete && (
        <BudgetModal onClose={() => setConfirmDelete(null)} icon={<Trash2 size={22} />} tone="red" title="Delete this account?">
          <p style={{ margin: "0 0 16px", fontSize: 13.5, lineHeight: 1.55, color: theme.textMuted }}>
            This can't be undone. Any bills assigned to it will be left without an account.
          </p>
          <button onClick={confirmDeleteAccount} style={dangerButtonStyle}>
            <Trash2 size={16} />
            Delete account
          </button>
          <button onClick={() => setConfirmDelete(null)} style={modalDismissStyle}>Cancel</button>
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
