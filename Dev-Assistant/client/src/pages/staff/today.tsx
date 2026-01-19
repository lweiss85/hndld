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
  Play,
} from "lucide-react";
import { format, isToday } from "date-fns";
import { triggerHaptic } from "@/components/juice";
import type { Task, CalendarEvent } from "@shared/schema";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { PullToRefreshIndicator } from "@/components/pull-to-refresh";

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

export default function StaffToday() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<TodayData>({
    queryKey: ["/api/today"],
  });

  const { isRefreshing, pullDistance, threshold, progress } = usePullToRefresh({
    onRefresh: async () => {
      triggerHaptic("medium");
      await queryClient.invalidateQueries({ queryKey: ["/api/today"] });
    },
  });

  const startTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const res = await apiRequest("PATCH", `/api/tasks/${taskId}`, {
        status: "IN_PROGRESS",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      triggerHaptic("medium");
      toast({
        title: "Job started",
        description: "Good luck with your job!",
      });
    },
  });

  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const res = await apiRequest("POST", `/api/tasks/${taskId}/complete`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      triggerHaptic("medium");
      toast({
        title: "Job completed",
        description: "Great work!",
      });
    },
  });

  if (isLoading) {
    return <TodaySkeleton />;
  }

  const now = new Date();
  const todayTasks = (data?.tasks || []).filter(task => {
    if (task.status === "DONE" || task.status === "CANCELLED") return false;
    if (task.dueAt) {
      return isToday(new Date(task.dueAt));
    }
    return true;
  });

  const sortedTasks = [...todayTasks].sort((a, b) => {
    if (a.status === "IN_PROGRESS" && b.status !== "IN_PROGRESS") return -1;
    if (b.status === "IN_PROGRESS" && a.status !== "IN_PROGRESS") return 1;
    if (a.dueAt && b.dueAt) {
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    }
    return 0;
  });

  return (
    <div>
      <PullToRefreshIndicator 
        isRefreshing={isRefreshing} 
        pullDistance={pullDistance} 
        threshold={threshold}
        progress={progress}
      />
      <div className="px-4 py-6 space-y-6 max-w-4xl mx-auto pb-24">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Today</h1>
            <p className="text-muted-foreground text-sm">
              {format(now, "EEEE, MMMM d")}
            </p>
          </div>
        </div>

        {sortedTasks.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="pt-6 text-center">
              <CheckCircle2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No jobs for today</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                You're all caught up!
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {sortedTasks.map((task) => (
              <Card 
                key={task.id} 
                className={cn(
                  "overflow-hidden transition-all",
                  task.status === "IN_PROGRESS" && "ring-2 ring-warning"
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => {
                        if (task.status === "IN_PROGRESS") {
                          completeTaskMutation.mutate(task.id);
                        } else {
                          startTaskMutation.mutate(task.id);
                        }
                      }}
                      className="mt-0.5 flex-shrink-0"
                    >
                      {task.status === "IN_PROGRESS" ? (
                        <CheckCircle2 className="h-6 w-6 text-warning" />
                      ) : (
                        <Circle className="h-6 w-6 text-muted-foreground" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-foreground truncate">
                          {task.title}
                        </span>
                        <Badge className={STATUS_COLORS[task.status || "PLANNED"]}>
                          {task.status?.replace(/_/g, " ") || "PLANNED"}
                        </Badge>
                      </div>
                      {task.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                          {task.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {task.dueAt && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(task.dueAt), "h:mm a")}
                          </span>
                        )}
                        {task.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {task.location}
                          </span>
                        )}
                        {task.estimatedMinutes && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            ~{task.estimatedMinutes} min
                          </span>
                        )}
                      </div>
                    </div>
                    {task.status !== "IN_PROGRESS" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startTaskMutation.mutate(task.id)}
                        className="flex-shrink-0"
                      >
                        <Play className="h-4 w-4 mr-1" />
                        Start
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="pt-4">
          <Link href="/jobs">
            <Button variant="ghost" className="w-full">
              View all jobs
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
