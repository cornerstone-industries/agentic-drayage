"use client";

import { useEffect, useRef } from "react";

const INK = { assistant: "rgb(36 83 214)", user: "rgb(11 135 91)", idle: "rgba(18,20,23,0.28)" };

/**
 * A strip-chart pen on graph paper. The paper only moves while the line is open, and the pen only
 * swings while someone is actually talking (speech-update over Realtime): blue for PortCall, green for
 * the dispatcher, a flat line in silence.
 */
export function VoiceTrace({ speaking, live }: { speaking: "assistant" | "user" | null; live: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef<{ speaking: typeof speaking; live: boolean }>({ speaking, live });
  useEffect(() => {
    state.current = { speaking, live };
  }, [speaking, live]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const fit = () => {
      const r = el.getBoundingClientRect();
      el.width = Math.max(1, Math.round(r.width * dpr));
      el.height = Math.max(1, Math.round(r.height * dpr));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);

    const samples: { a: number; who: "assistant" | "user" | null }[] = [];
    const step = 2.2 * dpr;
    let amp = 0;
    let t = 0;
    let last = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      const { speaking: who, live: open } = state.current;
      amp += ((who ? 1 : 0) - amp) * Math.min(1, dt / 140);
      if (open || who) {
        t += dt;
        const n = Math.max(1, Math.round(dt / 16));
        for (let i = 0; i < n; i++) {
          const syllable = 0.35 + 0.65 * Math.abs(Math.sin(t / 110 + i * 0.7)) * (0.6 + 0.4 * Math.sin(t / 43));
          samples.push({ a: amp * syllable * (Math.random() * 2 - 1), who: amp > 0.08 ? who : null });
        }
        const max = Math.ceil(el.width / step) + 2;
        if (samples.length > max) samples.splice(0, samples.length - max);
      }
      ctx.clearRect(0, 0, el.width, el.height);
      const mid = el.height / 2;
      ctx.lineWidth = 1.5 * dpr;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      const x0 = el.width - samples.length * step - 10 * dpr;
      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1];
        const b = samples[i];
        ctx.strokeStyle = b.who ? INK[b.who] : INK.idle;
        ctx.beginPath();
        ctx.moveTo(x0 + (i - 1) * step, mid + a.a * mid * 0.86);
        ctx.lineTo(x0 + i * step, mid + b.a * mid * 0.86);
        ctx.stroke();
      }
      // pen tip
      const tipY = mid + (samples.at(-1)?.a ?? 0) * mid * 0.86;
      const tipX = el.width - 10 * dpr;
      ctx.fillStyle = who ? INK[who] : "rgba(20,23,27,0.55)";
      ctx.beginPath();
      ctx.arc(tipX, tipY, 2.6 * dpr, 0, Math.PI * 2);
      ctx.fill();
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvas} className="block h-12 w-full" aria-hidden />;
}
