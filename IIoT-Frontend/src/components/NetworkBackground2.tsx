"use client";
import React, { useEffect, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────
// NetworkBackground2
//
// Same IIoT-telemetry concept as NetworkBackground, but the cursor acts as
// an extra "node" — any real node within range draws a line to the mouse
// position, like the network is actively routing through wherever you're
// looking. Falls back to ambient-only behavior on touch devices (no
// persistent pointer) and respects prefers-reduced-motion.
// ─────────────────────────────────────────────────────────────────────────

const METRIC_SAMPLES = [
  () => `${(18 + Math.random() * 14).toFixed(1)}°C`,
  () => `${(30 + Math.random() * 65).toFixed(0)}%`,
  () => `${(0.8 + Math.random() * 2.4).toFixed(2)} bar`,
  () => (Math.random() > 0.15 ? "ONLINE" : "SYNC"),
  () => `${(2 + Math.random() * 8).toFixed(1)} A`,
];

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  pulsePhase: number;
}

interface Blip {
  nodeIndex: number;
  text: string;
  life: number;
  color: string;
}

export default function NetworkBackground2() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let nodes: Node[] = [];
    let blips: Blip[] = [];
    let animId = 0;

    // Mouse position; null = not currently hovering (or a touch device)
    const mouse = { x: null as number | null, y: null as number | null };

    const LINK_DIST = 150;
    const MOUSE_LINK_DIST = 190;
    const NODE_COLOR = "#2563eb";
    const LINE_COLOR = "37, 99, 235";
    const MOUSE_LINE_COLOR = "37, 99, 235";
    const GOOD_COLOR = "#059669";
    const WARN_COLOR = "#d97706";

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.min(70, Math.max(28, Math.floor((width * height) / 22000)));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        r: 1.4 + Math.random() * 1.6,
        pulsePhase: Math.random() * Math.PI * 2,
      }));
      blips = [];
    }

    function handlePointerMove(e: PointerEvent) {
      if (isTouchDevice) return;
      const rect = canvas!.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    }

    function handlePointerLeave() {
      mouse.x = null;
      mouse.y = null;
    }

    function maybeSpawnBlip() {
      if (prefersReducedMotion) return;
      if (Math.random() > 0.985 && nodes.length) {
        const nodeIndex = Math.floor(Math.random() * nodes.length);
        const already = blips.some((b) => b.nodeIndex === nodeIndex);
        if (already) return;
        const sample = METRIC_SAMPLES[Math.floor(Math.random() * METRIC_SAMPLES.length)]();
        const isWarn = sample === "SYNC";
        blips.push({
          nodeIndex,
          text: sample,
          life: 1,
          color: isWarn ? WARN_COLOR : GOOD_COLOR,
        });
      }
    }

    function step() {
      ctx!.clearRect(0, 0, width, height);

      // Drift nodes; gently nudge toward mouse when in range for a subtle
      // "magnetic" feel, not a hard snap
      for (const n of nodes) {
        if (!prefersReducedMotion) {
          if (mouse.x !== null && mouse.y !== null) {
            const dx = mouse.x - n.x;
            const dy = mouse.y - n.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < MOUSE_LINK_DIST && dist > 0.01) {
              const pull = 0.0025 * (1 - dist / MOUSE_LINK_DIST);
              n.vx += (dx / dist) * pull;
              n.vy += (dy / dist) * pull;
            }
          }
          // mild damping so nodes don't accelerate forever
          n.vx *= 0.985;
          n.vy *= 0.985;

          n.x += n.vx;
          n.y += n.vy;
          if (n.x < 0 || n.x > width) n.vx *= -1;
          if (n.y < 0 || n.y > height) n.vy *= -1;
          n.pulsePhase += 0.02;
        }
      }

      // Node-to-node links
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < LINK_DIST) {
            const alpha = (1 - dist / LINK_DIST) * 0.22;
            ctx!.strokeStyle = `rgba(${LINE_COLOR}, ${alpha})`;
            ctx!.lineWidth = 1;
            ctx!.beginPath();
            ctx!.moveTo(a.x, a.y);
            ctx!.lineTo(b.x, b.y);
            ctx!.stroke();
          }
        }
      }

      // Node-to-mouse links
      if (mouse.x !== null && mouse.y !== null) {
        for (const n of nodes) {
          const dx = n.x - mouse.x;
          const dy = n.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < MOUSE_LINK_DIST) {
            const alpha = (1 - dist / MOUSE_LINK_DIST) * 0.55;
            ctx!.strokeStyle = `rgba(${MOUSE_LINE_COLOR}, ${alpha})`;
            ctx!.lineWidth = 1.2;
            ctx!.beginPath();
            ctx!.moveTo(n.x, n.y);
            ctx!.lineTo(mouse.x, mouse.y);
            ctx!.stroke();
          }
        }

        // Cursor node itself
        ctx!.beginPath();
        ctx!.arc(mouse.x, mouse.y, 3, 0, Math.PI * 2);
        ctx!.fillStyle = NODE_COLOR;
        ctx!.globalAlpha = 0.8;
        ctx!.fill();
        ctx!.globalAlpha = 1;
      }

      // Nodes
      for (const n of nodes) {
        const pulse = prefersReducedMotion ? 0 : Math.sin(n.pulsePhase) * 0.4 + 0.6;
        ctx!.beginPath();
        ctx!.arc(n.x, n.y, n.r + pulse * 0.6, 0, Math.PI * 2);
        ctx!.fillStyle = NODE_COLOR;
        ctx!.globalAlpha = 0.55;
        ctx!.fill();
        ctx!.globalAlpha = 1;
      }

      // Telemetry blips
      maybeSpawnBlip();
      ctx!.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx!.textAlign = "center";
      blips = blips.filter((b) => b.life > 0);
      for (const b of blips) {
        const node = nodes[b.nodeIndex];
        if (!node) { b.life = 0; continue; }
        const riseOffset = (1 - b.life) * 26;
        const alpha = b.life < 0.25 ? b.life / 0.25 : b.life > 0.85 ? (1 - b.life) / 0.15 : 1;

        ctx!.beginPath();
        ctx!.arc(node.x, node.y, 3 + (1 - b.life) * 14, 0, Math.PI * 2);
        ctx!.strokeStyle = b.color;
        ctx!.globalAlpha = Math.max(0, alpha * 0.5);
        ctx!.lineWidth = 1.5;
        ctx!.stroke();

        ctx!.fillStyle = b.color;
        ctx!.globalAlpha = Math.max(0, alpha);
        ctx!.fillText(b.text, node.x, node.y - 14 - riseOffset);
        ctx!.globalAlpha = 1;

        b.life -= 0.006;
      }

      animId = requestAnimationFrame(step);
    }

    resize();
    window.addEventListener("resize", resize);
    if (!isTouchDevice) {
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerleave", handlePointerLeave);
    }
    step();

    return () => {
      window.removeEventListener("resize", resize);
      if (!isTouchDevice) {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerleave", handlePointerLeave);
      }
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
    />
  );
}