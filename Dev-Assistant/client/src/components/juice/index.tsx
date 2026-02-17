import { cn } from "@/lib/utils";
import { useEffect, useState, useRef, useCallback, Children, isValidElement } from "react";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

interface SuccessCheckProps {
  size?: number;
  className?: string;
}

export function SuccessCheck({ size = 24, className }: SuccessCheckProps) {
  return (
    <div className={cn("animate-scale-in", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        className="text-success"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="animate-scale-in"
        />
        <path
          d="M8 12l3 3 5-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="20"
          className="animate-checkmark-draw"
          style={{ strokeDashoffset: 20 }}
        />
      </svg>
    </div>
  );
}

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  className?: string;
}

export function AnimatedNumber({ value, duration = 500, className }: AnimatedNumberProps) {
  const [count, setCount] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const startTimeRef = useRef<number | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) {
      setCount(value);
      return;
    }

    startRef.current = count;
    startTimeRef.current = null;
    const range = value - startRef.current;

    if (range === 0) return;

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp;
      }
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(startRef.current + range * eased));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [value, duration, prefersReducedMotion]);

  return <span className={className}>{count}</span>;
}

interface StaggeredListProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}

export function StaggeredList({ children, delay = 50, className }: StaggeredListProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <div className={className}>
      {Children.map(children, (child, i) => {
        if (!isValidElement(child)) return child;
        return (
          <div
            key={child.key ?? i}
            className={prefersReducedMotion ? undefined : "animate-fade-in-up"}
            style={prefersReducedMotion ? undefined : {
              animationDelay: `${i * delay}ms`,
              animationFillMode: "both",
            }}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

export function PageTransition({ children, className }: PageTransitionProps) {
  return (
    <div className={cn("animate-fade-in", className)}>
      {children}
    </div>
  );
}

export function triggerHaptic(intensity: "light" | "medium" | "heavy" = "light") {
  if ("vibrate" in navigator) {
    const durations = { light: 10, medium: 25, heavy: 50 };
    navigator.vibrate(durations[intensity]);
  }
}

export { usePrefersReducedMotion };
