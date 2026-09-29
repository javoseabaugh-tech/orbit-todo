import { useEffect, useRef, useState } from "react";
import { NIGHTLY_SKY } from "./shaders";
import { createScene, loadTexture, runScene } from "../water/gl";
import nightlyUrl from "./nightly.jpg";

// The Space theme's Nightly backdrop: the Milky Way over an observatory,
// alive. Stars twinkle, the dome's light breathes, a shooting star crosses now
// and then, and each change to `tick` sends one across. If the phone can't
// draw it, the still photo shows instead.

export default function NightlySpace({ tick }) {
  const canvasRef = useRef(null);
  const [still, setStill] = useState(false);
  const sim = useRef({ ss: [0, 0, -100], time: () => 0 });

  useEffect(() => {
    if (!tick) return;
    sim.current.ss = [0.55 + Math.random() * 0.35, 0.06 + Math.random() * 0.22, sim.current.time()];
  }, [tick]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const scene = createScene(canvas, NIGHTLY_SKY, ["IMG", "RES", "T", "IA", "SS"]);
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
      gl.uniform3f(U.SS, s.ss[0], s.ss[1], s.ss[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
    s.time = loop.time;
    return () => { s.time = () => 0; loop.stop(); };
  }, []);

  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none", background: "#05060d" }}>
      {still ? (
        <div style={{ position: "absolute", inset: 0, background: `url(${nightlyUrl}) center / cover no-repeat` }} />
      ) : (
        <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
      )}
      {/* A little shade over the sky behind the title and the list. */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(rgba(4,5,14,.35), rgba(4,5,14,0) 25%, rgba(4,5,14,.15) 45%, rgba(4,5,14,.45) 62%, rgba(4,5,14,.55))",
      }} />
    </div>
  );
}
