import { useEffect, useRef, useState } from "react";
import { FONT_DISPLAY, prefersDarkDial } from "../../dial/tokens";
import { reminderHM, nowHM } from "../../dial/dates";
import Dial from "../../dial/Dial";
import { PLANET } from "./shaders";
import { createScene, runScene, loadTexture } from "../water/gl";
import { skyLayers, skyWash } from "./starfield";
import planetMap from "./planet.jpg";

// The Space theme's version of the dial: a live gas giant floating among the
// stars. Same job as Dial.jsx: the middle says how many of today's todos are
// open, the orbit round the planet fills clockwise as they get done, each
// timed reminder is a small moon at its hour on that orbit (tap it to open the
// todo), and a chip on the orbit marks the current time. The sun also comes
// round the planet with progress (crescent to full), a ticked moon breaks
// orbit and streaks away, and finishing the day brings a sunrise flare.
// Falls back to the plain dial if the phone can't draw it.

const HEIGHT = 320;
const RF = 0.3; // planet radius as a share of the box's shorter side (orbit at 1.42×)
const RR = 1.42;
const MAX_MOONS = 6;

// The planet's surface: a Gemini map, edges blended so it wraps without a
// seam. Until it loads the shader draws a stand-in surface.
const PLANET_MAP = planetMap;

const toMinutes = (hm) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
const angleOf = (min) => ((min % 720) / 720) * Math.PI * 2; // 0 at 12, clockwise

// The sky, drifting behind the home screen (this covers the still copy the
// page itself draws). The nebula barely moves; the two star layers slide at
// different speeds so they seem to sit at different depths, and the near
// stars breathe slightly. Still for reduced motion.
const DRIFT_CSS = `
@keyframes spaceNeb { from { background-position: 0 0 } to { background-position: -900px 450px } }
@keyframes spaceNear { from { background-position: 0 0 } to { background-position: -420px 210px } }
@keyframes spaceFar { from { background-position: 0 0 } to { background-position: -294px 147px } }
@keyframes spaceTwinkle { 0%, 100% { opacity: 1 } 50% { opacity: .7 } }
@media (prefers-reduced-motion: reduce) { .space-drift { animation: none !important } }`;

function Drift() {
  const layers = skyLayers(prefersDarkDial);
  const anim = ["spaceNeb 400s", "spaceNear 180s", "spaceFar 300s"];
  return (
    <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none", overflow: "hidden", background: skyWash(prefersDarkDial) }}>
      <style>{DRIFT_CSS}</style>
      {layers.map((l, i) => (
        <div key={i} className="space-drift" style={{
          position: "absolute", inset: 0, backgroundImage: l.image, backgroundSize: `${l.size}px ${l.size}px`,
          animation: `${anim[i]} linear infinite${i === 1 ? ", spaceTwinkle 7s ease-in-out infinite" : ""}`,
        }} />
      ))}
    </div>
  );
}

export default function SpaceDial({ todayTodos, isAssigned, onOpen }) {
  const canvasRef = useRef(null);
  const [noGL, setNoGL] = useState(false);
  const total = todayTodos.length;
  const done = todayTodos.filter((t) => t.done).length;
  const open = total - done;
  const level = total ? done / total : 1;

  const moons = todayTodos
    .filter((t) => !t.done && reminderHM(t))
    .slice(0, MAX_MOONS)
    .map((t) => ({ todo: t, a: angleOf(toMinutes(reminderHM(t))), assigned: isAssigned(t) }));

  // Everything the animation reads lives here, so React re-renders never
  // restart it.
  const sim = useRef({ moons: new Map(), lv: level, target: level, surge: 0, lastOpen: open });

  // Follow the todos: new moons fade in, ticked ones break orbit.
  useEffect(() => {
    const s = sim.current;
    const ids = new Set(moons.map((m) => m.todo.id));
    moons.forEach((m) => {
      const cur = s.moons.get(m.todo.id);
      s.moons.set(m.todo.id, { a: m.a, assigned: m.assigned, alive: cur && !cur.leaving ? cur.alive : 0, leaving: 0 });
    });
    s.moons.forEach((m, id) => { if (!ids.has(id) && !m.leaving) m.leaving = 0.001; });
    s.target = level;
    if (s.lastOpen > 0 && open === 0 && total > 0) s.surge = 1;
    s.lastOpen = open;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const scene = createScene(canvas, PLANET,
      ["C", "RAD", "T", "LV", "NT", "SURGE", "NOW", "TX", "MK", "MAP"], { alpha: true });
    if (!scene) { setNoGL(true); return; }
    const { gl, U } = scene;
    gl.uniform1f(U.NT, prefersDarkDial ? 1 : 0);
    gl.uniform1i(U.MAP, 0);
    let mapReady = false;
    if (PLANET_MAP) loadTexture(gl, 0, PLANET_MAP, { repeat: true }, () => { mapReady = true; });

    const s = sim.current;
    const mk = new Float32Array(MAX_MOONS * 4);
    const loop = runScene(canvas, gl, (dt) => {
      s.lv += (s.target - s.lv) * Math.min(1, dt * 1.4);
      s.surge = Math.max(0, s.surge - dt * 0.35);
      mk.fill(0);
      let i = 0;
      s.moons.forEach((m, id) => {
        if (m.leaving) {
          m.leaving = Math.min(1, m.leaving + dt * 0.9);
          if (m.leaving >= 1) { s.moons.delete(id); return; }
        } else {
          m.alive += (1 - m.alive) * Math.min(1, dt * 2.5);
        }
        if (i < MAX_MOONS) { mk.set([m.a, m.alive, m.assigned ? 1 : 0, m.leaving], i * 4); i++; }
      });
      const w = canvas.width, h = canvas.height;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(U.C, w / 2, h / 2);
      gl.uniform1f(U.RAD, Math.min(w, h) * RF);
      gl.uniform1f(U.T, loop.time());
      gl.uniform1f(U.LV, s.lv);
      gl.uniform1f(U.SURGE, s.surge);
      gl.uniform1f(U.NOW, angleOf(toMinutes(nowHM())));
      gl.uniform1f(U.TX, mapReady ? 1 : 0);
      gl.uniform4fv(U.MK, mk);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
    return () => loop.stop();
  }, []);

  if (noGL) return <div style={{ padding: "0 16px" }}><Dial todayTodos={todayTodos} isAssigned={isAssigned} onOpen={onOpen} /></div>;

  const textShadow = "0 1px 3px rgba(4,6,20,.7), 0 0 14px rgba(4,6,20,.5)";
  return (
    <>
      <Drift />
      <div style={{ position: "relative", height: HEIGHT, flexShrink: 0, margin: "4px 0 6px" }}>
        <canvas ref={canvasRef} aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />

        <MoonButtons moons={moons} onOpen={onOpen} />

        <div role="img" aria-label={total ? `${open} of ${total} left today` : "Nothing due today"} style={{
          position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none",
          textAlign: "center", color: "#fff", textShadow,
        }}>
          <div>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 44, lineHeight: 1 }}>{total ? open : "0"}</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 4 }}>
              {!total ? "nothing today" : open === 0 ? "all done today" : "left today"}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Invisible tap targets over the moons, placed on the orbit at each hour.
function MoonButtons({ moons, onOpen }) {
  const ref = useRef(null);
  const [box, setBox] = useState(null);
  useEffect(() => {
    const el = ref.current;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ position: "absolute", inset: 0 }}>
      {box && moons.map(({ todo, a }) => {
        const R = Math.min(box.w, box.h) * RF * RR;
        const x = box.w / 2 + R * Math.sin(a), y = box.h / 2 - R * Math.cos(a);
        return (
          <button key={todo.id} onClick={() => onOpen(todo)} title={todo.text} aria-label={`Open ${todo.text}`}
            style={{
              position: "absolute", left: x - 20, top: y - 20, width: 40, height: 40, padding: 0,
              border: "none", borderRadius: "50%", background: "transparent", cursor: "pointer",
            }} />
        );
      })}
    </div>
  );
}
