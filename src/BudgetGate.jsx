import { useEffect, useState } from "react";
import {
  platformAuthAvailable, hasBudgetGate, budgetGateDeclined,
  declineBudgetGate, registerBudgetGate, verifyBudgetGate,
} from "./faceUnlock";
import { theme } from "./theme";
import { ShieldCheck } from "lucide-react";

export default function BudgetGate({ children, onCancel }) {
  const [status, setStatus] = useState("checking");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const available = await platformAuthAvailable();
      if (!available) {
        setStatus("open");
        return;
      }
      if (hasBudgetGate()) {
        setStatus("verifying");
        const ok = await verifyBudgetGate();
        setStatus(ok ? "open" : "denied");
        return;
      }
      if (budgetGateDeclined()) {
        setStatus("open");
        return;
      }
      setStatus("prompt");
    })();
  }, []);

  async function handleEnable() {
    setStatus("verifying");
    try {
      await registerBudgetGate();
      setStatus("open");
    } catch (e) {
      console.error(e);
      setError("Couldn't set up Face ID on this device.");
      setStatus("open");
    }
  }

  function handleSkip() {
    declineBudgetGate();
    setStatus("open");
  }

  async function handleRetry() {
    setStatus("verifying");
    const ok = await verifyBudgetGate();
    setStatus(ok ? "open" : "denied");
  }

  if (status === "open") return children;

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: theme.gradB, fontFamily: "'Inter', -apple-system, sans-serif", padding: 24 }}>
      <div style={{ maxWidth: 340, textAlign: "center" }}>
        {(status === "checking" || status === "verifying") && (
          <>
            <ShieldCheck size={40} color={theme.accentPlum} style={{ marginBottom: 12 }} />
            <div style={{ color: theme.textPrimary, fontSize: 16, fontWeight: 600 }}>Verifying it's you…</div>
          </>
        )}
        {status === "prompt" && (
          <>
            <ShieldCheck size={40} color={theme.accentPlum} style={{ marginBottom: 12 }} />
            <div style={{ color: theme.textPrimary, fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Protect Budget with Face ID?</div>
            <div style={{ color: theme.textMuted, fontSize: 14, marginBottom: 20 }}>
              You'll be asked to confirm with Face ID each time you open a budget on this device.
            </div>
            <button onClick={handleEnable} style={{ width: "100%", padding: "12px", borderRadius: 12, border: "none", background: theme.accentPlum, color: theme.cardBg, fontSize: 15, fontWeight: 600, cursor: "pointer", marginBottom: 10 }}>
              Enable Face ID
            </button>
            <button onClick={handleSkip} style={{ width: "100%", padding: "12px", borderRadius: 12, border: `1px solid ${theme.borderSoft2}`, background: "transparent", color: theme.textMuted, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
              Not now
            </button>
          </>
        )}
        {status === "denied" && (
          <>
            <ShieldCheck size={40} color={theme.oldOrangeText} style={{ marginBottom: 12 }} />
            <div style={{ color: theme.textPrimary, fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Face ID didn't match</div>
            <div style={{ color: theme.textMuted, fontSize: 14, marginBottom: 20 }}>Try again, or go back.</div>
            <button onClick={handleRetry} style={{ width: "100%", padding: "12px", borderRadius: 12, border: "none", background: theme.accentPlum, color: theme.cardBg, fontSize: 15, fontWeight: 600, cursor: "pointer", marginBottom: 10 }}>
              Try Again
            </button>
            <button onClick={onCancel} style={{ width: "100%", padding: "12px", borderRadius: 12, border: `1px solid ${theme.borderSoft2}`, background: "transparent", color: theme.textMuted, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
              Back
            </button>
          </>
        )}
        {error && <div style={{ marginTop: 16, color: theme.oldOrangeText, fontSize: 13 }}>{error}</div>}
      </div>
    </div>
  );
}
