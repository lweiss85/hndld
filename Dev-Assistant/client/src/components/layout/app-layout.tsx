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

  return (
    <div
      className="min-h-screen flex flex-col bg-background"
      style={{
        backgroundColor: skyColor,
        transition: "background-color 2s ease",
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
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: "100%",
            maxWidth: "600px",
            height: "320px",
            background: `radial-gradient(ellipse at 50% 0%, ${glowColor} 0%, transparent 70%)`,
            pointerEvents: "none",
            zIndex: 0,
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
