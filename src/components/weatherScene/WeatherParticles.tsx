"use client";

import { useEffect, useRef } from "react";
import type { PrecipitationVisual } from "./weatherVisualProfile";
import { createParticle, particleCountFor, stepParticle, type Particle } from "./particleSystem";

const RAIN_COLOR = "rgba(196, 208, 226, 0.92)";
/** A visibly colder, brighter cyan-white for freezing precipitation — "icy glints," never the same tint as ordinary rain. */
const ICY_RAIN_COLOR = "rgba(214, 236, 255, 0.95)";
const SNOW_COLOR = "rgba(255, 255, 255, 0.95)";

/**
 * Each particle carries its OWN opacity/length/angle (from its depth
 * band — see `particleSystem.ts`), so a single draw pass already
 * produces layered depth: near streaks/flakes read crisp and bright,
 * far ones fade into a soft haze, without needing separate canvases per
 * layer.
 */
function draw(ctx: CanvasRenderingContext2D, particles: Particle[], profile: PrecipitationVisual) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.save();
  ctx.lineCap = "round";
  const color = profile.kind === "rain" ? (profile.icy ? ICY_RAIN_COLOR : RAIN_COLOR) : SNOW_COLOR;
  for (const p of particles) {
    ctx.globalAlpha = p.opacity;
    if (profile.kind === "rain") {
      ctx.strokeStyle = color;
      ctx.lineWidth = p.depth === "near" ? (profile.icy ? 1.6 : 1.5) : p.depth === "mid" ? 1.15 : 0.85;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + p.angle * p.length, p.y + p.length);
      ctx.stroke();
    } else {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.length / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * A capped-particle-count canvas rain/snow layer, entirely parameterized
 * by a resolved `PrecipitationVisual` (see `weatherVisualProfile.ts`) —
 * never re-derives density/size/speed itself. Renders nothing when
 * `precipitation` is `null` (clear/cloudy/fog, or a genuinely DRY
 * thunderstorm). Frame-rate independent (steps by elapsed ms, not by
 * frame count), device-pixel-ratio aware, pauses while the tab is
 * hidden, and tears down its own animation frame/resize observer on
 * unmount or profile change.
 */
export function WeatherParticles({ precipitation }: { precipitation: PrecipitationVisual | null }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!precipitation || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let animationFrame = 0;
    let lastFrameTime = performance.now();

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas!.clientWidth;
      height = canvas!.clientHeight;
      canvas!.width = Math.max(1, Math.round(width * dpr));
      canvas!.height = Math.max(1, Math.round(height * dpr));
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    const count = particleCountFor(precipitation.density);
    particles = Array.from({ length: count }, () => createParticle(precipitation, width, height));

    function frame(now: number) {
      const deltaMs = Math.min(50, now - lastFrameTime);
      lastFrameTime = now;
      particles = particles.map((p) => stepParticle(p, precipitation!, width, height, deltaMs));
      draw(ctx!, particles, precipitation!);
      animationFrame = requestAnimationFrame(frame);
    }

    function handleVisibility() {
      cancelAnimationFrame(animationFrame);
      if (document.visibilityState === "visible") {
        lastFrameTime = performance.now();
        animationFrame = requestAnimationFrame(frame);
      }
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    document.addEventListener("visibilitychange", handleVisibility);
    animationFrame = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [precipitation]);

  if (!precipitation) return null;

  return <canvas ref={canvasRef} aria-hidden className="weather-scene-particles" />;
}
