import { useRef, useState } from "react";
import { Trash2, Clock } from "lucide-react";
import { theme, SPRING } from "./theme";

// Computed once at module scope (same pattern as theme.js). True only for
// mouse/trackpad devices — phones report (hover: none). App.jsx uses it to
// decide whether a narrow window still gets explicit row buttons, since swipe
// is awkward with a mouse.
export const HOVER_CAPABLE =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(hover: hover) and (pointer: fine)").matches;

export default function SwipeToDelete({ onDelete, onSwipeRight, reordering, children }) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
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
  // The revealed action layer sits behind the card and fades in with the
  // swipe distance, matching the glass treatment of the row above it.
  const actionLayer = {
    position: "absolute", inset: 0, borderRadius: 22,
    display: "flex", alignItems: "center",
    padding: "0 20px", fontSize: 12, fontWeight: 600,
    background: theme.inputBg, border: `1px solid ${theme.glassBorder2}`,
    opacity: Math.min(1, Math.abs(dragX) / 40),
  };

  return (
    <div
      style={{ position: "relative", borderRadius: 22, overflow: reordering ? "visible" : "hidden", zIndex: reordering ? 100 : "auto" }}
    >
      {/* Only the layer matching the current drag direction is rendered. Both
          at once meant the gold one sat on top of the red one in the DOM and
          won regardless of which way you swiped. */}
      {dragX < 0 && (
        <div style={{ ...actionLayer, justifyContent: "flex-end", gap: 6, color: theme.accentRed }}>
          Delete
          <Trash2 size={14} />
        </div>
      )}
      {onSwipeRight && dragX > 0 && (
        <div style={{ ...actionLayer, justifyContent: "flex-start", gap: 6, color: theme.goldDot }}>
          <Clock size={14} />
          Remind
        </div>
      )}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        style={{
          transform: `translateX(${dragX}px)`,
          transition: dragging ? "none" : `transform .42s ${SPRING}`,
          touchAction: "pan-y",
        }}
      >
        {children}
      </div>

    </div>
  );
}