import { useWS } from "@/lib/websocket-context";
import { Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function ConnectionStatus() {
  const { isConnected } = useWS();

  return (
    <div
      className={cn(
        "fixed bottom-20 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300",
        isConnected
          ? "bg-success-muted text-success-muted-foreground opacity-0 hover:opacity-100"
          : "bg-warning-muted text-warning-muted-foreground animate-pulse"
      )}
      data-testid="connection-status"
    >
      {isConnected ? (
        <>
          <Wifi className="h-3 w-3" />
          Connected
        </>
      ) : (
        <>
          <WifiOff className="h-3 w-3" />
          Reconnecting...
        </>
      )}
    </div>
  );
}
