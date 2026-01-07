import { useState, useRef, useCallback } from "react";
import { Check, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface SwipeRowProps {
  children: React.ReactNode;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  rightLabel?: string;
  leftLabel?: string;
  className?: string;
  disabled?: boolean;
}

const SWIPE_THRESHOLD = 80;
const DIRECTION_LOCK_THRESHOLD = 15;

export function SwipeRow({
  children,
  onSwipeRight,
  onSwipeLeft,
  rightLabel = "Done",
  leftLabel = "Waiting",
  className,
  disabled = false,
}: SwipeRowProps) {
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [directionLocked, setDirectionLocked] = useState<"horizontal" | "vertical" | null>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    setDirectionLocked(null);
    setIsDragging(true);
  }, [disabled]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (disabled || !isDragging) return;
    
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - startX.current;
    const deltaY = currentY - startY.current;

    if (!directionLocked) {
      if (Math.abs(deltaY) > DIRECTION_LOCK_THRESHOLD) {
        setDirectionLocked("vertical");
        setTranslateX(0);
        setIsDragging(false);
        return;
      }
      if (Math.abs(deltaX) > DIRECTION_LOCK_THRESHOLD) {
        setDirectionLocked("horizontal");
      }
    }

    if (directionLocked === "vertical") return;

    const maxSwipe = 150;
    const resistance = 0.7;
    let clampedX = deltaX * resistance;
    clampedX = Math.max(-maxSwipe, Math.min(maxSwipe, clampedX));
    
    if ((clampedX > 0 && onSwipeRight) || (clampedX < 0 && onSwipeLeft)) {
      setTranslateX(clampedX);
    } else {
      setTranslateX(clampedX * 0.3);
    }
  }, [disabled, isDragging, directionLocked, onSwipeRight, onSwipeLeft]);

  const handleTouchEnd = useCallback(() => {
    if (disabled || directionLocked === "vertical") {
      setIsDragging(false);
      setTranslateX(0);
      setDirectionLocked(null);
      return;
    }
    
    setIsDragging(false);

    if (translateX > SWIPE_THRESHOLD && onSwipeRight) {
      setTranslateX(200);
      setTimeout(() => {
        onSwipeRight();
        setTranslateX(0);
      }, 150);
    } else if (translateX < -SWIPE_THRESHOLD && onSwipeLeft) {
      setTranslateX(-200);
      setTimeout(() => {
        onSwipeLeft();
        setTranslateX(0);
      }, 150);
    } else {
      setTranslateX(0);
    }
    
    setDirectionLocked(null);
  }, [disabled, directionLocked, translateX, onSwipeRight, onSwipeLeft]);

  const showRightAction = translateX > 30 && onSwipeRight;
  const showLeftAction = translateX < -30 && onSwipeLeft;
  const rightProgress = Math.min(1, Math.abs(translateX) / SWIPE_THRESHOLD);
  const leftProgress = Math.min(1, Math.abs(translateX) / SWIPE_THRESHOLD);

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden rounded-2xl", className)}
    >
      {onSwipeRight && (
        <div
          className={cn(
            "absolute inset-y-0 left-0 flex items-center justify-start px-4 bg-success text-success-foreground transition-opacity rounded-l-2xl",
            showRightAction ? "opacity-100" : "opacity-0"
          )}
          style={{ 
            width: Math.max(60, Math.abs(translateX) + 20),
            opacity: showRightAction ? rightProgress : 0
          }}
        >
          <div className="flex items-center gap-2">
            <Check className={cn("w-5 h-5 transition-transform", rightProgress >= 1 && "scale-110")} />
            <span className="text-sm font-medium whitespace-nowrap">{rightLabel}</span>
          </div>
        </div>
      )}
      
      {onSwipeLeft && (
        <div
          className={cn(
            "absolute inset-y-0 right-0 flex items-center justify-end px-4 bg-warning text-warning-foreground transition-opacity rounded-r-2xl",
            showLeftAction ? "opacity-100" : "opacity-0"
          )}
          style={{ 
            width: Math.max(60, Math.abs(translateX) + 20),
            opacity: showLeftAction ? leftProgress : 0
          }}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium whitespace-nowrap">{leftLabel}</span>
            <Clock className={cn("w-5 h-5 transition-transform", leftProgress >= 1 && "scale-110")} />
          </div>
        </div>
      )}
      
      <div
        className={cn(
          "relative bg-card transition-transform",
          isDragging && directionLocked === "horizontal" ? "transition-none" : "duration-200 ease-out"
        )}
        style={{ transform: `translateX(${translateX}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
