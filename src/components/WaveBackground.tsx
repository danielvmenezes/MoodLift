"use client";

import { useEffect, useRef } from "react";
import styles from "./WaveBackground.module.css";

const VERTEX_SHADER = `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// XMB-style waves: a deep-ocean gradient, broad translucent sheets (PSP)
// and thin glowing ribbons (PS3), all drifting slowly.
const FRAGMENT_SHADER = `
precision mediump float;

uniform float uTime;
uniform vec2 uResolution;

const vec3 TOP = vec3(0.024, 0.075, 0.082);    // #061315
const vec3 BOTTOM = vec3(0.051, 0.184, 0.192); // #0d2f31
const vec3 TEAL = vec3(0.10, 0.45, 0.47);
const vec3 CYAN = vec3(0.243, 0.902, 0.902);   // #3ee6e6

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float bloom(vec2 uv, vec2 center, float size) {
  vec2 d = uv - center;
  return exp(-dot(d, d) / size);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  // Keep wave wavelength similar on tall phones and wide desktops.
  float x = uv.x * mix(1.0, aspect, 0.55);
  float t = uTime;

  vec3 col = mix(BOTTOM, TOP, smoothstep(0.0, 1.0, uv.y));

  // Soft cyan light pools for the glass to pick up.
  vec2 auv = vec2(uv.x * aspect, uv.y);
  col += CYAN * 0.10 * bloom(auv, vec2(0.15 * aspect, 0.22 + 0.04 * sin(t * 0.21)), 0.08);
  col += CYAN * 0.07 * bloom(auv, vec2(0.88 * aspect, 0.72 + 0.05 * cos(t * 0.17)), 0.06);

  // Broad translucent sheets — brightest at their crest, fading downward.
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float y = 0.40 + fi * 0.07
      + 0.07 * sin(x * (1.3 + fi * 0.35) + t * (0.12 + fi * 0.03) + fi * 2.1)
      + 0.025 * sin(x * 3.2 - t * 0.09 + fi);
    float below = y - uv.y;
    float edge = smoothstep(-0.004, 0.004, below);
    float sheet = edge * exp(-max(below, 0.0) * 5.5);
    col += TEAL * sheet * 0.075;
    col += CYAN * exp(-abs(below) * 120.0) * 0.06;
  }

  // Thin glowing ribbons.
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float y = 0.44 + fi * 0.014
      + 0.085 * sin(x * 1.6 + t * (0.16 + fi * 0.025) + fi * 0.9)
      + 0.03 * sin(x * 3.7 - t * (0.11 + fi * 0.02) + fi * 1.7);
    float d = abs(uv.y - y);
    float core = exp(-d * 260.0);
    float glow = exp(-d * 32.0);
    col += CYAN * (core * 0.28 + glow * 0.035) * (0.6 + 0.4 * sin(fi * 1.3 + t * 0.3));
  }

  // Dither to avoid banding in the dark gradient.
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
`;

// Render below device resolution; the waves are soft and upscale cleanly.
const RESOLUTION_SCALE = 0.6;
const MAX_PIXEL_RATIO = 1.25;
// Frame drawn when motion is reduced.
const STATIC_TIME = 14;
// The waves move slowly; ~30fps looks identical and halves GPU work, including
// re-blurring every glass surface that sits on top of the canvas.
const FRAME_INTERVAL_MS = 1000 / 30;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export default function WaveBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      antialias: false,
      alpha: false,
      powerPreference: "low-power",
    });
    const vs = gl && compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = gl && compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl && vs && fs ? gl.createProgram() : null;

    if (!gl || !vs || !fs || !program) {
      canvas.dataset.wave = "fallback";
      return;
    }

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      canvas.dataset.wave = "fallback";
      return;
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(program, "uTime");
    const uResolution = gl.getUniformLocation(program, "uResolution");

    canvas.dataset.wave = "webgl";

    let frame = 0;
    let lastDraw = -Infinity;
    const start = performance.now();
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const draw = (time: number) => {
      gl.uniform1f(uTime, time);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO) * RESOLUTION_SCALE;
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
      gl.uniform2f(uResolution, width, height);
      if (motionQuery.matches) draw(STATIC_TIME);
    };

    const loop = (now: number) => {
      if (now - lastDraw >= FRAME_INTERVAL_MS) {
        lastDraw = now;
        draw(STATIC_TIME + (now - start) / 1000);
      }
      frame = requestAnimationFrame(loop);
    };

    const applyMotionPreference = () => {
      cancelAnimationFrame(frame);
      if (motionQuery.matches) {
        canvas.dataset.waveAnimating = "false";
        draw(STATIC_TIME);
      } else {
        canvas.dataset.waveAnimating = "true";
        frame = requestAnimationFrame(loop);
      }
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    applyMotionPreference();
    motionQuery.addEventListener("change", applyMotionPreference);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      motionQuery.removeEventListener("change", applyMotionPreference);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" data-testid="wave" />;
}
