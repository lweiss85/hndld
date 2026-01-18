import { useOnlineStatus } from "@/hooks/use-online-status";
import { WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface OfflineIndicatorProps {
  className?: string;
}

export function OfflineIndicator({ className }: OfflineIndicatorProps) {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div 
      className={cn(
        "fixed top-0 left-0 right-0 z-50 bg-warning text-warning-foreground py-2 px-4 text-center text-sm font-medium flex items-center justify-center gap-2",
        className
      )}
      role="alert"
      aria-live="polite"
      data-testid="offline-indicator"
    >
      <WifiOff className="h-4 w-4" />
      <span>You're offline. Some features may be limited.</span>
    </div>
  );
}
