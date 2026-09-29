import { useEffect, useRef, useState } from "react";
import { prefersDarkDial } from "../../dial/tokens";
import { SKY, HORIZON } from "./shaders";
import { createScene, runScene } from "../water/gl";
import { skyLayers, skyBackground } from "./starfield";

// The Space home screen's backdrop: the living nebula (drawn by the GPU at low
// resolution, a few times a second) with crisp stars on top that drift at two
// depths and twinkle, and now and then a shooting star. Without WebGL the
// still starfield shows instead. Still for reduced motion.
const CSS = `
@keyframes skyNear { from { background-position: 0 0 } to { background-position: -420px 210px } }
@keyframes skyFar { from { background-position: 0 0 } to { background-position: -294px 147px } }
@keyframes skyTwinkleA { 0%, 100% { opacity: 1 } 50% { opacity: .55 } }
@keyframes skyTwinkleB { 0%, 100% { opacity: .6 } 50% { opacity: 1 } }
@keyframes skyShoot {
  0%, 88% { opacity: 0; transform: translate(0, 0) rotate(-32deg) scaleX(.2) }
  89% { opacity: 1 }
  95% { opacity: 0; transform: translate(-260px, 160px) rotate(-32deg) scaleX(1) }
  100% { opacity: 0 }
}
@media (prefers-reduced-motion: reduce) { .sky-anim { animation: none !important } }`;

export default function SpaceSky({ horizonY }) {
  const canvasRef = useRef(null);
  const [still, setStill] = useState(false);
  const night = prefersDarkDial;

  useEffect(() => {
    const canvas = canvasRef.current;
    const scene = createScene(canvas, SKY, ["RES", "T", "NT"]);
    if (!scene) { setStill(true); return; }
    const { gl, U } = scene;
    gl.uniform1f(U.NT, night ? 1 : 0);
    const loop = runScene(canvas, gl, (dt, T) => {
      gl.uniform2f(U.RES, canvas.width, canvas.height);
      gl.uniform1f(U.T, T);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }, { scale: 0.45, interval: 0.2 });
    return () => loop.stop();
  }, []);

  const [, near, far, dust] = skyLayers(night);
  const stars = (l, anim) => ({
    position: "absolute", inset: 0, backgroundImage: l.image, backgroundSize: `${l.size}px ${l.size}px`, animation: anim,
  });
  return (
    <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none", overflow: "hidden", background: skyBackground(night) }}>
      <style>{CSS}</style>
      {!still && <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />}
      {night && (
        <>
          <div className="sky-anim" style={stars(dust, "skyFar 420s linear infinite")} />
          <div className="sky-anim" style={stars(far, "skyFar 300s linear infinite, skyTwinkleB 9s ease-in-out infinite")} />
          <div className="sky-anim" style={stars(near, "skyNear 180s linear infinite, skyTwinkleA 6s ease-in-out infinite")} />
          <div className="sky-anim" style={{
            position: "absolute", top: "14%", right: "-4%", width: 150, height: 2, borderRadius: 2,
            background: "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.95))",
            boxShadow: "0 0 8px rgba(200,210,255,.8)", transformOrigin: "right center",
            animation: "skyShoot 17s ease-out infinite", animationDelay: "6s", opacity: 0,
          }} />
          <div className="sky-anim" style={{
            position: "absolute", top: "38%", right: "10%", width: 110, height: 1.5, borderRadius: 2,
            background: "linear-gradient(90deg, rgba(255,255,255,0), rgba(220,225,255,.9))",
            boxShadow: "0 0 6px rgba(200,210,255,.7)", transformOrigin: "right center",
            animation: "skyShoot 29s ease-out infinite", animationDelay: "19s", opacity: 0,
          }} />
        </>
      )}
      <Horizon horizonY={horizonY} night={night} />
    </div>
  );
}

// The near world's curved edge, its atmosphere and (by night) aurora, drawn
// over the stars at full frame rate but reduced resolution.
function Horizon({ horizonY, night }) {
  const canvasRef = useRef(null);
  const hy = useRef(horizonY);
  hy.current = horizonY;
  useEffect(() => {
    const canvas = canvasRef.current;
    const scene = createScene(canvas, HORIZON, ["RES", "T", "NT", "HY", "PX"], { alpha: true });
    if (!scene) return;
    const { gl, U } = scene;
    gl.uniform1f(U.NT, night ? 1 : 0);
    const loop = runScene(canvas, gl, (dt, T) => {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (hy.current == null) return; // not measured yet
      gl.uniform2f(U.RES, canvas.width, canvas.height);
      gl.uniform1f(U.T, T);
      gl.uniform1f(U.HY, hy.current);
      gl.uniform1f(U.PX, canvas.width / Math.max(1, canvas.clientWidth));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }, { scale: 0.7 });
    return () => loop.stop();
  }, []);
  return <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />;
}
