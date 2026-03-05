import { useEffect, useRef, useCallback } from "react";

interface BreathingGreetingProps {
  name: string;
  greeting: string;
}

export function BreathingGreeting({ name, greeting }: BreathingGreetingProps) {
  const h1Ref = useRef<HTMLHeadingElement>(null);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);

  const animate = useCallback((timestamp: number) => {
    if (!startRef.current) startRef.current = timestamp;
    const elapsed = timestamp - startRef.current;
    const t = (Math.sin((2 * Math.PI * elapsed) / 6000) + 1) / 2;
    const opacity = 0.72 + t * 0.28;
    if (h1Ref.current) {
      h1Ref.current.style.opacity = String(opacity);
    }
    rafRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      if (h1Ref.current) h1Ref.current.style.opacity = "1";
      return;
    }

    rafRef.current = requestAnimationFrame(animate);

    const handleVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(rafRef.current);
      } else {
        startRef.current = 0;
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [animate]);

  return (
    <div>
      <h1
        ref={h1Ref}
        className="font-display text-3xl font-light tracking-tight"
        style={{
          fontSize: "2.75rem",
          lineHeight: 1.2,
          color: "hsl(var(--foreground))",
        }}
        data-testid="text-greeting"
      >
        {greeting}, {name}.
      </h1>
      <p
        className="font-display italic"
        style={{
          fontSize: "15px",
          color: "hsl(var(--muted-foreground))",
          marginTop: "4px",
        }}
      >
        Everything's hndld.
      </p>
    </div>
  );
}
