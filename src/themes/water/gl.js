// Small WebGL 1 helpers shared by the Water dial and the Water Nightly scene.

const VS = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

export const reducedMotion =
  typeof window !== "undefined" && window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// A context plus one full-screen program. Returns null when the phone can't
// draw it (WebGL off, or the shader won't compile), so callers can fall back.
// With `alpha`, the shader writes premultiplied colour and the page shows
// through wherever it leaves alpha at 0.
export function createScene(canvas, fragmentSource, uniformNames, { alpha = false, extensions = [] } = {}) {
  const gl = canvas.getContext("webgl", { antialias: false, alpha, premultipliedAlpha: true, powerPreference: "high-performance" });
  if (!gl) return null;
  extensions.forEach((e) => gl.getExtension(e)); // before compiling, so the shader can use them
  try {
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragmentSource));
    gl.bindAttribLocation(prog, 0, "p");
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const U = {};
    uniformNames.forEach((k) => { U[k] = gl.getUniformLocation(prog, k); });
    return { gl, U };
  } catch (e) {
    console.error("Water theme: can't draw on this device", e);
    return null;
  }
}

// Puts an image or canvas into a texture unit. Mipmaps (for reading a blurrier
// copy) need power-of-two sizes in WebGL 1; anything else is left unmipped.
export function uploadTexture(gl, unit, source, { repeat = false, mipmap = true } = {}) {
  const t = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
  const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  if (mipmap) {
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  } else {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
}

// Loads an image into a texture unit.
export function loadTexture(gl, unit, url, opts, onLoad) {
  const img = new Image();
  img.onload = () => {
    if (gl.isContextLost()) return;
    uploadTexture(gl, unit, img, opts);
    onLoad?.(img);
  };
  img.onerror = () => console.error("Water theme: couldn't load " + url);
  img.src = url;
}

// Runs draw(dt, T) every frame while the canvas is on screen and the app is
// in front. Keeps the canvas sized to its box, and drops the resolution if
// the phone can't keep up. Returns a stop function that also frees the GPU
// context (Todo sections remount the dial, and browsers cap live contexts).
// `scale` draws below screen resolution (fine for soft backgrounds) and
// `interval` (seconds) redraws only that often, for very slow scenes.
export function runScene(canvas, gl, draw, { scale = 1, interval = 0 } = {}) {
  let since = Infinity;
  let quality = 1, slow = 0, frames = 0, raf = 0, last = performance.now(), T = 0;
  let visible = true, onScreen = true, stopped = false;

  const size = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * quality * scale;
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  };

  const frame = (now) => {
    raf = 0;
    if (stopped || !visible || !onScreen) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    T = (T + dt * (reducedMotion ? 0.3 : 1)) % 1000;
    since += dt;
    if (since >= interval) {
      since = 0;
      size();
      draw(dt, T);
    }
    frames++;
    if (frames > 30) {
      slow = slow * 0.9 + (dt > 0.026 ? 0.1 : 0);
      if (slow > 0.6 && quality > 0.5) { quality *= 0.85; slow = 0; }
    }
    raf = requestAnimationFrame(frame);
  };
  const kick = () => {
    if (!raf && !stopped && visible && onScreen) { last = performance.now(); raf = requestAnimationFrame(frame); }
  };

  const onVis = () => { visible = !document.hidden; kick(); };
  document.addEventListener("visibilitychange", onVis);
  const io = "IntersectionObserver" in window
    ? new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; kick(); })
    : null;
  io?.observe(canvas);
  kick();

  return {
    time: () => T,
    stop() {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      io?.disconnect();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
