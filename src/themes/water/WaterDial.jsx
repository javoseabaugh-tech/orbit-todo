import { useEffect, useRef, useState } from "react";
import { FONT_DISPLAY, prefersDarkDial } from "../../dial/tokens";
import { reminderHM, nowHM } from "../../dial/dates";
import Dial from "../../dial/Dial";
import { POOL } from "./shaders";
import { createScene, loadTexture, runScene, reducedMotion } from "./gl";
import rockUrl from "./rock.jpg";
import pebblesUrl from "./pebbles.jpg";
import rimUrl from "./rim.jpg";

// The Water theme's version of the dial: a rock pool seen from above.
// Same job as Dial.jsx: the centre says how many of today's todos are open,
// the channel in the rim fills around the clock as they get done, each timed
// reminder is a lily pad at its hour (tap it to open the todo), and a bright
// chip on the rim marks the current time. The pool also rises with progress,
// a ticked reminder's pad sinks with a ripple, and finishing the day makes
// the spring surge. Falls back to the plain dial if the phone can't draw it.

const HEIGHT = 300;
const RF = 0.285; // pool radius as a share of the box's shorter side (rim reaches 1.48×)
const MAX_PADS = 6;
const poolRadiusAt = (level) => 0.52 + 0.43 * level;

const toMinutes = (hm) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
const angleOf = (min) => ((min % 720) / 720) * Math.PI * 2; // 0 at 12, clockwise

// Where a pad floats, in pool units (y up). Mirrors padPos() in the shader.
function padPos(a, level, T) {
  const r = poolRadiusAt(level) * 0.72;
  return [r * Math.sin(a) + 0.02 * Math.sin(T * 0.5 + a * 3), r * Math.cos(a) + 0.02 * Math.cos(T * 0.4 + a * 2)];
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
      ripple(0, poolRadiusAt(1) - 0.035);
      setTimeout(() => ripple(0.25, 0.1), 250);
      setTimeout(() => ripple(-0.3, -0.2), 500);
    }
    s.lastOpen = open;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const scene = createScene(canvas, POOL,
      ["C", "RES", "RAD", "T", "LV", "NT", "SURGE", "RIP", "MK", "NOW", "ROCK", "PEB", "RIM", "TX"]);
    if (!scene) { setNoGL(true); return; }
    const { gl, U } = scene;
    gl.uniform1i(U.ROCK, 0); gl.uniform1i(U.PEB, 1); gl.uniform1i(U.RIM, 2);
    let loaded = 0;
    const onLoad = () => { loaded++; };
    loadTexture(gl, 0, rockUrl, { repeat: true }, onLoad);
    loadTexture(gl, 1, pebblesUrl, { repeat: true }, onLoad);
    loadTexture(gl, 2, rimUrl, {}, onLoad);

    const s = sim.current;
    const mk = new Float32Array(MAX_PADS * 4);
    const nt = prefersDarkDial ? 1 : 0;
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
      gl.uniform2f(U.C, w / 2, h / 2);
      gl.uniform2f(U.RES, w, h);
      gl.uniform1f(U.RAD, Math.min(w, h) * RF);
      gl.uniform1f(U.T, T);
      gl.uniform1f(U.LV, s.lv);
      gl.uniform1f(U.NT, nt);
      gl.uniform1f(U.SURGE, s.surge);
      gl.uniform3fv(U.RIP, s.rip);
      gl.uniform4fv(U.MK, mk);
      gl.uniform1f(U.NOW, angleOf(toMinutes(nowHM())));
      gl.uniform1f(U.TX, loaded >= 3 ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
    s.time = loop.time;
    return () => { s.time = () => 0; loop.stop(); };
  }, []);

  if (noGL) return <Dial todayTodos={todayTodos} isAssigned={isAssigned} onOpen={onOpen} />;

  // Tapping the water makes a ripple where you touched.
  function onPointerDown(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const R = Math.min(r.width, r.height) * RF;
    const x = (e.clientX - (r.left + r.width / 2)) / R;
    const y = -(e.clientY - (r.top + r.height / 2)) / R;
    if (Math.hypot(x, y) < poolRadiusAt(sim.current.lv)) ripple(x, y);
  }

  const textShadow = "0 1px 2px rgba(0,30,35,.6), 0 0 18px rgba(0,40,48,.5)";
  return (
    <div onPointerDown={onPointerDown} style={{
      position: "relative", height: HEIGHT, margin: "0 -16px 10px", flexShrink: 0, touchAction: "manipulation",
      WebkitMaskImage: "linear-gradient(transparent, #000 10%, #000 90%, transparent)",
      maskImage: "linear-gradient(transparent, #000 10%, #000 90%, transparent)",
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
        const r = poolRadiusAt(level) * 0.72 * R;
        const x = box.w / 2 + r * Math.sin(a);
        const y = box.h / 2 - r * Math.cos(a);
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
