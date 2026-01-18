import { useState, useEffect, useCallback } from "react";
import { WifiOff, Wifi, RefreshCw, Download, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Hook to track online/offline status with enhanced PWA features
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setWasOffline(true);
      // Clear "was offline" flag after 5 seconds
      setTimeout(() => setWasOffline(false), 5000);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { isOnline, wasOffline };
}

/**
 * Hook to track service worker and PWA update status
 */
export function useServiceWorker() {
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      // Check if service worker is registered
      navigator.serviceWorker.ready.then((reg) => {
        setRegistration(reg);
        setOfflineReady(true);
      });

      // Listen for service worker updates
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        // New service worker activated, reload to get updates
        window.location.reload();
      });
    }
  }, []);

  const updateServiceWorker = useCallback(() => {
    if (registration?.waiting) {
      // Tell the waiting service worker to skip waiting
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
  }, [registration]);

  // Listen for update available
  useEffect(() => {
    if (!registration) return;

    const handleUpdateFound = () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          // New content is available, prompt user to refresh
          setNeedsRefresh(true);
        }
      });
    };

    registration.addEventListener("updatefound", handleUpdateFound);
    return () => registration.removeEventListener("updatefound", handleUpdateFound);
  }, [registration]);

  return {
    needsRefresh,
    offlineReady,
    updateServiceWorker,
    registration,
  };
}

/**
 * Hook to check if app can be installed (PWA)
 */
export function useInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!installPrompt) return false;
    
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    
    if (outcome === "accepted") {
      setInstallPrompt(null);
      return true;
    }
    return false;
  }, [installPrompt]);

  return {
    canInstall: !!installPrompt && !isInstalled,
    isInstalled,
    promptInstall,
  };
}

/**
 * Offline indicator banner component
 */
export function OfflineIndicator() {
  const { isOnline, wasOffline } = useOnlineStatus();
  const [dismissed, setDismissed] = useState(false);

  // Auto-dismiss after coming back online
  useEffect(() => {
    if (isOnline && wasOffline) {
      const timer = setTimeout(() => setDismissed(false), 100);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline]);

  if (dismissed) return null;

  // Show offline banner
  if (!isOnline) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-destructive text-destructive-foreground px-4 py-2 flex items-center justify-center gap-2 text-sm animate-slide-in-right">
        <WifiOff className="w-4 h-4" />
        <span>You're offline. Changes will sync when reconnected.</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 ml-2 text-destructive-foreground hover:bg-destructive-foreground/10"
          onClick={() => setDismissed(true)}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  // Show "back online" toast
  if (wasOffline) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-success text-success-foreground px-4 py-2 flex items-center justify-center gap-2 text-sm animate-slide-in-right">
        <Wifi className="w-4 h-4" />
        <span>You're back online. Syncing changes...</span>
      </div>
    );
  }

  return null;
}

/**
 * Update available banner component
 */
export function UpdateBanner() {
  const { needsRefresh, updateServiceWorker, offlineReady } = useServiceWorker();
  const [showOfflineReady, setShowOfflineReady] = useState(false);

  // Show "offline ready" notification once
  useEffect(() => {
    if (offlineReady && !localStorage.getItem("hndld-offline-ready-shown")) {
      setShowOfflineReady(true);
      localStorage.setItem("hndld-offline-ready-shown", "true");
      setTimeout(() => setShowOfflineReady(false), 5000);
    }
  }, [offlineReady]);

  if (needsRefresh) {
    return (
      <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50 bg-card border border-border rounded-2xl shadow-luxury-lg p-4 animate-fade-in-up">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <RefreshCw className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm">Update Available</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              A new version of hndld is ready.
            </p>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => window.location.reload()}
          >
            Later
          </Button>
          <Button
            size="sm"
            className="flex-1"
            onClick={updateServiceWorker}
          >
            Update Now
          </Button>
        </div>
      </div>
    );
  }

  if (showOfflineReady) {
    return (
      <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50 bg-card border border-border rounded-2xl shadow-luxury-lg p-4 animate-fade-in-up">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-5 h-5 text-success" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-sm">Ready to Work Offline</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              hndld is now cached for offline use.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setShowOfflineReady(false)}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  return null;
}

/**
 * Install app prompt component
 */
export function InstallPrompt() {
  const { canInstall, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(
    localStorage.getItem("hndld-install-dismissed") === "true"
  );

  if (!canInstall || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("hndld-install-dismissed", "true");
  };

  return (
    <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50 bg-card border border-border rounded-2xl shadow-luxury-lg p-4 animate-fade-in-up">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Download className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm">Install hndld</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Add to your home screen for the best experience.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={handleDismiss}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex gap-2 mt-3">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={handleDismiss}
        >
          Not Now
        </Button>
        <Button
          size="sm"
          className="flex-1"
          onClick={promptInstall}
        >
          Install
        </Button>
      </div>
    </div>
  );
}

/**
 * Combined PWA status component - includes all PWA indicators
 */
export function PWAStatus() {
  return (
    <>
      <OfflineIndicator />
      <UpdateBanner />
      <InstallPrompt />
    </>
  );
}

export default PWAStatus;
