import { useEffect, useState } from "react";

// How far the on-screen keyboard currently covers the bottom of the layout
// viewport, in px. iOS doesn't shrink the layout for the keyboard, so anything
// pinned to the bottom (a sheet, a message composer) adds this to its offset
// to stay above the keys.
export default function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}
