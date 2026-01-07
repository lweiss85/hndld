import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Calendar as CalendarIcon, 
  RefreshCw, 
  MapPin,
  Clock,
  Plus,
  CheckCircle,
  ExternalLink,
  Info
} from "lucide-react";
import { format, isToday, isTomorrow, startOfWeek, addDays, isSameDay } from "date-fns";
import type { CalendarEvent } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { PageTransition } from "@/components/juice";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useState } from "react";

function CalendarSkeleton() {
  return (
    <div className="px-4 py-6 space-y-4 max-w-4xl mx-auto">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-10 w-full" />
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-20" />
      ))}
    </div>
  );
}

function formatEventDate(date: Date) {
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "EEEE, MMM d");
}

interface CalendarStatus {
  connected: boolean;
  provider: string;
}

export default function Calendar() {
  const { toast } = useToast();
  const [showSkylightTip, setShowSkylightTip] = useState(false);

  const { data: calendarStatus } = useQuery<CalendarStatus>({
    queryKey: ["/api/calendar/status"],
  });

  const { data: events, isLoading, refetch, isFetching } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/calendar-events"],
  });

  const createTaskFromEventMutation = useMutation({
    mutationFn: async (eventId: string) => {
      return apiRequest("POST", `/api/calendar-events/${eventId}/create-task`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Task created",
        description: "Event has been converted to a task",
      });
    },
  });

  const syncCalendarMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/calendar/sync");
      return response.json();
    },
    onSuccess: (data: { message?: string; success?: boolean; synced?: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      toast({
        title: data.success !== false ? "Calendar synced" : "Sync issue",
        description: data.message || "Events updated",
      });
    },
    onError: () => {
      toast({
        title: "Sync failed",
        description: "Could not sync calendar events",
        variant: "destructive",
      });
    },
  });

  if (isLoading) return <CalendarSkeleton />;

  const weekStart = startOfWeek(new Date());
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const eventsByDay = weekDays.reduce((acc, day) => {
    acc[format(day, "yyyy-MM-dd")] = events?.filter(e => 
      isSameDay(new Date(e.startAt), day)
    ) || [];
    return acc;
  }, {} as Record<string, CalendarEvent[]>);

  const isConnected = calendarStatus?.connected;

  return (
    <PageTransition>
      <div className="px-4 py-6 space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-4 animate-fade-in-up">
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Calendar</h1>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => syncCalendarMutation.mutate()}
            disabled={syncCalendarMutation.isPending || isFetching}
            data-testid="button-sync"
          >
            <RefreshCw className={cn(
              "h-4 w-4 mr-1",
              (syncCalendarMutation.isPending || isFetching) && "animate-spin"
            )} />
            Sync
          </Button>
        </div>

        {isConnected ? (
          <Card className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-green-700 dark:text-green-300">
                  Google Calendar connected. Events sync automatically.
                </span>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-muted/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  Connect Google Calendar to sync your events
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        <Collapsible open={showSkylightTip} onOpenChange={setShowSkylightTip}>
          <Card>
            <CardContent className="p-4">
              <CollapsibleTrigger asChild>
                <button className="flex items-center justify-between gap-2 w-full text-left">
                  <div className="flex items-center gap-2">
                    <Info className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Using Skylight Calendar?</span>
                  </div>
                  <Badge variant="secondary">Tap for setup</Badge>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Skylight Calendar syncs with Google Calendar, so your Skylight events will appear here automatically.
                </p>
                <div className="space-y-2 text-sm">
                  <p className="font-medium">To connect Skylight to Google Calendar:</p>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                    <li>Open the Skylight app on your phone</li>
                    <li>Go to Settings and tap Calendar</li>
                    <li>Select "Sync with Google Calendar"</li>
                    <li>Sign in with the same Google account connected here</li>
                    <li>Choose which calendars to sync</li>
                  </ol>
                </div>
                <div className="pt-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => window.open("https://myskylight.com/lp/calendar-syncing/", "_blank")}
                    data-testid="button-skylight-help"
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Skylight Help
                  </Button>
                </div>
              </CollapsibleContent>
            </CardContent>
          </Card>
        </Collapsible>

        <div className="space-y-6">
          {weekDays.map((day) => {
            const dayKey = format(day, "yyyy-MM-dd");
            const dayEvents = eventsByDay[dayKey];
            const isCurrentDay = isToday(day);

            if (dayEvents.length === 0 && !isCurrentDay) return null;

            return (
              <div key={dayKey} className="space-y-2">
                <h2 className={cn(
                  "text-sm font-medium uppercase tracking-wide",
                  isCurrentDay ? "text-primary" : "text-muted-foreground"
                )}>
                  {formatEventDate(day)}
                </h2>
                
                {dayEvents.length === 0 ? (
                  <Card>
                    <CardContent className="p-4 text-center text-sm text-muted-foreground">
                      No events scheduled
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {dayEvents.map((event) => (
                      <Card 
                        key={event.id} 
                        className="overflow-visible"
                        data-testid={`card-event-${event.id}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex gap-3">
                            <div className="w-1 rounded-full bg-primary shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <h3 className="font-medium">{event.title}</h3>
                                  <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                                    <span className="flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      {format(new Date(event.startAt), "h:mm a")}
                                      {event.endAt && ` - ${format(new Date(event.endAt), "h:mm a")}`}
                                    </span>
                                    {event.location && (
                                      <span className="flex items-center gap-1">
                                        <MapPin className="h-3 w-3" />
                                        {event.location}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="shrink-0"
                                  onClick={() => createTaskFromEventMutation.mutate(event.id)}
                                  disabled={createTaskFromEventMutation.isPending}
                                  data-testid={`button-create-task-${event.id}`}
                                >
                                  <Plus className="h-4 w-4 mr-1" />
                                  Task
                                </Button>
                              </div>
                              {event.description && (
                                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                                  {event.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {events?.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <CalendarIcon className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-medium text-lg mb-1">No calendar events</h3>
              <p className="text-sm text-muted-foreground max-w-xs mb-4">
                {isConnected 
                  ? "No upcoming events found. Tap Sync to refresh."
                  : "Connect your Google Calendar to see events here"}
              </p>
              {!isConnected && (
                <p className="text-xs text-muted-foreground max-w-xs">
                  If you use Skylight Calendar, sync it with Google Calendar first, then your events will appear here.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
