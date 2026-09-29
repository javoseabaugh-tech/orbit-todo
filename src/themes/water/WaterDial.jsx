import { useEffect, useRef, useState } from "react";
import { FONT_DISPLAY, prefersDarkDial } from "../../dial/tokens";
import { reminderHM, nowHM } from "../../dial/dates";
import Dial from "../../dial/Dial";
import { DISC } from "./shaders";
import { createScene, loadTexture, runScene, reducedMotion } from "./gl";
import limestoneUrl from "./limestone.jpg";
import { causticLayers, causticWash } from "./caustics";

// The Water theme's version of the dial: a limestone basin of live water
// floating over the page's light patterns. Same job as Dial.jsx: the middle says how
// many of today's todos are open, the ring fills around the clock as they get
// done, each timed reminder is a lily pad at its hour (tap it to open the
// todo), and a chip on the ring marks the current time. The water also rises
// with progress, a ticked reminder's pad sinks with a ripple, and finishing
// the day makes the water surge. Falls back to the plain dial if the phone
// can't draw it.

const HEIGHT = 320;
const RF = 0.39; // basin radius as a share of the box's shorter side (ring at 1.17×)
const MAX_PADS = 6;
const waterRadiusAt = (level) => 0.72 + 0.28 * level;
const waterCentreAt = (level) => [0, -(1 - level) * 0.04];

const toMinutes = (hm) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
const angleOf = (min) => ((min % 720) / 720) * Math.PI * 2; // 0 at 12, clockwise

// Where a pad floats, in basin radii (y up). Mirrors padPos() in the shader.
function padPos(a, level, T) {
  const r = waterRadiusAt(level) * 0.68, [ex, ey] = waterCentreAt(level);
  return [ex + r * Math.sin(a) + 0.02 * Math.sin(T * 0.5 + a * 3), ey + r * Math.cos(a) + 0.02 * Math.cos(T * 0.4 + a * 2)];
}

// The page's light patterns, drifting slowly behind the home screen (this
// covers the still copy the page itself draws).
const DRIFT_CSS = `
@keyframes waterDriftA { from { background-position: 0 0 } to { background-position: 360px 720px } }
@keyframes waterDriftB { from { background-position: 0 0 } to { background-position: -522px 522px } }
@media (prefers-reduced-motion: reduce) { .water-drift { animation: none !important } }`;

function Drift() {
  const [a, b] = causticLayers(prefersDarkDial);
  const layer = (l, name, secs) => ({
    position: "absolute", inset: 0, backgroundImage: l.image, backgroundSize: `${l.size}px ${l.size}px`,
    animation: `${name} ${secs}s linear infinite`,
  });
  return (
    <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none", overflow: "hidden", background: causticWash(prefersDarkDial) }}>
      <style>{DRIFT_CSS}</style>
      <div className="water-drift" style={layer(a, "waterDriftA", 140)} />
      <div className="water-drift" style={layer(b, "waterDriftB", 190)} />
    </div>
  );
}

export default function WaterDial({ todayTodos, isAssigned, onOpen }) {
  const canvasRef = useRef(null);
  const [noGL, setNoGL] = useState(false);
  const total = todayTodos.length;
  const done = todayTodos.filter((t) => t.done).length;
  const open = total - done;
  const level = total ? done / total : 1;

  const pads = todayTodos
    .filter((t) => !t.done && reminderHM(t))
    .slice(0, MAX_PADS)
    .map((t) => ({ todo: t, a: angleOf(toMinutes(reminderHM(t))), assigned: isAssigned(t) }));

  // Everything the animation reads lives here, so React re-renders never
  // restart it.
  const sim = useRef({
    pads: new Map(), rip: new Float32Array(24).fill(-100), ripK: 0,
    lv: level, target: level, surge: 0, lastOpen: open, time: () => 0,
  });
  const ripple = (x, y) => {
    const s = sim.current;
    s.rip[s.ripK * 3] = x; s.rip[s.ripK * 3 + 1] = y; s.rip[s.ripK * 3 + 2] = s.time();
    s.ripK = (s.ripK + 1) % 8;
  };

  // Follow the todos: new pads rise, ticked ones sink with a ripple.
  useEffect(() => {
    const s = sim.current;
    const T = s.time();
    const ids = new Set(pads.map((p) => p.todo.id));
    pads.forEach((p) => {
      const cur = s.pads.get(p.todo.id);
      s.pads.set(p.todo.id, { a: p.a, assigned: p.assigned, alive: cur ? cur.alive : 0, target: 1 });
    });
    s.pads.forEach((pad, id) => {
      if (!ids.has(id) && pad.target === 1) {
        pad.target = 0;
        const [x, y] = padPos(pad.a, s.lv, T);
        ripple(x, y);
      }
    });
    s.target = level;
    if (s.lastOpen > 0 && open === 0 && total > 0 && !reducedMotion) {
      s.surge = 1;
      ripple(0, 0);
      setTimeout(() => ripple(0.3, 0.2), 250);
      setTimeout(() => ripple(-0.3, -0.25), 500);
    }
    s.lastOpen = open;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const scene = createScene(canvas, DISC,
      ["C", "RAD", "T", "LV", "NT", "SURGE", "NOW", "RIP", "MK", "LIME", "TX"], { alpha: true });
    if (!scene) { setNoGL(true); return; }
    const { gl, U } = scene;
    gl.uniform1f(U.NT, prefersDarkDial ? 1 : 0);
    gl.uniform1i(U.LIME, 0);
    let stone = false;
    loadTexture(gl, 0, limestoneUrl, { repeat: true }, () => { stone = true; });

    const s = sim.current;
    const mk = new Float32Array(MAX_PADS * 4);
    const loop = runScene(canvas, gl, (dt, T) => {
      s.lv += (s.target - s.lv) * Math.min(1, dt * 1.6);
      s.surge = Math.max(0, s.surge - dt * 0.3);
      mk.fill(0);
      let i = 0;
      s.pads.forEach((pad, id) => {
        pad.alive += (pad.target - pad.alive) * Math.min(1, dt * 2.8);
        if (pad.target === 0 && pad.alive < 0.01) { s.pads.delete(id); return; }
        if (i < MAX_PADS) { mk.set([pad.a, pad.alive, pad.assigned ? 1 : 0, 0], i * 4); i++; }
      });
      const w = canvas.width, h = canvas.height;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(U.C, w / 2, h / 2);
      gl.uniform1f(U.RAD, Math.min(w, h) * RF);
      gl.uniform1f(U.T, T);
      gl.uniform1f(U.LV, s.lv);
      gl.uniform1f(U.SURGE, s.surge);
      gl.uniform3fv(U.RIP, s.rip);
      gl.uniform4fv(U.MK, mk);
      gl.uniform1f(U.NOW, angleOf(toMinutes(nowHM())));
      gl.uniform1f(U.TX, stone ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
    s.time = loop.time;
    return () => { s.time = () => 0; loop.stop(); };
  }, []);

  if (noGL) return <div style={{ padding: "0 16px" }}><Dial todayTodos={todayTodos} isAssigned={isAssigned} onOpen={onOpen} /></div>;

  // Tapping the water makes a ripple where you touched.
  function onPointerDown(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const R = Math.min(r.width, r.height) * RF;
    const x = (e.clientX - (r.left + r.width / 2)) / R;
    const y = -(e.clientY - (r.top + r.height / 2)) / R;
    const [ex, ey] = waterCentreAt(sim.current.lv);
    if (Math.hypot(x - ex, y - ey) < waterRadiusAt(sim.current.lv)) ripple(x, y);
  }

  const textShadow = "0 1px 3px rgba(0,30,40,.45)";
  return (
    <>
      <Drift />
      <div onPointerDown={onPointerDown} style={{
        position: "relative", height: HEIGHT, flexShrink: 0, touchAction: "manipulation", margin: "4px 0 6px",
      }}>
        <canvas ref={canvasRef} aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />

        <PadButtons pads={pads} level={level} onOpen={onOpen} />

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

// Invisible tap targets over the lily pads, placed where each pad rests.
function PadButtons({ pads, level, onOpen }) {
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
      {box && pads.map(({ todo, a }) => {
        const R = Math.min(box.w, box.h) * RF;
        const [px, py] = padPos(a, level, 0);
        const x = box.w / 2 + px * R, y = box.h / 2 - py * R;
        return (
          <button key={todo.id} onClick={(e) => { e.stopPropagation(); onOpen(todo); }} title={todo.text} aria-label={`Open ${todo.text}`}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              position: "absolute", left: x - 20, top: y - 20, width: 40, height: 40, padding: 0,
              border: "none", borderRadius: "50%", background: "transparent", cursor: "pointer",
            }} />
        );
      })}
    </div>
  );
}
