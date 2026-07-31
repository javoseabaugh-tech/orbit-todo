import { useEffect, useRef, useState } from "react";
import {
  platformAuthAvailable, hasBudgetGate, budgetGateDeclined,
  declineBudgetGate, registerBudgetGate, verifyBudgetGate,
} from "./faceUnlock";
import { theme, glass, EASE_OUT } from "./theme";
import { display, accentButtonStyle, GlassBackdrop } from "./ui";
import { ScanFace } from "lucide-react";

export default function BudgetGate({ children, onCancel }) {
  const [status, setStatus] = useState("checking");
  const [error, setError] = useState("");
  const [stalled, setStalled] = useState(false);
  const abortRef = useRef(null);

  async function runVerify() {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setStalled(false);
    setStatus("verifying");
    const ok = await verifyBudgetGate(ac.signal);
    if (ac.signal.aborted) return;
    setStatus(ok ? "open" : "denied");
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // hasBudgetGate() is a synchronous localStorage read, so when a
      // credential already exists we go straight to WebAuthn with nothing
      // awaited in between. Awaiting platformAuthAvailable() first put a cold,
      // slow round-trip between the user's tap and credentials.get(); once that
      // transient activation lapsed WebKit left the request pending forever
      // rather than rejecting, which is the spinner that never finishes.
      if (hasBudgetGate()) {
        runVerify();
        return;
      }
      const available = await platformAuthAvailable();
      if (cancelled) return;
      if (!available || budgetGateDeclined()) {
        setStatus("open");
        return;
      }
      setStatus("prompt");
    })();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, []);

  // Whatever the cause, the spinner must never be a dead end: after a few
  // seconds with no answer, surface a way out.
  useEffect(() => {
    if (status !== "checking" && status !== "verifying") {
      setStalled(false);
      return;
    }
    const t = setTimeout(() => setStalled(true), 6000);
    return () => clearTimeout(t);
  }, [status]);

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
    await runVerify();
  }

  if (status === "open") return children;

  return (
    <div
      className="orbit-shell"
      style={{ position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", color: theme.textPrimary, fontFamily: "'Geist', system-ui, sans-serif" }}
    >
      <GlassBackdrop />
      {/* The document itself no longer scrolls, so this centring layer carries
          its own overflow — auto margins keep the card centred when it fits and
          let it scroll when the keyboard squeezes the viewport. */}
      <div
        className="orbit-scroll"
        style={{
          position: "relative", zIndex: 1, flex: 1, minHeight: 0,
          display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 28,
          animation: `screenIn .45s ${EASE_OUT}`,
        }}
      >
        <div style={{ ...glass.raised, width: "100%", maxWidth: 370, margin: "auto 0", padding: "32px 28px", borderRadius: 30, textAlign: "center" }}>
          <span style={{
            width: 56, height: 56, margin: "0 auto 18px", borderRadius: 20,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: theme.accentInk,
            background: `linear-gradient(140deg, ${theme.accentPlum}, ${theme.accent2})`,
            boxShadow: `0 12px 30px -10px ${theme.accentPlum}`,
          }}>
            <ScanFace size={26} />
          </span>

          {(status === "checking" || status === "verifying") && (
            <div>
              <div style={{ fontSize: 16.5, fontWeight: 600, marginBottom: 14 }}>Verifying it's you…</div>
              <span style={{
                display: "block", width: 22, height: 22, margin: "0 auto", borderRadius: "50%",
                border: `2px solid ${theme.accentSoft}`, borderTopColor: theme.accentPlum,
                animation: "spin .8s linear infinite",
              }} />

              {stalled && (
                <div style={{ marginTop: 20 }}>
                  <p style={{ margin: "0 0 14px", fontSize: 13, lineHeight: 1.55, color: theme.textMuted }}>
                    Face ID isn't responding. Tapping Try again usually gets it going.
                  </p>
                  <button
                    onClick={handleRetry}
                    style={{ ...accentButtonStyle(true), width: "100%", padding: 13, borderRadius: 15, fontSize: 14, fontWeight: 600, marginBottom: 10 }}
                  >
                    Try again
                  </button>
                  <button
                    onClick={onCancel}
                    style={{ width: "100%", padding: 13, borderRadius: 15, fontSize: 14, fontWeight: 500, color: theme.textMuted, background: theme.inputBg, border: `1px solid ${theme.glassBorder2}`, cursor: "pointer" }}
                  >
                    Back to Orbit
                  </button>
                </div>
              )}
            </div>
          )}

          {status === "prompt" && (
            <div>
              <h1 style={{ ...display(23, "-.025em"), margin: "0 0 8px" }}>Protect Budget with Face ID?</h1>
              <p style={{ margin: "0 0 22px", fontSize: 13.5, lineHeight: 1.55, color: theme.textMuted }}>
                You'll confirm with Face ID each time you open a budget on this device.
              </p>
              <button
                onClick={handleEnable}
                style={{ ...accentButtonStyle(true), width: "100%", padding: 13, borderRadius: 15, fontSize: 14, fontWeight: 600, marginBottom: 10 }}
              >
                Enable Face ID
              </button>
              <button
                onClick={handleSkip}
                style={{ width: "100%", padding: 13, borderRadius: 15, fontSize: 14, fontWeight: 500, color: theme.textMuted, background: theme.inputBg, border: `1px solid ${theme.glassBorder2}`, cursor: "pointer" }}
              >
                Not now
              </button>
              <button
                onClick={onCancel}
                style={{ marginTop: 14, fontSize: 12.5, color: theme.textFainter, background: "transparent", border: "none", cursor: "pointer" }}
              >
                Back to Orbit
              </button>
            </div>
          )}

          {status === "denied" && (
            <div>
              <h1 style={{ ...display(23, "-.025em"), margin: "0 0 8px" }}>Face ID didn't match</h1>
              <p style={{ margin: "0 0 22px", fontSize: 13.5, lineHeight: 1.55, color: theme.textMuted }}>
                Try again, or go back.
              </p>
              <button
                onClick={handleRetry}
                style={{ ...accentButtonStyle(true), width: "100%", padding: 13, borderRadius: 15, fontSize: 14, fontWeight: 600, marginBottom: 10 }}
              >
                Try again
              </button>
              <button
                onClick={onCancel}
                style={{ width: "100%", padding: 13, borderRadius: 15, fontSize: 14, fontWeight: 500, color: theme.textMuted, background: theme.inputBg, border: `1px solid ${theme.glassBorder2}`, cursor: "pointer" }}
              >
                Back to Orbit
              </button>
            </div>
          )}

          {error && <div style={{ marginTop: 16, fontSize: 13, color: theme.accentRed }}>{error}</div>}
        </div>
      </div>
    </div>
  );
}
