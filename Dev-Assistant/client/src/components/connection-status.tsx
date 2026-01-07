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
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 opacity-0 hover:opacity-100"
          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 animate-pulse"
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
