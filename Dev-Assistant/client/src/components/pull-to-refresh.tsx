import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  threshold: number;
  isRefreshing: boolean;
  progress: number;
}

export function PullToRefreshIndicator({
  pullDistance,
  threshold,
  isRefreshing,
  progress,
}: PullToRefreshIndicatorProps) {
  if (pullDistance === 0 && !isRefreshing) return null;

  return (
    <div
      className="absolute left-0 right-0 flex items-center justify-center pointer-events-none z-50"
      style={{
        top: 0,
        height: isRefreshing ? 48 : pullDistance,
        transition: isRefreshing ? "height 0.2s ease-out" : undefined,
      }}
    >
      <div
        className={cn(
          "flex items-center justify-center w-10 h-10 rounded-full bg-card border shadow-sm",
          isRefreshing && "animate-pulse"
        )}
        style={{
          transform: isRefreshing
            ? "scale(1) rotate(0deg)"
            : `scale(${0.5 + progress * 0.5}) rotate(${progress * 180}deg)`,
          opacity: Math.min(progress * 1.5, 1),
          willChange: "transform, opacity",
          transition: isRefreshing ? "transform 0.2s ease-out, opacity 0.2s ease-out" : undefined,
        }}
      >
        <Loader2
          className={cn(
            "h-5 w-5 text-primary",
            isRefreshing && "animate-spin"
          )}
        />
      </div>
    </div>
  );
}
