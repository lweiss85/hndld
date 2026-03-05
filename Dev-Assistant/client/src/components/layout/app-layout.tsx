import { useState, useEffect } from "react";
import { Header } from "./header";
import { BottomNav } from "./bottom-nav";
import { AIChat } from "@/components/ai-chat";
import { FeedbackButton } from "@/components/feedback/feedback-dialog";
import { getTimeContext } from "@/lib/time-context";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { skyColor, glowColor } = getTimeContext();
  const [isFirstLoad, setIsFirstLoad] = useState(true);

  useEffect(() => {
    if (isFirstLoad) {
      const timer = setTimeout(() => setIsFirstLoad(false), 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <div
      className="min-h-screen flex flex-col bg-background grain-overlay"
      style={{
        backgroundColor: isFirstLoad ? "#FAFAFA" : skyColor,
        transition: isFirstLoad
          ? "background-color 3s cubic-bezier(0.22, 1, 0.36, 1)"
          : "background-color 2s ease",
      }}
    >
      <a href="#main-content" className="skip-to-content">
        Skip to content
      </a>
      <Header />
      <main
        id="main-content"
        role="main"
        className="flex-1 overflow-y-auto relative"
        style={{ paddingBottom: "calc(var(--hndld-bottom-pad, 5.5rem) + env(safe-area-inset-bottom))" }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: "-40px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "120%",
            maxWidth: "800px",
            height: "400px",
            background: `radial-gradient(ellipse at 50% 0%, ${glowColor} 0%, transparent 65%)`,
            pointerEvents: "none",
            zIndex: 0,
            transition: "background 3s ease",
          }}
        />
        <div style={{ position: "relative", zIndex: 1 }}>
          {children}
        </div>
      </main>
      <BottomNav />
      <FeedbackButton />
      <AIChat />
    </div>
  );
}
