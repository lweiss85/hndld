import { useEffect, useRef } from "react";

interface AmbientParticlesProps {
  active: boolean;
  color: string;
}

interface Particle {
  x: number;
  y: number;
  size: number;
  speed: number;
  life: number;
  lifeSpeed: number;
}

function createParticle(width: number, height: number): Particle {
  return {
    x: Math.random() * width,
    y: height + Math.random() * 40,
    size: 0.5 + Math.random() * 2,
    speed: 0.15 + Math.random() * 0.35,
    life: Math.random(),
    lifeSpeed: 0.002 + Math.random() * 0.003,
  };
}

export function AmbientParticles({ active, color }: AmbientParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
    };
    resize();

    if (particlesRef.current.length === 0) {
      particlesRef.current = Array.from({ length: 18 }, () =>
        createParticle(canvas.width, canvas.height)
      );
    }

    const draw = () => {
      if (!active) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const particles = particlesRef.current;

      for (const p of particles) {
        p.y -= p.speed;
        p.life += p.lifeSpeed;

        if (p.y < -10 || p.life >= 1) {
          Object.assign(p, createParticle(canvas.width, canvas.height));
        }

        const alpha = Math.sin(p.life * Math.PI) * 0.6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [active, color]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
        opacity: active ? 1 : 0,
        transition: "opacity 1s ease",
      }}
    />
  );
}
