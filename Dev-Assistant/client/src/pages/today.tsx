import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Clock, 
  MapPin, 
  CheckCircle2,
  Circle,
  Plus,
  Calendar,
  MessageSquare,
  ArrowRight,
  AlertTriangle,
  Play,
  MoreVertical
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format, isToday, isBefore, addMinutes, addDays, setHours, formatDistanceToNow } from "date-fns";
import { triggerHaptic } from "@/components/juice";
import type { Task, CalendarEvent, Request as RequestType } from "@shared/schema";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { PullToRefreshIndicator } from "@/components/pull-to-refresh";
import { SmartSuggestions } from "@/components/smart-suggestions";

interface TodayData {
  tasks: Task[];
  events: CalendarEvent[];
}

const STATUS_COLORS: Record<string, string> = {
  PLANNED: "bg-info-muted text-info-muted-foreground",
  IN_PROGRESS: "bg-warning-muted text-warning-muted-foreground",
  WAITING_ON_CLIENT: "bg-warning-muted text-warning-muted-foreground",
  DONE: "bg-success-muted text-success-muted-foreground",
};

function TodaySkeleton() {
  return (
    <div className="px-4 py-6 space-y-4 max-w-4xl mx-auto">
      <Skeleton className="h-8 w-40" />
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    </div>
  );
}

interface TimelineItem {
  id: string;
  type: "task" | "event";
  title: string;
  time: Date;
  endTime?: Date;
  location?: string | null;
  status?: string;
  urgency?: string;
}

export default function Today() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<TodayData>({
    queryKey: ["/api/today"],
  });

  const { data: requests } = useQuery<RequestType[]>({
    queryKey: ["/api/requests"],
  });

  const convertToTaskMutation = useMutation({
    mutationFn: async (request: RequestType) => {
      const res = await apiRequest("POST", "/api/tasks", {
        title: request.title,
        description: request.description,
        category: request.category,
        urgency: request.urgency,
        dueAt: request.dueAt,
        status: "PLANNED",
      });
      const task = await res.json();
      await apiRequest("PATCH", `/api/requests/${request.id}`, {
        taskId: task.id,
      });
      return task;
    },
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/today"] });
      toast({
        title: "Added to task list",
        description: `"${task.title}" is now in your tasks`,
      });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; status?: string; dueAt?: Date }) => {
      return apiRequest("PATCH", `/api/tasks/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/today"] });
    },
  });

  const pendingRequests = requests?.filter(r => !r.taskId) || [];

  const { isRefreshing, pullDistance, threshold, progress } = usePullToRefresh({
    onRefresh: async () => {
      triggerHaptic("medium");
      await queryClient.invalidateQueries({ queryKey: ["/api/today"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
    },
  });

  if (isLoading) return <TodaySkeleton />;

  const now = new Date();
  
  const timelineItems: TimelineItem[] = [
    ...(data?.tasks
      .filter(t => t.dueAt && isToday(new Date(t.dueAt)))
      .map(t => ({
        id: t.id,
        type: "task" as const,
        title: t.title,
        time: new Date(t.dueAt!),
        location: t.location,
        status: t.status,
        urgency: t.urgency,
      })) || []),
    ...(data?.events
      .filter(e => isToday(new Date(e.startAt)))
      .map(e => ({
        id: e.id,
        type: "event" as const,
        title: e.title,
        time: new Date(e.startAt),
        endTime: e.endAt ? new Date(e.endAt) : undefined,
        location: e.location,
      })) || []),
  ].sort((a, b) => a.time.getTime() - b.time.getTime());

  const upcomingTasks = data?.tasks
    .filter(t => t.status !== "DONE" && (!t.dueAt || !isToday(new Date(t.dueAt))))
    .slice(0, 5) || [];

  const incompleteTasks = data?.tasks
    .filter(t => t.status !== "DONE" && t.status !== "WAITING_ON_CLIENT")
    .sort((a, b) => {
      if (a.urgency === "HIGH" && b.urgency !== "HIGH") return -1;
      if (b.urgency === "HIGH" && a.urgency !== "HIGH") return 1;
      if (a.dueAt && !b.dueAt) return -1;
      if (!a.dueAt && b.dueAt) return 1;
      if (a.dueAt && b.dueAt) return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      return 0;
    }) || [];
  
  const firstIncompleteTask = incompleteTasks[0];
  const nextAction = firstIncompleteTask ? {
    id: firstIncompleteTask.id,
    title: firstIncompleteTask.title,
    time: firstIncompleteTask.dueAt ? new Date(firstIncompleteTask.dueAt) : undefined,
    status: firstIncompleteTask.status,
  } : undefined;

  return (
    <div className="relative px-4 py-6 space-y-6 max-w-4xl mx-auto">
      <PullToRefreshIndicator
        pullDistance={pullDistance}
        threshold={threshold}
        isRefreshing={isRefreshing}
        progress={progress}
      />
      {nextAction && (
        <Card className="bg-primary text-primary-foreground border-primary" data-testid="card-next-action">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <div className="flex-1">
                <p className="text-xs font-medium opacity-90">Next Action</p>
                <p className="font-semibold">{nextAction.title}</p>
                <p className="text-xs opacity-75">
                  {nextAction.time 
                    ? formatDistanceToNow(nextAction.time, { addSuffix: true })
                    : nextAction.status === "IN_PROGRESS" ? "In progress" : "No due date"}
                </p>
              </div>
              {nextAction.status !== "IN_PROGRESS" && (
                <Button 
                  size="sm" 
                  className="bg-amber-500 hover:bg-amber-600 text-white border-amber-500"
                  onClick={() => {
                    updateTaskMutation.mutate({ 
                      id: nextAction.id, 
                      status: "IN_PROGRESS" 
                    });
                    triggerHaptic("medium");
                  }}
                  data-testid="button-start-next-action"
                >
                  Start Now
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Today</h1>
          <p className="text-sm text-muted-foreground">
            {format(now, "EEEE, MMMM d")}
          </p>
        </div>
        <Link href="/tasks">
          <Button size="sm" data-testid="button-add-task">
            <Plus className="h-4 w-4 mr-1" />
            Add Task
          </Button>
        </Link>
      </div>

      <SmartSuggestions />

      <div className="space-y-6">
        {pendingRequests.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Incoming Requests
              <Badge variant="secondary" className="ml-1">{pendingRequests.length}</Badge>
            </h2>
            <div className="space-y-2">
              {pendingRequests.map((request) => (
                <Card key={request.id} className="border-primary/20 bg-primary/5" data-testid={`card-request-${request.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {request.urgency === "HIGH" && (
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                          )}
                          <h3 className="font-medium">{request.title}</h3>
                        </div>
                        {request.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {request.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">
                            {request.category}
                          </Badge>
                          {request.dueAt && (
                            <span className="text-xs text-muted-foreground">
                              Due: {format(new Date(request.dueAt), "MMM d")}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button 
                        size="sm"
                        onClick={() => convertToTaskMutation.mutate(request)}
                        disabled={convertToTaskMutation.isPending}
                        data-testid={`button-convert-${request.id}`}
                      >
                        <ArrowRight className="h-4 w-4 mr-1" />
                        Add to Tasks
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Timeline
          </h2>
          
          {timelineItems.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No scheduled items for today
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
              
              <div className="space-y-3">
                {timelineItems.map((item, index) => {
                  const isPast = isBefore(item.time, now);
                  const isCurrent = !isPast && isBefore(now, item.endTime || addMinutes(item.time, 60));
                  
                  return (
                    <div 
                      key={`${item.type}-${item.id}`}
                      className="relative pl-10"
                      data-testid={`timeline-item-${item.id}`}
                    >
                      <div className={cn(
                        "absolute left-3 top-4 w-2.5 h-2.5 rounded-full border-2 bg-background",
                        item.type === "event" 
                          ? "border-primary" 
                          : item.status === "DONE"
                            ? "border-green-500 bg-green-500"
                            : "border-muted-foreground",
                        isCurrent && "ring-4 ring-primary/20"
                      )}>
                        {isCurrent && (
                          <div className="absolute inset-0 rounded-full bg-primary animate-ping" />
                        )}
                      </div>
                      
                      <Card className={cn(
                        isPast && item.status !== "DONE" && "opacity-60"
                      )}>
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-muted-foreground">
                                  {format(item.time, "h:mm a")}
                                  {item.endTime && ` - ${format(item.endTime, "h:mm a")}`}
                                </span>
                                {item.type === "event" && (
                                  <Badge variant="outline" className="text-xs">
                                    Event
                                  </Badge>
                                )}
                              </div>
                              <h3 className="font-medium mt-1">{item.title}</h3>
                              {item.location && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                  <MapPin className="h-3 w-3" />
                                  {item.location}
                                </p>
                              )}
                            </div>
                            {item.type === "task" && item.status !== "DONE" && (
                              <div className="flex items-center gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateTaskMutation.mutate({ id: item.id, status: "DONE" });
                                    triggerHaptic("medium");
                                    toast({ title: "Task completed" });
                                  }}
                                  data-testid={`button-done-${item.id}`}
                                >
                                  <CheckCircle2 className="h-5 w-5" />
                                </Button>
                                
                                {item.status !== "IN_PROGRESS" && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateTaskMutation.mutate({ id: item.id, status: "IN_PROGRESS" });
                                    }}
                                    data-testid={`button-start-${item.id}`}
                                  >
                                    <Play className="h-4 w-4" />
                                  </Button>
                                )}
                                
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button size="icon" variant="ghost" className="h-8 w-8" data-testid={`button-more-${item.id}`}>
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => {
                                      updateTaskMutation.mutate({ id: item.id, dueAt: setHours(new Date(), 17) });
                                    }}>
                                      <Clock className="h-4 w-4 mr-2" />
                                      Move to 5pm
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => {
                                      updateTaskMutation.mutate({ id: item.id, dueAt: setHours(addDays(new Date(), 1), 9) });
                                    }}>
                                      <Calendar className="h-4 w-4 mr-2" />
                                      Move to tomorrow
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => {
                                      updateTaskMutation.mutate({ id: item.id, status: "WAITING_ON_CLIENT" });
                                    }}>
                                      <Clock className="h-4 w-4 mr-2" />
                                      Mark waiting
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            )}
                            
                            {item.type === "task" && item.status === "DONE" && (
                              <CheckCircle2 className="h-5 w-5 text-green-500" />
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {upcomingTasks.length > 0 && (
          <div className="space-y-1">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Next Up
            </h2>
            <div className="space-y-2">
              {upcomingTasks.map((task) => (
                <Card key={task.id} data-testid={`card-task-${task.id}`}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium truncate">{task.title}</span>
                      </div>
                      <Badge 
                        className={cn("text-xs shrink-0", STATUS_COLORS[task.status || "PLANNED"])}
                      >
                        {task.status?.replace("_", " ")}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
