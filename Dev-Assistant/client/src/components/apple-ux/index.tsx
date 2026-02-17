/**
 * Apple-Grade Depth & Feedback System
 * 
 * FILE: client/src/components/apple-ux/index.tsx
 * ACTION: Create this new file
 * 
 * Implements Apple HIG principles for:
 * - DEPTH: Layered materials, elevation, parallax, z-axis animations
 * - FEEDBACK: Haptics, micro-interactions, success states, loading states
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Check, Loader2, AlertCircle, Info, CheckCircle2, XCircle } from "lucide-react";

// ============================================================================
// HAPTIC FEEDBACK SYSTEM
// ============================================================================

type HapticIntensity = "light" | "medium" | "heavy" | "success" | "warning" | "error" | "selection";

const HAPTIC_PATTERNS: Record<HapticIntensity, number | number[]> = {
  light: 10,
  medium: 25,
  heavy: 50,
  success: [10, 50, 10], // Double tap feeling
  warning: [30, 30, 30], // Triple pulse
  error: [50, 100, 50], // Strong double
  selection: 8, // Subtle tick
};

/**
 * Triggers haptic feedback with Apple-style patterns.
 * Falls back gracefully on unsupported devices.
 */
export function haptic(intensity: HapticIntensity = "light") {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    const pattern = HAPTIC_PATTERNS[intensity];
    navigator.vibrate(pattern);
  }
}

/**
 * Hook for haptic feedback on component interactions
 */
export function useHaptic() {
  return {
    onPress: () => haptic("light"),
    onSuccess: () => haptic("success"),
    onError: () => haptic("error"),
    onWarning: () => haptic("warning"),
    onSelect: () => haptic("selection"),
    onHeavy: () => haptic("heavy"),
  };
}

// ============================================================================
// DEPTH SYSTEM - MATERIALS & ELEVATION
// ============================================================================

type MaterialType = 
  | "regular"      // Standard background
  | "thick"        // More opaque
  | "thin"         // More translucent  
  | "ultrathin"    // Most translucent
  | "chrome";      // Navigation bar style

type ElevationLevel = 0 | 1 | 2 | 3 | 4;

interface MaterialProps {
  type?: MaterialType;
  className?: string;
  children: React.ReactNode;
}

/**
 * Apple-style material/vibrancy effect.
 * Creates frosted glass appearance with proper blur and saturation.
 */
export function Material({ type = "regular", className, children }: MaterialProps) {
  const materialStyles: Record<MaterialType, string> = {
    regular: "bg-background/80 backdrop-blur-xl backdrop-saturate-150",
    thick: "bg-background/90 backdrop-blur-2xl backdrop-saturate-150",
    thin: "bg-background/60 backdrop-blur-lg backdrop-saturate-150",
    ultrathin: "bg-background/40 backdrop-blur-md backdrop-saturate-200",
    chrome: "bg-background/70 backdrop-blur-xl backdrop-saturate-150 border-b border-border/50",
  };

  return (
    <div className={cn(materialStyles[type], className)}>
      {children}
    </div>
  );
}

/**
 * Elevation shadow system matching Apple's depth language.
 */
export function getElevationClass(level: ElevationLevel): string {
  const elevations: Record<ElevationLevel, string> = {
    0: "", // Flat, no shadow
    1: "shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.06)]", // Subtle
    2: "shadow-[0_4px_6px_rgba(0,0,0,0.07),0_2px_4px_rgba(0,0,0,0.06)]", // Cards
    3: "shadow-[0_10px_15px_rgba(0,0,0,0.08),0_4px_6px_rgba(0,0,0,0.05)]", // Floating
    4: "shadow-[0_20px_25px_rgba(0,0,0,0.10),0_10px_10px_rgba(0,0,0,0.04)]", // Modals
  };
  return elevations[level];
}

interface ElevatedCardProps {
  level?: ElevationLevel;
  className?: string;
  children: React.ReactNode;
  hover?: boolean;
  onClick?: () => void;
}

/**
 * Card with Apple-style elevation and hover lift effect.
 */
export function ElevatedCard({ 
  level = 2, 
  className, 
  children, 
  hover = true,
  onClick 
}: ElevatedCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-2xl bg-card border border-border/50 transition-transform duration-300 ease-out",
        getElevationClass(level),
        hover && "hover:scale-[1.02] hover:-translate-y-1",
        hover && level < 4 && `hover:${getElevationClass((level + 1) as ElevationLevel)}`,
        onClick && "cursor-pointer active:scale-[0.98]",
        className
      )}
    >
      {children}
    </div>
  );
}

// ============================================================================
// DEPTH SYSTEM - SHEET ANIMATIONS
// ============================================================================

interface DepthSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

/**
 * Apple-style sheet with depth animation.
 * Background scales down and blurs when sheet opens.
 */
export function DepthSheet({ open, onClose, children, className }: DepthSheetProps) {
  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (open) {
      haptic("medium");
      document.body.style.overflow = "hidden";
      const main = document.querySelector("main") as HTMLElement | null;
      if (main) {
        if (prefersReduced) {
          main.style.opacity = "0.6";
          main.style.transition = "opacity 0.01ms";
        } else {
          main.style.transition = "transform 0.4s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.4s ease";
          main.style.transform = "scale(0.94) translateY(20px)";
          main.style.opacity = "0.6";
          main.style.borderRadius = "20px";
          main.style.willChange = "transform, opacity";
        }
      }
    } else {
      document.body.style.overflow = "";
      const main = document.querySelector("main") as HTMLElement | null;
      if (main) {
        main.style.transform = "";
        main.style.opacity = "";
        main.style.borderRadius = "";
        main.style.willChange = "";
        main.style.transition = "";
      }
    }
    
    return () => {
      document.body.style.overflow = "";
      const main = document.querySelector("main") as HTMLElement | null;
      if (main) {
        main.style.transform = "";
        main.style.opacity = "";
        main.style.borderRadius = "";
        main.style.willChange = "";
        main.style.transition = "";
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      />
      
      {/* Sheet */}
      <div 
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-3xl",
          "animate-in slide-in-from-bottom duration-500",
          "shadow-[0_-10px_40px_rgba(0,0,0,0.15)]",
          "max-h-[90vh] overflow-auto",
          className
        )}
        style={{
          animationTimingFunction: "cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        {/* Drag indicator */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>
        {children}
      </div>
    </>
  );
}

// ============================================================================
// FEEDBACK SYSTEM - SUCCESS ANIMATIONS
// ============================================================================

interface SuccessCheckmarkProps {
  size?: number;
  className?: string;
  onComplete?: () => void;
}

/**
 * Apple-style animated checkmark with draw animation.
 */
export function SuccessCheckmark({ size = 64, className, onComplete }: SuccessCheckmarkProps) {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    haptic("success");
    const timer = setTimeout(() => setAnimate(true), 50);
    const completeTimer = setTimeout(() => onComplete?.(), 1000);
    return () => {
      clearTimeout(timer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div className={cn("relative", className)} style={{ width: size, height: size }}>
      {/* Circle */}
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0"
        style={{ width: size, height: size }}
      >
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className={cn(
            "text-emerald-500 transition-all duration-500",
            animate ? "opacity-100" : "opacity-0"
          )}
          style={{
            strokeDasharray: 283,
            strokeDashoffset: animate ? 0 : 283,
            transition: "stroke-dashoffset 0.5s cubic-bezier(0.65, 0, 0.35, 1)",
          }}
        />
      </svg>
      
      {/* Checkmark */}
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0"
        style={{ width: size, height: size }}
      >
        <path
          d="M30 50 L45 65 L70 35"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-emerald-500"
          style={{
            strokeDasharray: 60,
            strokeDashoffset: animate ? 0 : 60,
            transition: "stroke-dashoffset 0.3s cubic-bezier(0.65, 0, 0.35, 1) 0.4s",
          }}
        />
      </svg>
      
      {/* Burst effect */}
      {animate && (
        <div className="absolute inset-0 animate-ping opacity-30">
          <div 
            className="w-full h-full rounded-full bg-emerald-500"
            style={{ animationDuration: "0.6s", animationIterationCount: 1 }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Full-screen success overlay with animation.
 */
export function SuccessOverlay({ 
  show, 
  message = "Done",
  onComplete 
}: { 
  show: boolean; 
  message?: string;
  onComplete?: () => void;
}) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="flex flex-col items-center gap-4 animate-in zoom-in-95 duration-300">
        <SuccessCheckmark size={80} onComplete={onComplete} />
        <p className="text-xl font-semibold text-foreground animate-in fade-in slide-in-from-bottom-2 duration-500 delay-300">
          {message}
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// FEEDBACK SYSTEM - LOADING STATES
// ============================================================================

interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  success?: boolean;
  children: React.ReactNode;
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "default" | "lg";
}

/**
 * Button with loading spinner and success state.
 */
export function LoadingButton({
  loading = false,
  success = false,
  children,
  className,
  disabled,
  onClick,
  variant = "default",
  size = "default",
  ...props
}: LoadingButtonProps) {
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (success) {
      setShowSuccess(true);
      haptic("success");
      const timer = setTimeout(() => setShowSuccess(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    haptic("light");
    onClick?.(e);
  };

  const baseStyles = "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-transform duration-200 active:scale-[0.97]";
  
  const variantStyles = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
    outline: "border border-border bg-background hover:bg-muted",
    ghost: "hover:bg-muted",
  };
  
  const sizeStyles = {
    sm: "h-9 px-4 text-sm",
    default: "h-11 px-6 text-base",
    lg: "h-14 px-8 text-lg",
  };

  return (
    <button
      className={cn(
        baseStyles,
        variantStyles[variant],
        sizeStyles[size],
        (loading || disabled) && "opacity-70 cursor-not-allowed",
        className
      )}
      disabled={loading || disabled}
      onClick={handleClick}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="animate-pulse">Loading...</span>
        </>
      ) : showSuccess ? (
        <>
          <Check className="h-4 w-4 animate-in zoom-in duration-200" />
          <span>Done!</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

/**
 * Skeleton with Apple-style shimmer animation.
 */
export function AppleSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg bg-muted relative overflow-hidden",
        className
      )}
    >
      <div 
        className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite]"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
        }}
      />
    </div>
  );
}

/**
 * Content skeleton that matches the layout of actual content.
 */
export function CardSkeleton() {
  return (
    <ElevatedCard level={1} hover={false} className="p-5 space-y-4">
      <div className="flex items-center gap-3">
        <AppleSkeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-2 flex-1">
          <AppleSkeleton className="h-4 w-3/4" />
          <AppleSkeleton className="h-3 w-1/2" />
        </div>
      </div>
      <AppleSkeleton className="h-20 w-full" />
      <div className="flex gap-2">
        <AppleSkeleton className="h-8 w-20 rounded-full" />
        <AppleSkeleton className="h-8 w-20 rounded-full" />
      </div>
    </ElevatedCard>
  );
}

// ============================================================================
// FEEDBACK SYSTEM - TOAST NOTIFICATIONS
// ============================================================================

type ToastType = "success" | "error" | "warning" | "info";

interface AppleToastProps {
  type?: ToastType;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  onClose?: () => void;
}

/**
 * Apple-style toast notification with haptic feedback.
 */
export function AppleToast({ 
  type = "info", 
  title, 
  description, 
  action,
  onClose 
}: AppleToastProps) {
  useEffect(() => {
    const hapticMap: Record<ToastType, HapticIntensity> = {
      success: "success",
      error: "error",
      warning: "warning",
      info: "light",
    };
    haptic(hapticMap[type]);
  }, [type]);

  const icons: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle2 className="h-5 w-5 text-emerald-500" />,
    error: <XCircle className="h-5 w-5 text-red-500" />,
    warning: <AlertCircle className="h-5 w-5 text-amber-500" />,
    info: <Info className="h-5 w-5 text-blue-500" />,
  };

  return (
    <div className={cn(
      "flex items-start gap-3 p-4 rounded-2xl",
      "bg-background/95 backdrop-blur-xl",
      "shadow-[0_8px_30px_rgba(0,0,0,0.12)]",
      "border border-border/50",
      "animate-in slide-in-from-top-2 fade-in duration-300",
    )}>
      {icons[type]}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground">{title}</p>
        {description && (
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      {action && (
        <button
          onClick={() => {
            haptic("light");
            action.onClick();
          }}
          className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// ============================================================================
// FEEDBACK SYSTEM - PULL TO REFRESH
// ============================================================================

interface PullIndicatorProps {
  progress: number; // 0-1
  isRefreshing: boolean;
}

/**
 * Apple-style pull-to-refresh indicator with spring physics.
 */
export function PullIndicator({ progress, isRefreshing }: PullIndicatorProps) {
  const rotation = Math.min(progress * 360, 360);
  const scale = 0.5 + (progress * 0.5);

  return (
    <div 
      className={cn(
        "flex items-center justify-center h-12 transition-opacity duration-200",
        progress > 0 || isRefreshing ? "opacity-100" : "opacity-0"
      )}
    >
      <div
        className={cn(
          "w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary",
          isRefreshing && "animate-spin"
        )}
        style={{
          transform: isRefreshing ? "scale(1)" : `scale(${scale}) rotate(${rotation}deg)`,
          transition: isRefreshing ? "none" : "transform 0.1s ease-out",
        }}
      />
    </div>
  );
}

// ============================================================================
// FEEDBACK SYSTEM - PROGRESS INDICATORS
// ============================================================================

interface ProgressRingProps {
  progress: number; // 0-100
  size?: number;
  strokeWidth?: number;
  className?: string;
}

/**
 * Circular progress indicator with smooth animation.
 */
export function ProgressRing({ 
  progress, 
  size = 40, 
  strokeWidth = 4,
  className 
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <svg width={size} height={size} className={cn("transform -rotate-90", className)}>
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-muted"
      />
      {/* Progress circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        className="text-primary transition-all duration-500 ease-out"
        style={{
          strokeDasharray: circumference,
          strokeDashoffset: offset,
        }}
      />
    </svg>
  );
}

/**
 * Indeterminate progress bar with shimmer.
 */
export function IndeterminateProgress({ className }: { className?: string }) {
  return (
    <div className={cn("h-1 w-full bg-muted rounded-full overflow-hidden", className)}>
      <div 
        className="h-full w-1/3 bg-primary rounded-full animate-[indeterminate_1.5s_infinite_ease-in-out]"
        style={{
          animation: "indeterminate 1.5s infinite ease-in-out",
        }}
      />
    </div>
  );
}

// ============================================================================
// MICRO-INTERACTIONS - PRESSABLE
// ============================================================================

interface PressableProps {
  children: React.ReactNode;
  onPress?: () => void;
  className?: string;
  disabled?: boolean;
  hapticFeedback?: HapticIntensity;
}

/**
 * Wrapper that adds press feedback to any element.
 */
export function Pressable({ 
  children, 
  onPress, 
  className, 
  disabled,
  hapticFeedback = "light"
}: PressableProps) {
  const [isPressed, setIsPressed] = useState(false);

  const handlePress = () => {
    if (disabled) return;
    haptic(hapticFeedback);
    onPress?.();
  };

  return (
    <div
      className={cn(
        "transition-transform duration-100 ease-out cursor-pointer select-none",
        isPressed && "scale-[0.97]",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
      onMouseDown={() => !disabled && setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onMouseLeave={() => setIsPressed(false)}
      onTouchStart={() => !disabled && setIsPressed(true)}
      onTouchEnd={() => setIsPressed(false)}
      onClick={handlePress}
    >
      {children}
    </div>
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  type HapticIntensity,
  type MaterialType,
  type ElevationLevel,
  type ToastType,
};
