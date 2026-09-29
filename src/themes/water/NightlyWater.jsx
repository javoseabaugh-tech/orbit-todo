import { useEffect, useRef, useState } from "react";
import { NIGHTLY } from "./shaders";
import { createScene, loadTexture, runScene } from "./gl";
import nightlyUrl from "./nightly.jpg";

// The Water theme's Nightly backdrop: the forest pool photo, alive. The water
// moves and mirrors the moon, the candle flickers, fireflies drift, and each
// change to `ripple` (a tick) sends a ring out from the candle. If the phone
// can't draw it, the still photo shows instead.

const CANDLE = [0.665, 0.492]; // where the candle sits in nightly.jpg

export default function NightlyWater({ ripple }) {
  const canvasRef = useRef(null);
  const [still, setStill] = useState(false);
  const sim = useRef({ rp: [CANDLE[0], CANDLE[1], -100], time: () => 0 });

  useEffect(() => {
    if (!ripple) return;
    sim.current.rp = [CANDLE[0], CANDLE[1], sim.current.time()];
  }, [ripple]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const scene = createScene(canvas, NIGHTLY, ["IMG", "RES", "T", "IA", "RP"]);
    if (!scene) { setStill(true); return; }
    const { gl, U } = scene;
    gl.uniform1i(U.IMG, 3);
    let aspect = 0, ready = false;
    loadTexture(gl, 3, nightlyUrl, { mipmap: false }, (img) => { aspect = img.naturalWidth / img.naturalHeight; ready = true; });
    const s = sim.current;
    const loop = runScene(canvas, gl, (dt, T) => {
      if (!ready) return;
      gl.uniform2f(U.RES, canvas.width, canvas.height);
      gl.uniform1f(U.T, T);
      gl.uniform1f(U.IA, aspect);
      gl.uniform3f(U.RP, s.rp[0], s.rp[1], s.rp[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
    s.time = loop.time;
    return () => { s.time = () => 0; loop.stop(); };
  }, []);

  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none", background: "#050c0e" }}>
      {still ? (
        <div style={{ position: "absolute", inset: 0, background: `url(${nightlyUrl}) center / cover no-repeat` }} />
      ) : (
        <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
      )}
      {/* Darkens the rocks and water behind the list so it stays readable. */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(rgba(3,8,10,.25), rgba(3,8,10,0) 22%, rgba(3,8,10,.1) 36%, rgba(3,8,10,.6) 52%, rgba(3,8,10,.72))",
      }} />
    </div>
  );
}
