import { useState, useEffect, useRef } from "react";
import { theme } from "./theme";
import {
  Plus,
  Trash2,
  Check,
  PiggyBank,
  Wallet,
  Loader2,
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
      <div className="app-shell flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin" size={28} color={theme.accentPlum} />
      </div>
    );
  }

  const periodLabel = period === "15" ? "the 15th" : "the 30th";

  return (
    <div className="app-shell min-h-screen w-full">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;600&display=swap');

        .app-shell {
          background:
            radial-gradient(1100px 550px at 8% -10%, rgba(125,85,104,0.10), transparent 60%),
            radial-gradient(900px 480px at 105% 5%, rgba(201,154,62,0.10), transparent 55%),
            ${theme.gradA};
          font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
          color: ${theme.textPrimary};
          height: 100vh;
          height: 100dvh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .fixed-zone {
          flex-shrink: 0;
          border-bottom: 1px solid ${theme.borderSoft};
          box-shadow: 0 6px 16px -12px rgba(0,0,0,0.15);
          background: linear-gradient(180deg, ${theme.cardBg}, ${theme.gradB});
          position: relative;
          z-index: 10;
        }
        .scroll-zone {
          flex: 1 1 auto;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }
        .font-display { font-family: 'Fraunces', Georgia, serif; }
        .font-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }

        .header-band {
          background: transparent;
        }
        .ledger-glow { background: linear-gradient(90deg, ${theme.accentPlum}, ${theme.goldDot}); }

        .card {
          background: ${theme.cardBg};
          border: 1px solid ${theme.borderSoft};
          border-radius: 18px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 16px 32px -24px rgba(0,0,0,0.12);
        }

        .account-card {
          position: relative;
          overflow: hidden;
          border-radius: 16px;
          padding: 0.75rem 0.85rem;
          border: 1px solid ${theme.borderSoft};
          background: ${theme.cardBg};
          box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 16px 32px -24px rgba(0,0,0,0.12);
          min-width: 0;
        }
        .account-card.acc-a1 { background: linear-gradient(135deg, rgba(125,85,104,0.12), ${theme.cardBg} 65%); }
        .account-card.acc-a2 { background: linear-gradient(135deg, rgba(201,154,62,0.12), ${theme.cardBg} 65%); }
        .account-card::after {
          content: '';
          position: absolute;
          right: -30px; top: -30px;
          width: 140px; height: 140px;
          border-radius: 999px;
          background: radial-gradient(circle, ${theme.borderSoft}, transparent 70%);
          pointer-events: none;
        }
        .main-tab-toggle {
          display: inline-flex;
          padding: 4px;
          border-radius: 999px;
          background: ${theme.cardBg};
          border: 1px solid ${theme.borderSoft};
        }
        .main-tab-pill {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.45rem 0.95rem;
          border-radius: 999px;
          font-family: 'Fraunces', Georgia, serif;
          font-weight: 600;
          font-size: 0.82rem;
          color: ${theme.budgetMuted};
          transition: all 0.15s ease;
          cursor: pointer;
          border: none;
          background: transparent;
        }
        .main-tab-pill.active {
          background: ${theme.textPrimary};
          color: ${theme.cardBg};
        }

        .period-toggle {
          display: inline-flex;
          padding: 4px;
          border-radius: 999px;
          background: ${theme.cardBg};
          border: 1px solid ${theme.borderSoft};
        }
        .period-pill {
          padding: 0.5rem 1.1rem;
          border-radius: 999px;
          font-family: 'Fraunces', Georgia, serif;
          font-weight: 600;
          font-size: 0.9rem;
          color: ${theme.budgetMuted};
          transition: all 0.15s ease;
          cursor: pointer;
          border: none;
          background: transparent;
        }
        .period-pill.active {
          background: linear-gradient(90deg, ${theme.accentPlum}, ${theme.goldDot});
          color: ${theme.prefersDark ? theme.textPrimary : theme.cardBg};
        }

        .bank-chip {
          font-family: 'Fraunces', Georgia, serif;
          font-weight: 600;
          font-size: 0.78rem;
          padding: 0.35rem 0.7rem;
          border-radius: 10px;
          border: 1px solid ${theme.borderSoft};
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
          background: ${theme.cardBg};
        }
        .bank-chip.chip-a1.selected { background: rgba(125,85,104,0.12); border-color: ${theme.accentPlum}; color: ${theme.accentPlum}; }
        .bank-chip.chip-a2.selected { background: rgba(201,154,62,0.12); border-color: ${theme.goldDot}; color: ${theme.goldDot}; }
        .bank-chip:not(.selected) { color: ${theme.budgetBorder}; }

        .bill-row {
          border: 1px solid ${theme.borderSoft};
          border-radius: 14px;
          background: ${theme.softBg3};
          transition: background-color 0.15s ease, border-color 0.15s ease, opacity 0.2s ease;
        }
        .bill-row:hover { border-color: ${theme.border}; }

        .row-scheduled {
          background: ${theme.paleYellowBg2};
          border-color: ${theme.goldLight};
        }

        .row-resolved {
          background: ${theme.softBg4};
          opacity: 0.78;
        }

        .status-select {
          font-family: 'Fraunces', Georgia, serif;
          font-weight: 600;
          font-size: 0.78rem;
          padding: 0.4rem 0.5rem;
          border-radius: 10px;
          border: 1px solid ${theme.borderSoft2};
          background: ${theme.cardBg};
          color: ${theme.textPrimary};
          flex-shrink: 0;
        }
        .status-select:focus {
          outline: none;
          border-color: ${theme.accentPlum};
          box-shadow: 0 0 0 3px rgba(125,85,104,0.14);
        }
        .status-select.select-scheduled { border-color: ${theme.goldDark}; color: ${theme.goldText}; background: ${theme.paleYellowBg}; }
        .status-select.select-paid { border-color: ${theme.accentPlum}; color: ${theme.accentPlum}; background: ${theme.softBg2}; }
        .status-select.select-skip { border-color: ${theme.budgetBorder}; color: ${theme.budgetMuted}; background: ${theme.softBg4}; }

        input[type="text"], input[type="number"], select {
          background: ${theme.cardBg};
          border: 1px solid ${theme.borderSoft2};
          border-radius: 10px;
          color: ${theme.textPrimary};
          font-family: 'Inter', sans-serif;
        }
        input[type="text"]:focus, input[type="number"]:focus, select:focus {
          outline: none;
          border-color: ${theme.accentPlum};
          box-shadow: 0 0 0 3px rgba(125,85,104,0.14);
        }

        .add-btn {
          background: linear-gradient(90deg, ${theme.accentPlum}, ${theme.goldDot});
          color: ${theme.prefersDark ? theme.textPrimary : theme.cardBg};
          font-family: 'Fraunces', Georgia, serif;
          font-weight: 700;
        }
        .add-btn:hover { filter: brightness(1.06); }
        .add-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .celebrate-card {
          background: linear-gradient(135deg, rgba(125,85,104,0.10), rgba(201,154,62,0.10));
          border: 1px solid ${theme.accentPlum}40;
          border-radius: 18px;
        }

        .tag {
          font-size: 0.68rem;
          font-weight: 600;
          padding: 0.15rem 0.5rem;
          border-radius: 999px;
          flex-shrink: 0;
        }
        .tag-paid { background: rgba(125,85,104,0.14); color: ${theme.accentPlum}; }
        .tag-skip { background: rgba(100,116,139,0.14); color: ${theme.budgetMuted}; }

        .unhide-btn {
          font-family: 'Fraunces', Georgia, serif;
          font-weight: 600;
          font-size: 0.78rem;
          color: ${theme.goldDot};
          background: transparent;
          border: none;
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 2px;
        }

        .login-row {
          border: 1px solid ${theme.borderSoft};
          border-radius: 14px;
          background: ${theme.softBg3};
          padding: 0.9rem 0.95rem;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }
        .login-row-head {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .login-site-link {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-family: 'Fraunces', Georgia, serif;
          font-weight: 600;
          font-size: 0.92rem;
          color: ${theme.goldDot};
          text-decoration: none;
          min-width: 0;
        }
        .login-site-link:hover { text-decoration: underline; }
        .login-site-link span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .login-field-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: ${theme.cardBg};
          border: 1px solid ${theme.borderSoft};
          border-radius: 10px;
          padding: 0.4rem 0.5rem 0.4rem 0.7rem;
        }
        .login-field-label {
          font-size: 0.68rem;
          font-weight: 600;
          color: ${theme.budgetBorder};
          width: 62px;
          flex-shrink: 0;
        }
        .login-field-value {
          flex: 1;
          min-width: 0;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 0.82rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: ${theme.textPrimary};
        }
        .icon-btn {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          border-radius: 8px;
          border: none;
          background: transparent;
          color: ${theme.budgetMuted};
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease;
        }
        .icon-btn:hover { background: rgba(201,154,62,0.1); color: ${theme.goldDot}; }
        .icon-btn.copied { color: ${theme.accentPlum}; }

        .name-select {
          background: ${theme.cardBg};
          border: 1px solid ${theme.borderSoft2};
          border-radius: 10px;
          color: ${theme.textPrimary};
          font-family: 'Inter', sans-serif;
        }
        .name-select:focus {
          outline: none;
          border-color: ${theme.accentPlum};
          box-shadow: 0 0 0 3px rgba(125,85,104,0.14);
        }
      `}</style>

      <div className="fixed-zone">
        <div className="header-band px-5 sm:px-8 pt-5 pb-2">
          {onBack && (
            <button
              onClick={onBack}
              style={{
                display: "flex", alignItems: "center", gap: 4, border: "none", background: "transparent",
                color: theme.textMuted, fontSize: 12, fontWeight: 700, padding: 0, marginBottom: 10, cursor: "pointer",
              }}
            >
              <ArrowLeft size={14} />
              Back to Orbit
            </button>
          )}
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
            {title}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="h-1.5 w-1.5 rounded-full ledger-glow" style={{ display: "inline-block" }} />
            <p className="text-sm sm:text-base" style={{ color: theme.textMuted }}>
              Biweekly Budget
            </p>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-3 pb-4 flex flex-col gap-3">
          <div className="flex justify-center">
            <div className="main-tab-toggle">
              <button className={`main-tab-pill ${view === "budget" ? "active" : ""}`} onClick={() => setView("budget")}>
                <Receipt size={14} />
                Budget
              </button>
              <button className={`main-tab-pill ${view === "logins" ? "active" : ""}`} onClick={() => setView("logins")}>
                <KeyRound size={14} />
                Logins
              </button>
            </div>
          </div>

          {view === "budget" && (
            <>
          <div className="flex justify-center">
            <div className="period-toggle">
              <button className={`period-pill ${period === "15" ? "active" : ""}`} onClick={() => setPeriod("15")}>
                15th
              </button>
              <button className={`period-pill ${period === "30" ? "active" : ""}`} onClick={() => setPeriod("30")}>
                30th
              </button>
            </div>
          </div>

          {showAccounts && (
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {state.accounts.map((acc) => {
              const spent = accountTotal(acc.id);
              const balanceRaw = acc.balances?.[period];
              const balance = balanceRaw === "" || balanceRaw === undefined ? 0 : Number(balanceRaw);
              const remaining = balance - spent;
              const isNegative = remaining < 0;
              return (
                <div key={acc.id} className={`account-card acc-${acc.id}`}>
                  <div className="flex items-start justify-between gap-1">
                    {editingAccountId === acc.id ? (
                      <input
                        type="text"
                        autoFocus
                        value={acc.name}
                        onChange={(e) => updateAccountName(acc.id, e.target.value)}
                        onBlur={() => setEditingAccountId(null)}
                        onKeyDown={(e) => e.key === "Enter" && setEditingAccountId(null)}
                        className="text-xs px-1.5 py-1 font-display font-semibold"
                        style={{ maxWidth: "68%" }}
                      />
                    ) : (
                      <button
                        className="font-display font-semibold text-xs sm:text-sm text-left truncate"
                        onClick={() => setEditingAccountId(acc.id)}
                        style={{ color: theme.textPrimary }}
                        title="Tap to rename"
                      >
                        {acc.name}
                      </button>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <Wallet size={14} color={acc.id === "a1" ? theme.accentPlum : theme.goldDot} />
                      <button onClick={() => deleteAccount(acc.id)} title="Delete account" style={{ display: "flex" }}>
                        <Trash2 size={13} color={theme.budgetMuted} />
                      </button>
                    </div>
                  </div>

                  <div className="mt-2">
                    <label className="text-xs" style={{ color: theme.budgetMuted }}>
                      Available {periodLabel}
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={balanceRaw === undefined ? "" : balanceRaw}
                      onChange={(e) => updateAccountBalance(acc.id, e.target.value)}
                      placeholder="0.00"
                      className="w-full mt-1 px-2 py-1.5 text-sm sm:text-base font-mono font-semibold"
                    />
                  </div>

                  <div className="flex items-center justify-between mt-2 text-xs">
                    <span style={{ color: theme.textMuted }}>Assigned</span>
                    <span className="font-mono">{money(spent)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1 pt-1.5 text-xs" style={{ borderTop: `1px solid ${theme.borderSoft}` }}>
                    <span style={{ color: theme.textMuted }}>Left</span>
                    <span className="font-mono font-semibold" style={{ color: isNegative ? theme.accentRed : theme.greenDot }}>
                      {money(remaining)}
                    </span>
                  </div>
                </div>
              );
            })}
            {state.accounts.length < 3 && (
              <button
                onClick={addAccount}
                className="account-card"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: `1px dashed ${theme.budgetBorder}`, color: theme.budgetMuted,
                  fontSize: 13, fontWeight: 600, cursor: "pointer", minHeight: 100,
                }}
              >
                + Add account
              </button>
            )}
          </div>
          )}
          <button
            onClick={() => setShowAccounts((v) => !v)}
            title={showAccounts ? "Minimize accounts" : "Expand accounts"}
            style={{
              position: "fixed", bottom: 90, right: 24, minWidth: 52, height: 52, borderRadius: 26, padding: "0 14px",
              background: theme.accentPlum, color: theme.prefersDark ? theme.gradA : "#fff",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              boxShadow: "0 4px 12px rgba(0,0,0,0.25)", cursor: "pointer", zIndex: 40, fontSize: 16, fontWeight: 700,
            }}
          >
            {showAccounts ? (
              "−"
            ) : state.accounts.length > 0 ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {state.accounts.map((acc, idx) => {
                  const spent = accountTotal(acc.id);
                  const balanceRaw = acc.balances?.[period];
                  const balance = balanceRaw === "" || balanceRaw === undefined ? 0 : Number(balanceRaw);
                  const remaining = balance - spent;
                  return (
                    <div key={acc.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      {idx > 0 && <div style={{ width: 1, height: 24, background: theme.prefersDark ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.25)" }} />}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.1 }}>
                        <div style={{ fontSize: "0.55rem", opacity: 0.8, fontWeight: 600, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "56px" }}>
                          {acc.name}
                        </div>
                        <div style={{ fontSize: "0.85rem", whiteSpace: "nowrap" }}>
                          {money(remaining)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Landmark size={22} />
            )}
          </button>
            </>
          )}
        </div>
      </div>

      <div className="scroll-zone">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
        {view === "budget" && (
          <>
        {allDone && (
          <div className="celebrate-card p-4 sm:p-5 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <PartyPopper size={22} color={theme.accentPlum} />
              <div>
                <p className="font-display font-semibold text-sm sm:text-base">
                  Every bill for {periodLabel} is handled
                </p>
                <p className="text-xs" style={{ color: theme.textMuted }}>
                  {paidThisPeriod.length} paid · {skippedThisPeriod.length} no payment needed · {money(paidThisPeriod.reduce((s, b) => s + (Number(b.amount) || 0), 0))} total paid
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="card p-4 sm:p-5">
          <div className="flex items-start justify-between mb-3 gap-2 flex-wrap">
            <h2 className="font-display font-semibold text-base flex items-center gap-2">
              <PiggyBank size={18} color={theme.accentPlum} />
              Bills due the {period}th
            </h2>
            <div className="flex items-center gap-3 flex-wrap justify-end">
              <button className="unhide-btn" onClick={resetAllToUnpaid} title="Reset every bill on both pay periods to Unpaid">
                <RotateCcw size={12} style={{ display: "inline", marginRight: 3, marginBottom: -1 }} />
                Reset all to unpaid
              </button>
              {!revealAll && resolvedCount > 0 && (
                <button className="unhide-btn" onClick={unhideAll}>
                  Unhide {resolvedCount} hidden
                </button>
              )}
              <span className="text-xs font-mono" style={{ color: theme.budgetBorder }}>
                {unresolved.length} open
              </span>
            </div>
          </div>

          {visibleBills.length === 0 && (
            <p className="text-sm py-6 text-center" style={{ color: theme.budgetBorder }}>
              No bills here yet. Add one below to start allocating this pay period.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            {visibleBills.map((bill) => {
              const rowClass =
                bill.status === "scheduled"
                  ? "row-scheduled"
                  : bill.status === "paid" || bill.status === "skip"
                  ? "row-resolved"
                  : "";
              const resolved = bill.status === "paid" || bill.status === "skip";
              const loginUrl = billLoginUrl(bill.name);
              return (
                <div key={bill.id} className={`bill-row ${rowClass} px-3 py-3 flex flex-col gap-2.5`}>
                  <select
                    value={bill.name}
                    onChange={(e) => updateBill(bill.id, { name: e.target.value })}
                    className="name-select w-full px-2 py-2 text-sm font-medium"
                    style={resolved ? { textDecoration: "line-through", color: theme.textMuted } : undefined}
                  >
                    {!sortedLoginNames.includes(bill.name) && bill.name && (
                      <option value={bill.name}>{bill.name} (no login saved)</option>
                    )}
                    {sortedLoginNames.length === 0 && !bill.name && (
                      <option value="">Add a login first</option>
                    )}
                    {sortedLoginNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    {loginUrl && (
                      <>
                        <a
                          href={loginUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="icon-btn flex-shrink-0"
                          title={`Open ${bill.name} in your default browser`}
                        >
                          <ExternalLink size={16} />
                        </a>
                        <button
                          onClick={() => copyToClipboard(loginUrl, `${bill.id}-link`)}
                          className={`icon-btn flex-shrink-0 ${copiedFlag === `${bill.id}-link` ? "copied" : ""}`}
                          title="Copy link"
                        >
                          {copiedFlag === `${bill.id}-link` ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                      </>
                    )}
                    <button onClick={() => deleteBill(bill.id)} className="flex-shrink-0" style={{ color: theme.budgetBorder, marginLeft: "auto" }} title="Delete bill">
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={bill.status}
                      onChange={(e) => setStatus(bill, e.target.value)}
                      className={`status-select ${bill.status === "scheduled" ? "select-scheduled" : ""} ${bill.status === "paid" ? "select-paid" : ""} ${bill.status === "skip" ? "select-skip" : ""}`}
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
                      className="w-24 px-2 py-2 text-sm font-mono text-right"
                    />

                    <select
                      value={bill.bankId || ""}
                      onChange={(e) => updateBill(bill.id, { bankId: e.target.value })}
                      disabled={state.accounts.length === 0}
                      className="flex-shrink-0 ml-auto px-2 py-1.5 text-xs"
                      style={state.accounts.length === 0 ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                    >
                      {state.accounts.length === 0 ? (
                        <option value="">No account</option>
                      ) : (
                        state.accounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>{acc.name}</option>
                        ))
                     )}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${theme.borderSoft}` }}>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={newBill.name}
                onChange={(e) => setNewBill((n) => ({ ...n, name: e.target.value }))}
                className="name-select flex-1 px-3 py-2 text-sm"
              >
                <option value="">
                  {sortedLoginNames.length === 0 ? "Add a login first" : "Select a bill…"}
                </option>
                {sortedLoginNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <input
                type="number"
                inputMode="decimal"
                placeholder="Amount"
                value={newBill.amount}
                onChange={(e) => setNewBill((n) => ({ ...n, amount: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && addBill()}
                className="sm:w-28 px-3 py-2 text-sm font-mono"
              />
              <select
                value={newBill.bankId}
                onChange={(e) => setNewBill((n) => ({ ...n, bankId: e.target.value }))}
                disabled={state.accounts.length === 0}
                className="px-3 py-2 text-sm"
                style={state.accounts.length === 0 ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
              >
                {state.accounts.length === 0 ? (
                  <option value="">Add an account first</option>
                ) : (
                  state.accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                  ))
                )}
              </select>
              <button
                onClick={addBill}
                disabled={!newBill.name.trim() || newBill.amount === ""}
                className="add-btn px-4 py-2 rounded-lg text-sm flex items-center justify-center gap-1"
              >
                <Plus size={16} />
                Add
              </button>
            </div>
          </div>
        </div>

        <p className="text-xs text-center" style={{ color: theme.budgetBorder }}>
          Bill status is saved automatically. Mark a bill "no payment needed" or "payment complete" and it steps out of the way — exporting brings everything back into view for a check, without changing anything.
        </p>
          </>
        )}

        {view === "logins" && !vaultKey && (
          <div className="card p-5 sm:p-6" style={{ textAlign: "center" }}>
            <div style={{
              width: 44, height: 44, borderRadius: "50%", margin: "0 auto 14px",
              background: theme.oldPlumBg, display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <ShieldCheck size={22} color={theme.accentPlum} />
            </div>

            {state.vaultMeta ? (
              <>
                <h2 className="font-display font-semibold text-base" style={{ marginBottom: 4 }}>Unlock your vault</h2>
                <p className="text-sm" style={{ color: theme.textMuted, marginBottom: 16 }}>
                  Your logins are encrypted — enter your vault passphrase to view them this visit.
                </p>

                {faceIdEnabledHere && (
                  <button
                    onClick={unlockWithFaceId}
                    disabled={faceIdBusy}
                    className="add-btn w-full px-4 py-2.5 rounded-lg text-sm flex items-center justify-center gap-2"
                    style={{ marginBottom: 10 }}
                  >
                    <ScanFace size={16} />
                    {faceIdBusy ? "Checking..." : "Unlock with Face ID"}
                  </button>
                )}
                {faceIdEnabledHere && (
                  <div className="flex items-center gap-3 my-3" style={{ color: theme.budgetBorder }}>
                    <div style={{ flex: 1, height: 1, background: theme.borderSoft }} />
                    <span className="text-xs">or use your passphrase</span>
                    <div style={{ flex: 1, height: 1, background: theme.borderSoft }} />
                  </div>
                )}

                <input
                  type="password"
                  value={vaultPassphrase}
                  onChange={(e) => setVaultPassphrase(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && unlockVault()}
                  placeholder="Vault passphrase"
                  autoComplete="current-password"
                  className="w-full px-3 py-2 text-sm"
                  style={{ marginBottom: 10 }}
                />
                {vaultError && (
                  <p className="text-xs" style={{ color: theme.accentRed, marginBottom: 10 }}>{vaultError}</p>
                )}
                <button
                  onClick={unlockVault}
                  disabled={vaultBusy || !vaultPassphrase}
                  className="add-btn w-full px-4 py-2.5 rounded-lg text-sm"
                >
                  {vaultBusy ? "Unlocking..." : "Unlock"}
                </button>
                <button
                  onClick={() => setShowForgotInfo((v) => !v)}
                  style={{ border: "none", background: "transparent", color: theme.budgetBorder, fontSize: 12, marginTop: 12, cursor: "pointer" }}
                >
                  Forgot your passphrase?
                </button>
                {showForgotInfo && (
                  <p className="text-xs" style={{ color: theme.textMuted, marginTop: 8, textAlign: "left" }}>
                    This vault is encrypted so that only your passphrase can unlock it — not even Claude or Firebase can read it. That means there's genuinely no way to recover it if it's forgotten. The rest of the budget (accounts, bills) is completely unaffected either way.
                  </p>
                )}
                {faceIdEnabledHere && (
                  <button
                    onClick={() => { removeFaceUnlock(); setFaceIdEnabledHere(false); }}
                    style={{ border: "none", background: "transparent", color: theme.budgetBorder, fontSize: 12, marginTop: 8, cursor: "pointer", display: "block", width: "100%" }}
                  >
                    Remove Face ID from this device
                  </button>
                )}
              </>
            ) : (
              <>
                <h2 className="font-display font-semibold text-base" style={{ marginBottom: 4 }}>Set up your vault</h2>
                <p className="text-sm" style={{ color: theme.textMuted, marginBottom: 16 }}>
                  Choose a passphrase to encrypt your logins. This is separate from your Google sign-in, and it's the only key — there's no recovery if it's forgotten.
                </p>
                <input
                  type="password"
                  value={vaultPassphrase}
                  onChange={(e) => setVaultPassphrase(e.target.value)}
                  placeholder="Create a passphrase (8+ characters)"
                  autoComplete="new-password"
                  className="w-full px-3 py-2 text-sm"
                  style={{ marginBottom: 8 }}
                />
                <input
                  type="password"
                  value={vaultConfirm}
                  onChange={(e) => setVaultConfirm(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createVault()}
                  placeholder="Confirm passphrase"
                  autoComplete="new-password"
                  className="w-full px-3 py-2 text-sm"
                  style={{ marginBottom: 10 }}
                />
                {vaultError && (
                  <p className="text-xs" style={{ color: theme.accentRed, marginBottom: 10 }}>{vaultError}</p>
                )}
                <button
                  onClick={createVault}
                  disabled={vaultBusy || !vaultPassphrase || !vaultConfirm}
                  className="add-btn w-full px-4 py-2.5 rounded-lg text-sm"
                >
                  {vaultBusy ? "Creating..." : "Create Vault"}
                </button>
              </>
            )}
          </div>
        )}

        {view === "logins" && vaultKey && (
          <>
            <div className="card p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display font-semibold text-base flex items-center gap-2">
                  <KeyRound size={18} color={theme.accentPlum} />
                  Bill logins
                </h2>
                <span className="text-xs font-mono" style={{ color: theme.budgetBorder }}>
                  {(state.logins || []).length} saved
                </span>
              </div>

              {(state.logins || []).length === 0 && (
                <p className="text-sm py-6 text-center" style={{ color: theme.budgetBorder }}>
                  No logins saved yet. Add a bill's website, username, and password below.
                </p>
              )}

              <div className="flex flex-col gap-2.5">
                {sortedLogins.map((login) => {
                  const passwordVisible = !!visiblePasswords[login.id];
                  return (
                    <div key={login.id} className="login-row">
                      <div className="login-row-head">
                        <input

                          type="text"
                          value={login.name}
                          onChange={(e) => updateLogin(login.id, { name: e.target.value })}
                          placeholder="Bill name"
                          className="flex-1 min-w-0 px-2 py-1.5 text-sm font-medium"
                        />
                        <button onClick={() => deleteLogin(login.id)} className="icon-btn" title="Delete login">
                          <Trash2 size={15} />
                        </button>
                      </div>

                      <div className="login-field-row">
                        <span className="login-field-label">Website</span>
                        <input
                          type="text"
                          value={login.url}
                          onChange={(e) => updateLogin(login.id, { url: e.target.value })}
                          placeholder="example.com"
                          className="login-field-value"
                          style={{ background: "transparent", border: "none", padding: 0 }}
                        />
                        <a
                          href={
                            login.url
                              ? /^https?:\/\//i.test(login.url)
                                ? login.url
                                : `https://${login.url}`
                              : undefined
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="icon-btn"
                          style={!login.url ? { opacity: 0.35, pointerEvents: "none" } : undefined}
                          title="Open in your default browser"
                        >
                          <ExternalLink size={14} />
                        </a>
                        {login.url && (
                          <button
                            onClick={() =>
                              copyToClipboard(
                                /^https?:\/\//i.test(login.url) ? login.url : `https://${login.url}`,
                                `${login.id}-url`
                              )
                            }
                            className={`icon-btn ${copiedFlag === `${login.id}-url` ? "copied" : ""}`}
                            title="Copy link"
                          >
                            {copiedFlag === `${login.id}-url` ? <Check size={14} /> : <Copy size={14} />}
                          </button>
                        )}
                      </div>

                      <div className="login-field-row">
                        <span className="login-field-label">Username</span>
                        <input
                          type="text"
                          value={login.username}
                          onChange={(e) => updateLogin(login.id, { username: e.target.value })}
                          placeholder="username or email"
                          className="login-field-value"
                          style={{ background: "transparent", border: "none", padding: 0 }}
                        />
                        <button
                          onClick={() => copyToClipboard(login.username, `${login.id}-user`)}
                          className={`icon-btn ${copiedFlag === `${login.id}-user` ? "copied" : ""}`}
                          title="Copy username"
                        >
                          {copiedFlag === `${login.id}-user` ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                      </div>

                      <div className="login-field-row">
                        <span className="login-field-label">Password</span>
                        <input
                          type={passwordVisible ? "text" : "password"}
                          value={decryptedPasswords[login.id] ?? ""}
                          onChange={(e) => updateLoginPassword(login.id, e.target.value)}
                          placeholder="password"
                          autoComplete="new-password"
                          className="login-field-value"
                          style={{ background: "transparent", border: "none", padding: 0 }}
                        />
                        <button
                          onClick={() => togglePasswordVisible(login.id)}
                          className="icon-btn"
                          title={passwordVisible ? "Hide password" : "Show password"}
                        >
                          {passwordVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button
                          onClick={() => copyToClipboard(decryptedPasswords[login.id] || "", `${login.id}-pass`)}
                          className={`icon-btn ${copiedFlag === `${login.id}-pass` ? "copied" : ""}`}
                          title="Copy password"
                        >
                          {copiedFlag === `${login.id}-pass` ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 pt-4 flex flex-col gap-2" style={{ borderTop: `1px solid ${theme.borderSoft}` }}>
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="Bill name (e.g. Electric Co.)"
                  value={newLogin.name}
                  onChange={(e) => setNewLogin((n) => ({ ...n, name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm"
                />
                <input
                  type="url"
                  autoComplete="url"
                  placeholder="Website URL"
                  value={newLogin.url}
                  onChange={(e) => setNewLogin((n) => ({ ...n, url: e.target.value }))}
                  className="w-full px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  autoComplete="username"
                  placeholder="Username"
                  value={newLogin.username}
                  onChange={(e) => setNewLogin((n) => ({ ...n, username: e.target.value }))}
                  className="w-full px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  autoComplete="new-password"
                  placeholder="Password"
                  value={newLogin.password}
                  onChange={(e) => setNewLogin((n) => ({ ...n, password: e.target.value }))}
                  className="w-full px-3 py-2 text-sm font-mono"
                />
                <button
                  onClick={addLogin}
                  disabled={!newLogin.name.trim()}
                  className="add-btn w-full px-4 py-2.5 rounded-lg text-sm flex items-center justify-center gap-1"
                >
                  <Plus size={16} />
                  Add login
                </button>
              </div>
            </div>

            <p className="text-xs text-center" style={{ color: theme.budgetBorder }}>
              Saved as end-to-end encrypted, unlocked only by your vault passphrase — not even Claude or Firebase can read your saved passwords.
            </p>
          </>
        )}

        {saveError && (
          <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ color: theme.accentRed, background: "rgba(220,38,38,0.06)" }}>
            <AlertCircle size={14} />
            Couldn't save your changes — they may not persist after you close this.
          </div>
        )}
      </div>
      </div>

      {offerFaceId && (
        <div
          onClick={declineFaceId}
          style={{ position: "fixed", inset: 0, background: theme.prefersDark ? "rgba(0,0,0,0.75)" : "rgba(43,36,32,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 200 }}
        >
          <div onClick={(e) => e.stopPropagation()} className="card p-5" style={{ maxWidth: 340, textAlign: "center" }}>
            <div style={{
              width: 44, height: 44, borderRadius: "50%", margin: "0 auto 14px",
              background: theme.oldPlumBg, display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <ScanFace size={22} color={theme.accentPlum} />
            </div>
            <h2 className="font-display font-semibold text-base" style={{ marginBottom: 6 }}>Enable Face ID?</h2>
            <p className="text-sm" style={{ color: theme.textMuted, marginBottom: 16 }}>
              Unlock your logins with Face ID on this device instead of typing your passphrase each visit. Your passphrase stays the real key — this just lets Face ID release it faster on this specific device.
            </p>
            {faceIdMsg && <p className="text-xs" style={{ color: theme.accentRed, marginBottom: 12 }}>{faceIdMsg}</p>}
            <button
              onClick={confirmEnableFaceId}
              disabled={faceIdBusy}
              className="add-btn w-full px-4 py-2.5 rounded-lg text-sm flex items-center justify-center gap-2"
              style={{ marginBottom: 8 }}
            >
              <ScanFace size={16} />
              {faceIdBusy ? "Setting up..." : "Enable Face ID"}
            </button>
            <button
              onClick={declineFaceId}
              style={{ border: "none", background: "transparent", color: theme.textMuted, fontSize: 13, cursor: "pointer", padding: "6px 0" }}
            >
              Not now
            </button>
          </div>
        </div>
      )}
      {confirmDelete && (
        <div
          onClick={() => setConfirmDelete(null)}
          style={{ position: "fixed", inset: 0, background: theme.prefersDark ? "rgba(0,0,0,0.75)" : "rgba(43,36,32,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 200 }}
        >
          <div onClick={(e) => e.stopPropagation()} className="card p-5" style={{ maxWidth: 340, textAlign: "center" }}>
            <div style={{
              width: 44, height: 44, borderRadius: "50%", margin: "0 auto 14px",
              background: "rgba(220,38,38,0.10)", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Trash2 size={22} color={theme.accentRed} />
            </div>
            <h2 className="font-display font-semibold text-base" style={{ marginBottom: 6 }}>Delete this account?</h2>
            <p className="text-sm" style={{ color: theme.textMuted, marginBottom: 16 }}>
              This can't be undone. Any bills assigned to it will be left without an account.
            </p>
            <button
              onClick={confirmDeleteAccount}
              className="w-full px-4 py-2.5 rounded-lg text-sm flex items-center justify-center gap-2"
              style={{ marginBottom: 8, background: theme.accentRed, color: "#fff", border: "none", cursor: "pointer", fontWeight: 600 }}
            >
              <Trash2 size={16} />
              Delete account
            </button>
            <button
              onClick={() => setConfirmDelete(null)}
              style={{ border: "none", background: "transparent", color: theme.textMuted, fontSize: 13, cursor: "pointer", padding: "6px 0" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {confirmReset && (
        <div
          onClick={() => setConfirmReset(false)}
          style={{ position: "fixed", inset: 0, background: theme.prefersDark ? "rgba(0,0,0,0.75)" : "rgba(43,36,32,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 200 }}
        >
          <div onClick={(e) => e.stopPropagation()} className="card p-5" style={{ maxWidth: 360, textAlign: "center" }}>
            <div style={{
              width: 44, height: 44, borderRadius: "50%", margin: "0 auto 14px",
              background: "rgba(220,38,38,0.10)", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <AlertCircle size={22} color={theme.accentRed} />
            </div>
            <h2 className="font-display font-semibold text-base" style={{ marginBottom: 6 }}>Reset all bills to Unpaid?</h2>
            <p className="text-sm" style={{ color: theme.textMuted, marginBottom: 16 }}>
              This resets every bill on both the 15th and the 30th back to Unpaid, clearing all Scheduled, No payment needed, and Payment complete statuses.
            </p>
            <button
              onClick={doResetAllToUnpaid}
              className="w-full px-4 py-2.5 rounded-lg text-sm flex items-center justify-center gap-2"
              style={{ marginBottom: 8, background: theme.accentRed, color: "#fff", border: "none", cursor: "pointer", fontWeight: 600 }}
            >
              Reset all to Unpaid
            </button>
            <button
              onClick={() => setConfirmReset(false)}
              style={{ border: "none", background: "transparent", color: theme.textMuted, fontSize: 13, cursor: "pointer", padding: "6px 0" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
