import { useRef, useState } from "react";
import { Trash2, Clock } from "lucide-react";
import { theme } from "./theme";

// Computed once at module scope (same pattern as theme.js). True only for
// mouse/trackpad devices — phones report (hover: none), so the hover action
// buttons below never render there and swipe stays the only mobile interaction.
const HOVER_CAPABLE =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(hover: hover) and (pointer: fine)").matches;

export default function SwipeToDelete({ onDelete, onSwipeRight, reordering, children }) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const startX = useRef(0);
  const active = useRef(false);
  const THRESHOLD = 130;
  function onPointerDown(e) {
    // Let real interactive elements (the complete checkbox, any other
    // button/input a row contains) behave like normal clicks. Otherwise
    // setPointerCapture below reroutes the eventual click away from whatever
    // was actually pressed — which is what silently broke the complete
    // toggle on desktop (a mouse click always carries a hair of pointer
    // movement, unlike a touch tap, so it always entered drag tracking).
    if (e.target.closest("button, input, textarea, select, a, [data-drag-handle]")) return;
    startX.current = e.clientX;
    active.current = true;
    setDragging(true);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
  }
  function onPointerMove(e) {
    if (!active.current) return;
    const delta = e.clientX - startX.current;
    setDragX(onSwipeRight ? delta : Math.min(0, delta));
  }
  function finish() {
    if (!active.current) return;
    active.current = false;
    setDragging(false);
    if (dragX < -THRESHOLD) {
      const allowed = onDelete();
      if (allowed === false) {
        setDragX(0);
      } else {
        setDragX(-500);
      }
    } else if (onSwipeRight && dragX > THRESHOLD) {
      setDragX(0);
      onSwipeRight();
    } else {
      setDragX(0);
    }
  }
  return (
    <div
      style={{ position: "relative", borderRadius: 14, overflow: reordering ? "visible" : "hidden", zIndex: reordering ? 100 : "auto" }}
      onMouseEnter={HOVER_CAPABLE ? () => setHovered(true) : undefined}
      onMouseLeave={HOVER_CAPABLE ? () => setHovered(false) : undefined}
    >
      {/* Only the layer matching the current drag direction is rendered. Both
          at once meant the gold one sat on top of the red one in the DOM and
          won regardless of which way you swiped. */}
      {dragX < 0 && (
        <div style={{
          position: "absolute", inset: 0, background: theme.accentRed, borderRadius: 14,
          display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 22,
        }}>
          <Trash2 size={18} color={theme.cardBg} />
        </div>
      )}
      {onSwipeRight && dragX > 0 && (
        <div style={{
          position: "absolute", inset: 0, background: theme.goldDark || "#c9a06a", borderRadius: 14,
          display: "flex", alignItems: "center", justifyContent: "flex-start", paddingLeft: 22,
        }}>
          <Clock size={18} color={theme.cardBg} />
        </div>
      )}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        style={{
          transform: `translateX(${dragX}px)`,
          transition: dragging ? "none" : "transform 0.2s ease",
          touchAction: "pan-y",
        }}
      >
        {children}
      </div>

      {/* Desktop-only hover actions: mouse users can't swipe comfortably, so
          reveal Delete (and the reminder-time button) on row hover. Never
          rendered on touch devices, so mobile behavior is unchanged.
          `right: 36` (instead of 0) leaves TaskCard's own edit-pencil button
          — which sits ~34px from the card's right edge (12px card padding +
          ~22px button) — outside this overlay's hitbox, so it stays
          clickable instead of getting covered by these buttons. That strip
          is already theme.cardBg like the rest of the card, so nothing
          looks different there when the overlay isn't showing. */}
      {HOVER_CAPABLE && (
        <div
          style={{
            position: "absolute", top: 0, right: 36, bottom: 0,
            display: "flex", alignItems: "center", gap: 6,
            paddingLeft: 28, paddingRight: 4,
            opacity: hovered ? 1 : 0,
            pointerEvents: hovered ? "auto" : "none",
            transition: "opacity 0.12s ease",
            background: `linear-gradient(to right, transparent, ${theme.cardBg} 60%)`,
            zIndex: 5,
          }}
        >
          {onSwipeRight && (
            <button
              onClick={onSwipeRight}
              title="Set a reminder time"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 30, height: 30, borderRadius: 8, cursor: "pointer",
                background: theme.softBg, color: theme.goldDark || "#c9a06a", border: "none",
              }}
            >
              <Clock size={15} />
            </button>
          )}
          <button
            onClick={() => onDelete()}
            title="Delete"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 30, height: 30, borderRadius: 8, cursor: "pointer",
              background: theme.softBg, color: theme.accentRed, border: "none",
            }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      )}
    </div>
  );
}