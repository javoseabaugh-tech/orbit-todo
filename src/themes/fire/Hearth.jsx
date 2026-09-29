import { useEffect, useRef, useState } from "react";
import { prefersDarkDial, pageBackground } from "../../dial/tokens";
import { HEARTH } from "./shaders";
import { createScene, runScene, loadTexture } from "../water/gl";
import embersUrl from "./embers.jpg";

// The Fire home screen's backdrop: night air lit by the fire, with smoke and
// rising sparks, over a bed of coals that starts where the list starts
// (`edgeY`, CSS px from the top). `pit` is the fire pit's centre and radius in
// CSS px, so the glow, smoke and sparks come from it. Without WebGL the still
// coal background shows.
export default function Hearth({ edgeY, pit }) {
  const canvasRef = useRef(null);
  const live = useRef({ edgeY, pit });
  live.current = { edgeY, pit };
  const [still, setStill] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const scene = createScene(canvas, HEARTH, ["RES", "T", "HY", "PX", "PC", "PRD", "DK", "TX", "EMB"]);
    if (!scene) { setStill(true); return; }
    const { gl, U } = scene;
    gl.uniform1f(U.DK, prefersDarkDial ? 0 : 1);
    gl.uniform1i(U.EMB, 0);
    let ready = false;
    loadTexture(gl, 0, embersUrl, { repeat: true }, () => { ready = true; });
    const loop = runScene(canvas, gl, (dt, T) => {
      const { edgeY: hy, pit: p } = live.current;
      if (hy == null || !p) return;
      gl.uniform2f(U.RES, canvas.width, canvas.height);
      gl.uniform1f(U.T, T);
      gl.uniform1f(U.HY, hy);
      gl.uniform1f(U.PX, canvas.width / Math.max(1, canvas.clientWidth));
      gl.uniform2f(U.PC, p.x, p.y);
      gl.uniform1f(U.PRD, p.r);
      gl.uniform1f(U.TX, ready ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }, { scale: 0.9, interval: 1 / 40 });
    return () => loop.stop();
  }, []);

  return (
    <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none", background: pageBackground }}>
      {!still && <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />}
    </div>
  );
}
