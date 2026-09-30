import { useEffect, useRef, useState } from "react";
import { FONT_DISPLAY, prefersDarkDial } from "../../dial/tokens";
import { reminderHM, nowHM } from "../../dial/dates";
import Dial from "../../dial/Dial";
import { PIT } from "./shaders";
import { createScene, runScene, loadTexture } from "../water/gl";
import Hearth from "./Hearth";
import embersUrl from "./embers.jpg";

// The Fire theme's version of the dial: a fire pit seen from above, burning
// on the hearth. Same job as Dial.jsx: the middle says how many of today's
// todos are open, the ring of embers round the pit catches light clockwise as
// they get done, each timed reminder is a glowing coal at its hour (tap it to
// open the todo), and a chip on the ring marks the current time. The flames
// also grow with progress, a ticked coal flares and goes up in a burst of
// sparks, and finishing the day makes the fire roar. Falls back to the plain
// dial if the phone can't draw it.

const HEIGHT = 320;
const RF = 0.27; // fire-bed radius as a share of the box's shorter side (ring at 1.46×)
const RR = 1.46;
const MAX_COALS = 6;

const toMinutes = (hm) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
const angleOf = (min) => ((min % 720) / 720) * Math.PI * 2; // 0 at 12, clockwise

export default function FireDial({ todayTodos, isAssigned, onOpen }) {
  const canvasRef = useRef(null);
  const boxRef = useRef(null);
  const [noGL, setNoGL] = useState(false);
  // Where the coal bed starts (just below the dial, where the list begins)
  // and where the pit sits, for the backdrop's glow, smoke and sparks.
  const [edgeY, setEdgeY] = useState(null);
  const [pit, setPit] = useState(null);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setEdgeY(r.bottom - 2);
      setPit({ x: r.left + r.width / 2, y: r.top + r.height / 2, r: Math.min(r.width, r.height) * RF });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [noGL]);
  const total = todayTodos.length;
  const done = todayTodos.filter((t) => t.done).length;
  const open = total - done;
  const level = total ? done / total : 1;

  const coals = todayTodos
    .filter((t) => !t.done && reminderHM(t))
    .slice(0, MAX_COALS)
    .map((t) => ({ todo: t, a: angleOf(toMinutes(reminderHM(t))), assigned: isAssigned(t) }));

  // Everything the animation reads lives here, so React re-renders never
  // restart it.
  const sim = useRef({ coals: new Map(), lv: level, target: level, surge: 0, lastOpen: open,
    burst: new Float32Array(12).fill(-100), burstK: 0, time: () => 0 });
  const burst = (x, y) => {
    const s = sim.current;
    s.burst.set([x, y, s.time()], s.burstK * 3);
    s.burstK = (s.burstK + 1) % 4;
  };

  // Follow the todos: new coals fade in; ticked ones flare and go up in sparks.
  useEffect(() => {
    const s = sim.current;
    const ids = new Set(coals.map((m) => m.todo.id));
    coals.forEach((m) => {
      const cur = s.coals.get(m.todo.id);
      s.coals.set(m.todo.id, { a: m.a, assigned: m.assigned, alive: cur && !cur.leaving ? cur.alive : 0, leaving: 0 });
    });
    s.coals.forEach((m, id) => {
      if (!ids.has(id) && !m.leaving) { m.leaving = 0.001; burst(RR * Math.sin(m.a), RR * Math.cos(m.a)); }
    });
    s.target = level;
    if (s.lastOpen > 0 && open === 0 && total > 0) { s.surge = 1; burst(0, 0); setTimeout(() => burst(0.2, -0.1), 300); }
    s.lastOpen = open;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const scene = createScene(canvas, PIT,
      ["C", "RAD", "T", "LV", "SURGE", "NOW", "TX", "MK", "BURST", "EMB", "DY"], { alpha: true });
    if (!scene) { setNoGL(true); return; }
    const { gl, U } = scene;
    gl.uniform1i(U.EMB, 0);
    gl.uniform1f(U.DY, prefersDarkDial ? 0 : 1); // light mode is the same fire by day
    let mapReady = false;
    loadTexture(gl, 0, embersUrl, { repeat: true }, () => { mapReady = true; });

    const s = sim.current;
    const mk = new Float32Array(MAX_COALS * 4);
    const loop = runScene(canvas, gl, (dt) => {
      s.lv += (s.target - s.lv) * Math.min(1, dt * 1.4);
      s.surge = Math.max(0, s.surge - dt * 0.35);
      mk.fill(0);
      let i = 0;
      s.coals.forEach((m, id) => {
        if (m.leaving) {
          m.leaving = Math.min(1, m.leaving + dt * 1.3);
          if (m.leaving >= 1) { s.coals.delete(id); return; }
        } else {
          m.alive += (1 - m.alive) * Math.min(1, dt * 2.5);
        }
        if (i < MAX_COALS) { mk.set([m.a, m.alive, m.assigned ? 1 : 0, m.leaving], i * 4); i++; }
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
      gl.uniform3fv(U.BURST, s.burst);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
    s.time = loop.time;
    return () => { s.time = () => 0; loop.stop(); };
  }, []);

  if (noGL) return <div style={{ padding: "0 16px" }}><Dial todayTodos={todayTodos} isAssigned={isAssigned} onOpen={onOpen} /></div>;

  const textShadow = "0 1px 3px rgba(20,6,0,.95), 0 0 18px rgba(40,10,0,.9)";
  return (
    <>
      <Hearth edgeY={edgeY} pit={pit} />
      <div ref={boxRef} style={{ position: "relative", height: HEIGHT, flexShrink: 0, margin: "4px 0 6px" }}>
        <canvas ref={canvasRef} aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />

        <CoalButtons coals={coals} onOpen={onOpen} />

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

// Invisible tap targets over the coals, placed on the ring at each hour.
function CoalButtons({ coals, onOpen }) {
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
      {box && coals.map(({ todo, a }) => {
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
