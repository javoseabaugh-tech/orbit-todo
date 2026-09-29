import { useEffect, useRef, useState } from "react";
import { NIGHTLY_FIRE } from "./shaders";
import { createScene, loadTexture, runScene } from "../water/gl";
import nightlyUrl from "./nightly.jpg";

// The Fire theme's Nightly backdrop: a campfire in a pine clearing, alive. The
// flames flicker and shimmer, firelight pulses on the ground, sparks rise,
// stars twinkle, and each change to `tick` sends up a flurry of sparks. If the
// phone can't draw it, the still photo shows instead.
export default function NightlyFire({ tick }) {
  const canvasRef = useRef(null);
  const [still, setStill] = useState(false);
  const sim = useRef({ t0: -100, time: () => 0 });

  useEffect(() => {
    if (tick) sim.current.t0 = sim.current.time();
  }, [tick]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const scene = createScene(canvas, NIGHTLY_FIRE, ["IMG", "RES", "T", "IA", "SS"]);
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
      gl.uniform3f(U.SS, 0.5, 0.43, s.t0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
    s.time = loop.time;
    return () => { s.time = () => 0; loop.stop(); };
  }, []);

  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none", background: "#070403" }}>
      {still ? (
        <div style={{ position: "absolute", inset: 0, background: `url(${nightlyUrl}) center / cover no-repeat` }} />
      ) : (
        <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
      )}
      {/* Shade behind the title and the list. */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(rgba(6,3,2,.35), rgba(6,3,2,0) 22%, rgba(6,3,2,.1) 45%, rgba(6,3,2,.5) 62%, rgba(6,3,2,.6))",
      }} />
    </div>
  );
}
