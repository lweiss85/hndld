import { Header } from "./header";
import { BottomNav } from "./bottom-nav";
import { AIChat } from "@/components/ai-chat";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <a href="#main-content" className="skip-to-content">
        Skip to content
      </a>
      <Header />
      <main 
        id="main-content"
        role="main"
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: "calc(var(--hndld-bottom-pad, 5.5rem) + env(safe-area-inset-bottom))" }}
      >
        {children}
      </main>
      <BottomNav />
      <AIChat />
    </div>
  );
}
