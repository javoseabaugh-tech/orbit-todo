import { useRef, useState } from "react";
import { Trash2, Clock } from "lucide-react";
import { theme } from "./theme";

export default function SwipeToDelete({ onDelete, onSwipeRight, children }) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const active = useRef(false);
  const THRESHOLD = 130;

  function onPointerDown(e) {
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
    <div style={{ position: "relative", borderRadius: 14, overflow: "hidden" }}>
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
    </div>
  );
}
