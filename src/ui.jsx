// ---------------------------------------------------------------------------
// Shared liquid-glass UI primitives.
//
// The design tokens themselves live in theme.js — see its header for where it
// has diverged from the handoff bundle. This module is the thin layer on top:
// the type ramp, the tint helper, and the handful of control recipes that
// every screen repeats — so Projects, Ask Star, Nightly and Access all draw
// from the same values instead of each re-deriving them.
// ---------------------------------------------------------------------------
import { useState } from "react";
import { theme, SPRING, prefersDark, mixColor as mix } from "./theme";

export const DISPLAY = "'Bricolage Grotesque', system-ui, sans-serif";
export const MONO = "'Geist Mono', ui-monospace, monospace";

// Titles: Bricolage 600 with the tight tracking from the design tokens.
export function display(size, letterSpacing = "-.02em") {
  return { fontFamily: DISPLAY, fontSize: size, fontWeight: 600, letterSpacing };
}

// Every accent tint in the design is a percentage of a theme colour over
// transparency, which keeps them legible in both light and dark. The
// implementation lives in theme.js next to the rest of the colour maths,
// because it falls back to computing the mix by hand where color-mix() is
// missing — re-exported here so screens keep importing tints from one place.
export { mix };

// Accent-filled when on, plain glass when off — tabs, filters, toggles.
export function pillStyle(on) {
  return {
    display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 999,
    fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", cursor: "pointer",
    color: on ? theme.accentPlum : theme.textMuted,
    background: on ? theme.accentSoft : theme.inputBg,
    border: `1px solid ${on ? theme.accentPlum : theme.glassBorder2}`,
    backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
    transition: `all .25s ${SPRING}`,
  };
}

// Accent-gradient button, dimmed to plain glass until it has something to do.
export function accentButtonStyle(enabled) {
  return {
    color: enabled ? theme.accentInk : theme.textFainter,
    background: enabled ? `linear-gradient(140deg, ${theme.accentPlum}, ${theme.accent2})` : theme.inputBg,
    boxShadow: enabled ? `0 8px 22px -10px ${theme.accentPlum}` : "none",
    border: "none", cursor: enabled ? "pointer" : "default",
    transition: `all .3s ${SPRING}`,
  };
}

// Shared field chrome for inputs, selects and textareas.
export function fieldStyle() {
  return {
    width: "100%", padding: "11px 13px", borderRadius: 14, fontSize: 13.5,
    color: theme.textPrimary, background: theme.inputBg,
    border: `1px solid ${theme.glassBorder2}`,
  };
}

export const quietButtonStyle = {
  border: "none", background: "transparent", color: theme.textFainter,
  fontSize: 11.5, fontWeight: 500, cursor: "pointer", padding: "3px 7px", borderRadius: 8,
};

// Quiet icon button that colours in on hover — pencil, clock, trash, promote.
export function IconAction({ onClick, title, children, hoverColor, active, activeColor, size = 5 }) {
  const [hover, setHover] = useState(false);
  const color = hover ? (hoverColor || theme.textPrimary) : active ? activeColor : theme.textFainter;
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: size, borderRadius: 9, border: "none", cursor: "pointer", color,
        background: hover
          ? mix(hoverColor || theme.textPrimary, 14)
          : active ? mix(activeColor, 14) : "transparent",
        transition: "all .25s ease",
      }}
    >
      {children}
    </button>
  );
}

// The drifting colour field every glass surface is frosted over. Fixed and
// pointer-transparent, so it never participates in layout or hit testing.
export function GlassBackdrop() {
  const blobs = [
    { style: { top: "-18vh", left: "-12vw", width: "62vw", height: "62vw" }, color: theme.blobs[0], blur: 90, anim: "drift1 26s", opacity: theme.blobOpacity },
    { style: { top: "20vh", right: "-16vw", width: "56vw", height: "56vw" }, color: theme.blobs[1], blur: 100, anim: "drift2 32s", opacity: theme.blobOpacity },
    { style: { bottom: "-22vh", left: "22vw", width: "52vw", height: "52vw" }, color: theme.blobs[2], blur: 96, anim: "drift3 38s", opacity: Math.max(0, theme.blobOpacity - 0.13) },
  ];
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden",
        background: `radial-gradient(140% 90% at 50% 0%, ${theme.gradA}, ${theme.gradB} 70%)`,
      }}
    >
      {blobs.map((b, i) => (
        <div
          key={i}
          style={{
            position: "absolute", borderRadius: "50%", ...b.style,
            background: b.color, filter: `blur(${b.blur}px)`, opacity: b.opacity,
            animation: `${b.anim} ease-in-out infinite`,
          }}
        />
      ))}
      <div style={{
        position: "absolute", inset: 0, opacity: prefersDark ? 0.035 : 0.02, mixBlendMode: "overlay",
        backgroundImage:
          "repeating-linear-gradient(0deg,rgba(255,255,255,.5) 0 1px,transparent 1px 3px)," +
          "repeating-linear-gradient(90deg,rgba(0,0,0,.5) 0 1px,transparent 1px 3px)",
      }} />
    </div>
  );
}

// "2026-09-12" -> "Sep 12". Undated returns "".
export function fmtDay(d) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
