import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Bell, Check, CheckCheck, X, FileText, CheckSquare, MessageSquare, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import type { Notification } from "@shared/schema";
import { useLocation } from "wouter";

const notificationIcons: Record<string, typeof Bell> = {
  APPROVAL_NEEDED: FileText,
  TASK_WAITING: CheckSquare,
  UPDATE_POSTED: MessageSquare,
  DAILY_DIGEST: Calendar,
  WEEKLY_BRIEF: Calendar,
  REQUEST_RECEIVED: MessageSquare,
};

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
  });

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    refetchInterval: 30000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/mark-all-read"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const unreadCount = unreadData?.count || 0;

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      markReadMutation.mutate(notification.id);
    }
    if (notification.linkUrl) {
      setLocation(notification.linkUrl);
      setOpen(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <SheetTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className="relative"
              data-testid="button-notification-center"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <Badge 
                  className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]"
                  variant="destructive"
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Badge>
              )}
            </Button>
          </SheetTrigger>
        </TooltipTrigger>
        <TooltipContent>Notifications</TooltipContent>
      </Tooltip>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader className="flex flex-row items-center justify-between gap-2 pb-4">
          <SheetTitle>Notifications</SheetTitle>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="h-4 w-4 mr-1" />
              Mark all read
            </Button>
          )}
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bell className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="font-medium text-lg mb-1">No notifications</h3>
              <p className="text-sm text-muted-foreground">
                You're all caught up
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((notification) => {
                const Icon = notificationIcons[notification.type] || Bell;
                return (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`p-3 rounded-xl cursor-pointer transition-colors ${
                      notification.isRead 
                        ? "bg-muted/30" 
                        : "bg-accent/50 hover:bg-accent/70"
                    }`}
                    data-testid={`notification-item-${notification.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${
                        notification.isRead ? "bg-muted" : "bg-primary/10"
                      }`}>
                        <Icon className={`h-4 w-4 ${
                          notification.isRead ? "text-muted-foreground" : "text-primary"
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className={`font-medium text-sm truncate ${
                            notification.isRead ? "text-muted-foreground" : ""
                          }`}>
                            {notification.title}
                          </h4>
                          {!notification.isRead && (
                            <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />
                          )}
                        </div>
                        {notification.body && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                            {notification.body}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(notification.createdAt!), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
