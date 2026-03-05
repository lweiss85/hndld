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
    const sin = Math.sin((2 * Math.PI * elapsed) / 8000);
    const weight = 300 + ((sin + 1) / 2) * 300;
    if (h1Ref.current) {
      h1Ref.current.style.fontWeight = String(Math.round(weight));
    }
    rafRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      if (h1Ref.current) h1Ref.current.style.fontWeight = "400";
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
        style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontWeight: 450,
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
