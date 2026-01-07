import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface UndoToastProps {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  duration?: number;
}

export function UndoToast({ message, onUndo, onDismiss, duration = 5000 }: UndoToastProps) {
  const [progress, setProgress] = useState(100);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      
      if (remaining <= 0) {
        clearInterval(interval);
        setIsVisible(false);
        setTimeout(onDismiss, 300);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [duration, onDismiss]);

  if (!isVisible) return null;

  return (
    <div
      className={cn(
        "fixed bottom-24 left-4 right-4 z-50 mx-auto max-w-sm",
        "bg-foreground text-background rounded-xl shadow-lg",
        "transform transition-all duration-300",
        isVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      )}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="text-sm font-medium flex-1">{message}</span>
        <button
          onClick={() => {
            onUndo();
            setIsVisible(false);
            setTimeout(onDismiss, 100);
          }}
          className="text-sm font-semibold text-primary-foreground bg-primary px-3 py-1 rounded-lg"
          data-testid="button-undo"
        >
          Undo
        </button>
        <button
          onClick={() => {
            setIsVisible(false);
            setTimeout(onDismiss, 100);
          }}
          className="p-1 opacity-70 hover:opacity-100"
          data-testid="button-dismiss-toast"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="h-0.5 bg-background/20 rounded-b-xl overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-50 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

interface UndoToastState {
  id: string;
  message: string;
  onUndo: () => void;
}

let toastQueue: UndoToastState[] = [];
let updateListeners: ((toasts: UndoToastState[]) => void)[] = [];

export function showUndoToast(message: string, onUndo: () => void) {
  const id = Math.random().toString(36).substr(2, 9);
  toastQueue = [...toastQueue, { id, message, onUndo }];
  updateListeners.forEach(listener => listener(toastQueue));
  return id;
}

export function useUndoToasts() {
  const [toasts, setToasts] = useState<UndoToastState[]>(toastQueue);

  useEffect(() => {
    const listener = (newToasts: UndoToastState[]) => setToasts(newToasts);
    updateListeners.push(listener);
    return () => {
      updateListeners = updateListeners.filter(l => l !== listener);
    };
  }, []);

  const dismissToast = (id: string) => {
    toastQueue = toastQueue.filter(t => t.id !== id);
    updateListeners.forEach(listener => listener(toastQueue));
  };

  return { toasts, dismissToast };
}

export function UndoToastContainer() {
  const { toasts, dismissToast } = useUndoToasts();

  if (toasts.length === 0) return null;

  const currentToast = toasts[0];

  return (
    <UndoToast
      key={currentToast.id}
      message={currentToast.message}
      onUndo={currentToast.onUndo}
      onDismiss={() => dismissToast(currentToast.id)}
    />
  );
}
