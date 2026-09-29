import { useEffect, useRef, useState } from "react";
import { prefersDarkDial } from "../../dial/tokens";
import { SHORE } from "./shaders";
import { createScene, runScene } from "./gl";
import { causticBackground } from "./caustics";

// The Water home screen's backdrop: a beach seen from above. The basin sits
// on the sand; the sea starts at `shoreY` (CSS px from the top of the screen,
// where the list begins) and a wave washes up the sand every few seconds.
// Drawn a little below full resolution. Without WebGL the still pool
// background shows instead.
export default function Shore({ shoreY }) {
  const canvasRef = useRef(null);
  const shore = useRef(shoreY);
  const [still, setStill] = useState(false);
  shore.current = shoreY;

  useEffect(() => {
    const canvas = canvasRef.current;
    const scene = createScene(canvas, SHORE, ["RES", "T", "NT", "SH", "PX"]);
    if (!scene) { setStill(true); return; }
    const { gl, U } = scene;
    gl.uniform1f(U.NT, prefersDarkDial ? 1 : 0);
    const loop = runScene(canvas, gl, (dt, T) => {
      gl.uniform2f(U.RES, canvas.width, canvas.height);
      gl.uniform1f(U.T, T);
      gl.uniform1f(U.SH, shore.current);
      gl.uniform1f(U.PX, canvas.width / Math.max(1, canvas.clientWidth));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }, { scale: 0.85 });
    return () => loop.stop();
  }, []);

  return (
    <div aria-hidden="true" style={{
      position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none",
      background: causticBackground(prefersDarkDial),
    }}>
      {!still && <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />}
    </div>
  );
}
