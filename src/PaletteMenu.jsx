import { useState } from "react";
import { Palette, Check, ChevronDown } from "lucide-react";
import { theme, PALETTE_OPTIONS, paletteId, setPaletteId, SPRING } from "./theme";

// Styled to match the other rows in the raised-glass user menu. Selecting a
// theme triggers a full-page reload — see the note in theme.js.
export default function PaletteMenu() {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 9,
          padding: "9px 11px", borderRadius: 12, border: "none", cursor: "pointer",
          fontSize: 13, fontWeight: 500, color: theme.textSecondary,
          background: hover ? theme.inputBg : "transparent",
          transition: "background .2s ease",
        }}
      >
        <Palette size={15} />
        Theme
        <ChevronDown
          size={13}
          style={{
            marginLeft: "auto", color: theme.textFainter,
            transform: open ? "none" : "rotate(-90deg)",
            transition: `transform .35s ${SPRING}`,
          }}
        />
      </button>

      {open && (
        <div style={{ padding: "3px 4px 7px", display: "flex", flexDirection: "column", gap: 2, animation: `popIn .25s ${SPRING}` }}>
          {PALETTE_OPTIONS.map((opt) => {
            const active = opt.id === paletteId;
            return (
              <button
                key={opt.id}
                onClick={() => setPaletteId(opt.id)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 9,
                  padding: "8px 10px", borderRadius: 11, border: "none", cursor: "pointer",
                  fontSize: 12.5, fontWeight: active ? 600 : 500,
                  color: active ? theme.accentPlum : theme.textSecondary,
                  background: active ? theme.accentSoft : "transparent",
                  transition: `all .25s ${SPRING}`,
                }}
              >
                <span style={{
                  width: 15, height: 15, borderRadius: 999, flexShrink: 0,
                  background: opt.swatch, border: `1px solid ${theme.glassBorder}`,
                }} />
                <span style={{ flex: 1, textAlign: "left" }}>{opt.label}</span>
                {active && <Check size={13} />}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
