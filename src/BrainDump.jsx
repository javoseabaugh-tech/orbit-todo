import { motion } from "framer-motion";
import { useRef, useState } from "react";
import { Sparkles, AlertCircle, Keyboard, Paperclip, ArrowUp, X } from "lucide-react";
import { parseBrainDump, parseBrainDumpImage } from "./gemini";

const SpeechRecognitionAPI =
  typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

const GOLD_GRADIENT = "linear-gradient(135deg, #F4CB6A 0%, #D9A441 50%, #B9852B 100%)";

function StarBadge({ pulsing, size = 26 }) {
  return (
    <span
      style={{
        width: size, height: size, borderRadius: "50%", background: GOLD_GRADIENT,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 1px 4px rgba(185,133,43,0.45)", flexShrink: 0,
        animation: pulsing ? "starPulse 1.4s ease-in-out infinite" : "none",
      }}
    >
      <Sparkles size={size * 0.5} color="#fff" strokeWidth={2.5} />
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
      {mode === "typing" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#FEFBF3", border: "1px solid #EFE1C0", borderRadius: 14, padding: "8px 8px 8px 14px" }}>
          <StarBadge size={22} />
          <input
            autoFocus
            value={typedText}
            onChange={(e) => setTypedText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && typedText.trim()) submitText(typedText.trim());
              if (e.key === "Escape") resetToIdle();
            }}
            placeholder="Tell Star what's on your mind..."
            style={{ flex: 1, border: "none", background: "transparent", fontSize: 14, color: "#2B2420" }}
          />
          <button
            onClick={() => typedText.trim() && submitText(typedText.trim())}
            disabled={!typedText.trim()}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 999, border: "none",
              background: typedText.trim() ? "#B9852B" : "#E6DACB", color: "#fff", cursor: typedText.trim() ? "pointer" : "default", flexShrink: 0,
            }}
          >
            <ArrowUp size={15} />
          </button>
          <button onClick={resetToIdle} style={{ border: "none", background: "transparent", color: "#A89A8C", cursor: "pointer", padding: 4, flexShrink: 0 }}>
            <X size={15} />
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {mode === "recording" ? (
            <button
              onClick={stopRecording}
              style={{
                display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700,
                padding: "6px 14px 6px 6px", borderRadius: 999, border: "none",
                background: "#B8443A", color: "#fff", cursor: "pointer",
              }}
            >
              <StarBadge pulsing />
              Star's listening — tap to stop
            </button>
          ) : (
            <button
              onClick={startRecording}
              disabled={parsing || !SpeechRecognitionAPI}
              title={SpeechRecognitionAPI ? undefined : "Voice needs Chrome, Edge, or Safari"}
              style={{
                display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700,
                padding: "6px 14px 6px 6px", borderRadius: 999, border: "1px solid #EFE1C0",
                background: "#FEFBF3", color: "#8A6D2A", cursor: parsing ? "default" : "pointer",
                opacity: SpeechRecognitionAPI ? 1 : 0.5,
              }}
            >
              <StarBadge pulsing={parsing} />
              {parsing ? "Star's thinking..." : "Ask Star"}
            </button>
          )}

          {mode !== "recording" && (
            <>
              <button
                onClick={() => setMode("typing")}
                disabled={parsing}
                title="Type instead"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32,
                  borderRadius: 999, border: "1px solid #EFE6D9", background: "#fff", color: "#8C7F72",
                  cursor: parsing ? "default" : "pointer",
                }}
              >
                <Keyboard size={14} />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={parsing}
                title="Attach a photo or screenshot"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32,
                  borderRadius: 999, border: "1px solid #EFE6D9", background: "#fff", color: "#8C7F72",
                  cursor: parsing ? "default" : "pointer",
                }}
              >
                <Paperclip size={14} />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelected} style={{ display: "none" }} />
            </>
          )}
        </div>
      )}

      {mode === "recording" && liveText && (
        <div style={{ fontSize: 12, color: "#8C7F72", fontStyle: "italic", maxWidth: 340 }}>"{liveText}"</div>
      )}

      {mode === "error" && error && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#9A4A22" }}>
          <AlertCircle size={12} />
          {error}
        </div>
      )}

      <style>{`
        @keyframes starPulse {
          0%, 100% { transform: scale(1); box-shadow: 0 1px 4px rgba(185,133,43,0.45); }
          50% { transform: scale(1.12); box-shadow: 0 2px 8px rgba(185,133,43,0.6); }
        }
      `}</style>
    </div>
  );
}
