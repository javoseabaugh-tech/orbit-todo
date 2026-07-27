import { useState } from "react";
import { Palette, Check } from "lucide-react";
import { theme, PALETTE_OPTIONS, paletteId, setPaletteId } from "./theme";

// Styled to match the other UserMenu dropdown rows. Selecting a palette
// triggers a full-page reload — see the note in theme.js.
export default function PaletteMenu() {
  const [open, setOpen] = useState(false);

  const rowStyle = {
    width: "100%", display: "flex", alignItems: "center", gap: 8,
    border: "none", background: "transparent", color: theme.textSecondary,
    fontSize: 13, fontWeight: 700, padding: "8px 10px", borderRadius: 8,
    cursor: "pointer",
  };

  return (
    <>
      <button onClick={() => setOpen((o) => !o)} style={rowStyle}>
        <Palette size={14} />
        Color theme
      </button>

      {open && (
        <div style={{ padding: "2px 4px 6px" }}>
          {PALETTE_OPTIONS.map((opt) => {
            const active = opt.id === paletteId;
            return (
              <button
                key={opt.id}
                onClick={() => setPaletteId(opt.id)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  border: "none", background: active ? theme.softBg : "transparent",
                  color: active ? theme.accentPlum : theme.textSecondary,
                  fontSize: 12.5, fontWeight: active ? 700 : 600,
                  padding: "7px 8px", borderRadius: 7, cursor: "pointer",
                }}
              >
                <span style={{
                  width: 13, height: 13, borderRadius: 999, flexShrink: 0,
                  background: opt.swatch,
                  border: `1px solid ${theme.borderSoft}`,
                }} />
                <span style={{ flex: 1, textAlign: "left" }}>{opt.label}</span>
                {active && <Check size={12} />}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}