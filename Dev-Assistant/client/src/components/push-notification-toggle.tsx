import { usePushNotifications } from "@/hooks/use-push-notifications";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, BellOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface PushNotificationToggleProps {
  className?: string;
}

export function PushNotificationToggle({ className }: PushNotificationToggleProps) {
  const {
    isSupported,
    isEnabled,
    isSubscribed,
    permission,
    subscribe,
    unsubscribe,
    isSubscribing,
    isUnsubscribing,
  } = usePushNotifications();

  if (!isSupported) {
    return (
      <div className={cn("flex items-center gap-3 text-sm text-muted-foreground", className)}>
        <BellOff className="h-4 w-4" />
        <span>Push notifications not supported in this browser</span>
      </div>
    );
  }

  if (!isEnabled) {
    return (
      <div className={cn("flex items-center gap-3 text-sm text-muted-foreground", className)}>
        <BellOff className="h-4 w-4" />
        <span>Push notifications not configured</span>
      </div>
    );
  }

  if (permission === "denied") {
    return (
      <div className={cn("flex items-center gap-3 text-sm text-muted-foreground", className)}>
        <BellOff className="h-4 w-4" />
        <span>Notifications blocked. Enable in browser settings.</span>
      </div>
    );
  }

  const isLoading = isSubscribing || isUnsubscribing;

  const handleToggle = () => {
    if (isSubscribed) {
      unsubscribe();
    } else {
      subscribe();
    }
  };

  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <div className="flex items-center gap-3">
        <Bell className="h-4 w-4 text-muted-foreground" />
        <Label htmlFor="push-toggle" className="text-sm font-medium cursor-pointer">
          Push notifications
        </Label>
      </div>
      <Switch
        id="push-toggle"
        checked={isSubscribed}
        onCheckedChange={handleToggle}
        disabled={isLoading}
        data-testid="push-notification-toggle"
      />
    </div>
  );
}
