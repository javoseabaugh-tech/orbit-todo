import { motion } from "framer-motion";
import { useRef, useState } from "react";
import { Sparkles, AlertCircle, Keyboard, Paperclip, ArrowUp, X } from "lucide-react";
import { parseBrainDump, parseBrainDumpImage } from "./gemini";
import { theme, SPRING } from "./theme";
import { accentButtonStyle } from "./ui";

const SpeechRecognitionAPI =
  typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

// Star used to be gold on cream. It now rides the active theme accent like
// every other emphasised control — colours only; the states are unchanged.
const ACCENT_GRADIENT = `linear-gradient(140deg, ${theme.accentPlum}, ${theme.accent2})`;
const GLASS_FILL = `linear-gradient(157deg, ${theme.glassHigh}, ${theme.glassFill})`;
const ICON_BUTTON = {
  width: 34, height: 34, borderRadius: 12, flexShrink: 0,
  display: "flex", alignItems: "center", justifyContent: "center",
  color: theme.textMuted, background: theme.glassFill,
  border: `1px solid ${theme.glassBorder}`,
  backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
  cursor: "pointer",
};
const GLASS_CHROME = {
  background: GLASS_FILL,
  border: `1px solid ${theme.glassBorder}`,
  backdropFilter: "blur(18px) saturate(180%)",
  WebkitBackdropFilter: "blur(18px) saturate(180%)",
  boxShadow: `inset 0 1px 0 ${theme.glassSpec}`,
};

function StarBadge({ ring, size = 26 }) {
  return (
    <span
      style={{
        position: "relative", width: size, height: size, borderRadius: "50%", background: ACCENT_GRADIENT,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: `0 4px 14px -5px ${theme.accentPlum}`, flexShrink: 0,
      }}
    >
      {ring && (
        <span style={{
          position: "absolute", inset: -4, borderRadius: "50%",
          border: `1.5px solid ${theme.accentPlum}`, opacity: 0.4,
          animation: "glowPulse 2.4s ease-in-out infinite",
        }} />
      )}
      <Sparkles size={size * 0.5} color={theme.accentInk} strokeWidth={2.5} />
    </span>
  );
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function BrainDumpButton({ knownPeopleNames, onResult }) {
  const [mode, setMode] = useState("idle"); // idle | recording | typing | parsing | error
  const [liveText, setLiveText] = useState("");
  const [typedText, setTypedText] = useState("");
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const fileInputRef = useRef(null);

  function resetToIdle() {
    setMode("idle");
    setLiveText("");
    setTypedText("");
  }

  function startRecording() {
    if (!SpeechRecognitionAPI) return;
    setError(null);
    setLiveText("");
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (e) => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
      setLiveText(transcript);
    };

    recognition.onerror = (e) => {
      setMode("error");
      setError(e.error === "not-allowed" ? "Microphone access was blocked." : "Couldn't hear that — try again.");
    };

    recognition.onend = () => {
      setLiveText((current) => {
        if (current.trim()) submitText(current.trim());
        else setMode("idle");
        return current;
      });
    };

    recognitionRef.current = recognition;
    recognition.start();
    setMode("recording");
  }

  function stopRecording() {
    const rec = recognitionRef.current;
    if (!rec) return;
    // Don't rely solely on the browser's onend event firing (unreliable on
    // some browsers, notably Safari/iOS) — finish the job directly here,
    // and detach onend first so a late/duplicate browser event can't also
    // trigger a second submit.
    rec.onend = null;
    try {
      rec.stop();
    } catch (e) {
      console.error("stop() failed", e);
    }
    setLiveText((current) => {
      if (current.trim()) submitText(current.trim());
      else setMode("idle");
      return current;
    });
  }

  async function submitText(text) {
    setMode("parsing");
    try {
      const parsed = await parseBrainDump(text, knownPeopleNames);
      onResult(parsed);
      resetToIdle();
    } catch (e) {
      console.error(e);
      onResult({ itemType: "thought", list: "personal", text, personName: null, dueDate: null });
      setMode("error");
      setError("Parse error: " + e.message);
    }
  }

  async function handleFileSelected(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMode("parsing");
    setError(null);
    try {
      const base64 = await fileToBase64(file);
      const parsed = await parseBrainDumpImage(base64, file.type, knownPeopleNames);
      onResult(parsed);
      resetToIdle();
    } catch (err) {
      console.error(err);
      setMode("error");
      setError("Star couldn't read that image — try a clearer photo or screenshot.");
    }
  }

  const parsing = mode === "parsing";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {mode === "recording" ? (
        // Listening: accent-ringed card with the live transcript.
        <div style={{
          display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderRadius: 20,
          background: GLASS_FILL, border: `1px solid ${theme.accentPlum}`,
          backdropFilter: "blur(20px) saturate(180%)", WebkitBackdropFilter: "blur(20px) saturate(180%)",
          boxShadow: `inset 0 1px 0 ${theme.glassSpec}, 0 0 0 4px ${theme.accentSoft}`,
        }}>
          <span style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 22, flexShrink: 0 }}>
            {[0, 0.12, 0.24, 0.36, 0.48].map((delay) => (
              <i
                key={delay}
                style={{
                  display: "block", width: 3, height: 22, borderRadius: 2,
                  background: theme.accentPlum,
                  animation: `listen .7s ease-in-out ${delay}s infinite`,
                }}
              />
            ))}
          </span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: theme.textSecondary, fontStyle: "italic" }}>
            {liveText || "Listening…"}
          </span>
          <button
            onClick={stopRecording}
            style={{ ...accentButtonStyle(true), padding: "7px 14px", borderRadius: 999, fontSize: 12, fontWeight: 600, flexShrink: 0 }}
          >
            Stop
          </button>
        </div>
      ) : parsing ? (
        // Parsing: spinner while Star sorts the capture out.
        <div style={{
          display: "flex", alignItems: "center", gap: 12, padding: "13px 18px", borderRadius: 20,
          background: GLASS_FILL, border: `1px solid ${theme.glassBorder}`,
          backdropFilter: "blur(20px) saturate(180%)", WebkitBackdropFilter: "blur(20px) saturate(180%)",
          boxShadow: `inset 0 1px 0 ${theme.glassSpec}`,
        }}>
          <span style={{
            width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
            border: `2px solid ${theme.accentSoft}`, borderTopColor: theme.accentPlum,
            animation: "spin .8s linear infinite",
          }} />
          <span style={{ fontSize: 13.5, color: theme.textSecondary }}>Star is sorting that out…</span>
        </div>
      ) : mode === "typing" ? (
        // Typing: inline input with an accent send button.
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "8px 8px 8px 14px", borderRadius: 18,
          background: GLASS_FILL, border: `1px solid ${theme.glassBorder}`,
          backdropFilter: "blur(20px) saturate(180%)", WebkitBackdropFilter: "blur(20px) saturate(180%)",
          boxShadow: `inset 0 1px 0 ${theme.glassSpec}`,
        }}>
          <Sparkles size={16} color={theme.accentPlum} style={{ flexShrink: 0 }} />
          <input
            autoFocus
            value={typedText}
            onChange={(e) => setTypedText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && typedText.trim()) submitText(typedText.trim());
              if (e.key === "Escape") resetToIdle();
            }}
            placeholder="Tell Star what's on your mind…"
            style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", fontSize: 14, color: theme.textPrimary }}
          />
          <button
            onClick={() => typedText.trim() && submitText(typedText.trim())}
            disabled={!typedText.trim()}
            style={{
              ...accentButtonStyle(!!typedText.trim()), width: 32, height: 32, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}
          >
            <ArrowUp size={15} />
          </button>
          <button
            onClick={resetToIdle}
            style={{ width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "transparent", color: theme.textFainter, cursor: "pointer", flexShrink: 0 }}
          >
            <X size={15} />
          </button>
        </div>
      ) : (
        // Idle: the Ask Star pill plus the keyboard and paperclip shortcuts.
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
          <button
            onClick={startRecording}
            disabled={!SpeechRecognitionAPI}
            title={SpeechRecognitionAPI ? undefined : "Voice needs Chrome, Edge, or Safari"}
            style={{
              ...GLASS_CHROME, display: "flex", alignItems: "center", gap: 10,
              padding: "8px 18px 8px 8px", borderRadius: 999, fontSize: 13, fontWeight: 600,
              color: theme.textSecondary, cursor: SpeechRecognitionAPI ? "pointer" : "default",
              opacity: SpeechRecognitionAPI ? 1 : 0.5,
              transition: `transform .35s ${SPRING}`,
            }}
          >
            <StarBadge size={28} ring />
            Ask Star
          </button>
          <button
            onClick={() => setMode("typing")}
            title="Type instead"
            style={{ ...ICON_BUTTON }}
          >
            <Keyboard size={15} />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Attach a photo or screenshot"
            style={{ ...ICON_BUTTON }}
          >
            <Paperclip size={15} />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelected} style={{ display: "none" }} />
        </div>
      )}

      {mode === "error" && error && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: theme.accentRed }}>
          <AlertCircle size={12} />
          {error}
        </div>
      )}
    </div>
  );
}
