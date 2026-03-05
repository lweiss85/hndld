import { motion, useReducedMotion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { formatDistanceToNow, format } from "date-fns";
import { useEffect, useRef, useCallback } from "react";

interface CalmStateProps {
  lastUpdated?: Date;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

export function CalmState({ lastUpdated }: CalmStateProps) {
  const { user } = useAuth();
  const prefersReduced = useReducedMotion();
  const firstName = user?.firstName || "";
  const h1Ref = useRef<HTMLHeadingElement>(null);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const now = new Date();
  const dateLabel = format(now, "EEEE, MMMM d");

  const animate = useCallback((timestamp: number) => {
    if (!startRef.current) startRef.current = timestamp;
    const elapsed = timestamp - startRef.current;
    const sin = Math.sin((2 * Math.PI * elapsed) / 8000);
    const weight = 300 + ((sin + 1) / 2) * 200;
    if (h1Ref.current) {
      h1Ref.current.style.fontWeight = String(Math.round(weight));
    }
    rafRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    if (prefersReduced) {
      if (h1Ref.current) h1Ref.current.style.fontWeight = "350";
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
  }, [animate, prefersReduced]);

  return (
    <motion.div
      className="flex flex-col items-center justify-center text-center px-8"
      style={{ minHeight: "100dvh" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
      data-testid="calm-state"
    >
      <motion.h1
        ref={h1Ref}
        initial={prefersReduced ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontWeight: 350,
          fontSize: "2.75rem",
          lineHeight: 1.15,
          color: "hsl(var(--foreground))",
          letterSpacing: "-0.01em",
        }}
        data-testid="text-greeting"
      >
        {getGreeting()}, {firstName}.
      </motion.h1>

      <motion.div
        initial={prefersReduced ? false : { opacity: 0, scaleX: 0 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ duration: 0.6, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
        style={{
          width: 60,
          height: 1,
          backgroundColor: "rgba(201,169,110,0.4)",
          marginTop: "1.5rem",
          marginBottom: "1.5rem",
        }}
      />

      <motion.p
        initial={prefersReduced ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
        style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontStyle: "italic",
          fontSize: "1.25rem",
          color: "hsl(var(--muted-foreground))",
          fontWeight: 300,
        }}
      >
        Your home is in order.
      </motion.p>

      <motion.p
        initial={prefersReduced ? false : { opacity: 0 }}
        animate={{ opacity: 0.4 }}
        transition={{ duration: 0.5, delay: 1.3 }}
        style={{
          fontFamily: "'DM Sans', system-ui, sans-serif",
          fontSize: "0.75rem",
          color: "hsl(var(--muted-foreground))",
          marginTop: "1.5rem",
          letterSpacing: "0.08em",
        }}
      >
        {dateLabel}
      </motion.p>

      {lastUpdated && (
        <motion.p
          initial={prefersReduced ? false : { opacity: 0 }}
          animate={{ opacity: 0.3 }}
          transition={{ duration: 0.5, delay: 1.8 }}
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: "0.6875rem",
            color: "hsl(var(--muted-foreground))",
            marginTop: "2rem",
            letterSpacing: "0.04em",
          }}
        >
          Last checked {formatDistanceToNow(lastUpdated, { addSuffix: true })}
        </motion.p>
      )}
    </motion.div>
  );
}
