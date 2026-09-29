import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FONT_DISPLAY, prefersDarkDial } from "../../dial/tokens";
import { reminderHM, nowHM } from "../../dial/dates";
import Dial from "../../dial/Dial";
import { WELL_SHADER } from "./shaders";
import { createScene, loadTexture, uploadTexture, runScene, reducedMotion } from "./gl";
import { photoUrl, wellLayout, RIM_OFFSET, RIM_OUTER } from "./well";

// The Water theme's version of the dial: a stone well on the forest floor,
// seen from above. The photo fills the screen and the water is drawn live
// inside its well. Same job as Dial.jsx: the middle says how many of today's
// todos are open, the channel in the rim fills around the clock as they get
// done, each timed reminder is a lily pad at its hour (tap it to open the
// todo), and a pale chip in the channel marks the current time. The water
// also rises with progress, a ticked reminder's pad sinks with a ripple, and
// finishing the day makes the well surge. Falls back to the plain dial if the
// phone can't draw it.
//
// The well stays put: this renders a spacer the height of the photo's well,
// and only the list below it scrolls, over the quiet moss.

const MAX_PADS = 6;
const waterRadiusAt = (level) => 0.6 + 0.395 * level;
const waterCentreAt = (level) => [0, -(1 - level) * 0.05];

const toMinutes = (hm) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
const angleOf = (min) => ((min % 720) / 720) * Math.PI * 2; // 0 at 12, clockwise

// Where a pad floats, in well radii (y up). Mirrors padPos() in the shader.
function padPos(a, level, T) {
  const r = waterRadiusAt(level) * 0.7, [ex, ey] = waterCentreAt(level);
  return [ex + r * Math.sin(a) + 0.02 * Math.sin(T * 0.5 + a * 3), ey + r * Math.cos(a) + 0.02 * Math.cos(T * 0.4 + a * 2)];
}

function useViewport() {
  const [v, setV] = useState(() => ({ W: window.innerWidth, H: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setV({ W: window.innerWidth, H: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return v;
}

export default function WaterDial({ todayTodos, isAssigned, onOpen }) {
  const canvasRef = useRef(null);
  const spacerRef = useRef(null);
  const [noGL, setNoGL] = useState(false);
  const [ready, setReady] = useState(false);
  const { W, H } = useViewport();
  const L = wellLayout(W, H);
  const [top, setTop] = useState(null);
  useLayoutEffect(() => {
    const t = spacerRef.current?.getBoundingClientRect().top;
    if (t != null && t !== top) setTop(t);
  });

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
    const scene = createScene(canvas, WELL_SHADER,
      ["RES", "IR", "WC", "RIMO", "RO", "T", "LV", "NT", "SURGE", "NOW", "RIP", "MK", "IMG", "BLR"]);
    if (!scene) { setNoGL(true); return; }
    const { gl, U } = scene;
    gl.uniform1i(U.IMG, 0); gl.uniform1i(U.BLR, 1);
    gl.uniform2f(U.RIMO, RIM_OFFSET[0], RIM_OFFSET[1]);
    gl.uniform1f(U.RO, RIM_OUTER);
    gl.uniform1f(U.NT, prefersDarkDial ? 1 : 0);
    let loaded = false;
    loadTexture(gl, 0, photoUrl, { mipmap: false }, (img) => {
      // A small power-of-two copy with mipmaps: the pebbles blur with depth.
      const c = document.createElement("canvas");
      c.width = 512; c.height = 1024;
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      uploadTexture(gl, 1, c);
      loaded = true;
      setReady(true);
    });

    const s = sim.current;
    const mk = new Float32Array(MAX_PADS * 4);
    const loop = runScene(canvas, gl, (dt, T) => {
      if (!loaded) return;
      s.lv += (s.target - s.lv) * Math.min(1, dt * 1.6);
      s.surge = Math.max(0, s.surge - dt * 0.3);
      mk.fill(0);
      let i = 0;
      s.pads.forEach((pad, id) => {
        pad.alive += (pad.target - pad.alive) * Math.min(1, dt * 2.8);
        if (pad.target === 0 && pad.alive < 0.01) { s.pads.delete(id); return; }
        if (i < MAX_PADS) { mk.set([pad.a, pad.alive, pad.assigned ? 1 : 0, 0], i * 4); i++; }
      });
      // Device pixels per CSS pixel, so the photo lines up with the page.
      const k = canvas.width / Math.max(1, canvas.clientWidth);
      const w = wellLayout(canvas.clientWidth, canvas.clientHeight);
      gl.uniform2f(U.RES, canvas.width, canvas.height);
      gl.uniform4f(U.IR, w.ox * k, 0, w.dw * k, w.dh * k);
      gl.uniform3f(U.WC, w.cx * k, w.cy * k, w.r * k);
      gl.uniform1f(U.T, T);
      gl.uniform1f(U.LV, s.lv);
      gl.uniform1f(U.SURGE, s.surge);
      gl.uniform3fv(U.RIP, s.rip);
      gl.uniform4fv(U.MK, mk);
      gl.uniform1f(U.NOW, angleOf(toMinutes(nowHM())));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
    s.time = loop.time;
    return () => { s.time = () => 0; loop.stop(); };
  }, []);

  if (noGL) return <div style={{ padding: "0 16px" }}><Dial todayTodos={todayTodos} isAssigned={isAssigned} onOpen={onOpen} /></div>;

  // Tapping the water makes a ripple where you touched.
  function onPointerDown(e) {
    const x = (e.clientX - L.cx) / L.r;
    const y = -(e.clientY - L.cy) / L.r;
    const [ex, ey] = waterCentreAt(sim.current.lv);
    if (Math.hypot(x - ex, y - ey) < waterRadiusAt(sim.current.lv)) ripple(x, y);
  }

  const textShadow = "0 1px 2px rgba(0,20,15,.7), 0 0 16px rgba(0,25,18,.55)";
  const box = L.r * 2;
  return (
    <>
      {/* The photo, full screen and fixed, behind the whole home screen. The
          CSS copy shows at once; the canvas fades in over it when ready. */}
      <div aria-hidden="true" style={{
        position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none",
        background: `#0d140c url(${photoUrl}) center top / auto 100% no-repeat`,
      }}>
        <canvas ref={canvasRef} style={{
          position: "absolute", inset: 0, width: "100%", height: "100%", display: "block",
          opacity: ready ? 1 : 0, transition: "opacity .5s ease",
        }} />
      </div>

      {/* Keeps the list below the well's rim. */}
      <div ref={spacerRef} style={{ flexShrink: 0, height: top == null ? 0 : Math.max(0, L.bottom - top) }} />

      <div onPointerDown={onPointerDown} style={{
        position: "fixed", left: L.cx - L.r, top: L.cy - L.r, width: box, height: box,
        borderRadius: "50%", touchAction: "manipulation", zIndex: 1,
      }}>
        <PadButtons pads={pads} level={level} r={L.r} onOpen={onOpen} />
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
function PadButtons({ pads, level, r, onOpen }) {
  return pads.map(({ todo, a }) => {
    const [px, py] = padPos(a, level, 0);
    const x = r + px * r, y = r - py * r;
    return (
      <button key={todo.id} onClick={(e) => { e.stopPropagation(); onOpen(todo); }} title={todo.text} aria-label={`Open ${todo.text}`}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          position: "absolute", left: x - 20, top: y - 20, width: 40, height: 40, padding: 0,
          border: "none", borderRadius: "50%", background: "transparent", cursor: "pointer",
        }} />
    );
  });
}
