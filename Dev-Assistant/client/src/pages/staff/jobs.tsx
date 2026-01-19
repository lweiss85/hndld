import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Clock, 
  MapPin, 
  CheckCircle2,
  Circle,
  Play,
  Calendar,
} from "lucide-react";
import { format } from "date-fns";
import { triggerHaptic } from "@/components/juice";
import type { Task } from "@shared/schema";
import { cn } from "@/lib/utils";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { PullToRefreshIndicator } from "@/components/pull-to-refresh";
import { useState } from "react";

const STATUS_COLORS: Record<string, string> = {
  PLANNED: "bg-info-muted text-info-muted-foreground",
  IN_PROGRESS: "bg-warning-muted text-warning-muted-foreground",
  WAITING_ON_CLIENT: "bg-warning-muted text-warning-muted-foreground",
  DONE: "bg-success-muted text-success-muted-foreground",
  CANCELLED: "bg-muted text-muted-foreground",
};

function JobsSkeleton() {
  return (
    <div className="px-4 py-6 space-y-4 max-w-4xl mx-auto">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-10 w-full" />
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    </div>
  );
}

function TaskCard({ task }: { task: Task }) {
  const { toast } = useToast();

  const startTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const res = await apiRequest("PATCH", `/api/tasks/${taskId}`, {
        status: "IN_PROGRESS",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/today"] });
      triggerHaptic("medium");
      toast({
        title: "Job started",
        description: "Good luck!",
      });
    },
  });

  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const res = await apiRequest("POST", `/api/tasks/${taskId}/complete`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/today"] });
      triggerHaptic("medium");
      toast({
        title: "Job completed",
        description: "Great work!",
      });
    },
  });

  const isCompleted = task.status === "DONE" || task.status === "CANCELLED";

  return (
    <Card 
      className={cn(
        "overflow-hidden transition-all",
        task.status === "IN_PROGRESS" && "ring-2 ring-warning",
        isCompleted && "opacity-60"
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => {
              if (isCompleted) return;
              if (task.status === "IN_PROGRESS") {
                completeTaskMutation.mutate(task.id);
              } else {
                startTaskMutation.mutate(task.id);
              }
            }}
            className="mt-0.5 flex-shrink-0"
            disabled={isCompleted}
          >
            {isCompleted ? (
              <CheckCircle2 className="h-6 w-6 text-success" />
            ) : task.status === "IN_PROGRESS" ? (
              <CheckCircle2 className="h-6 w-6 text-warning" />
            ) : (
              <Circle className="h-6 w-6 text-muted-foreground" />
            )}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={cn(
                "font-medium truncate",
                isCompleted ? "text-muted-foreground line-through" : "text-foreground"
              )}>
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
            <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
              {task.dueAt && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(task.dueAt), "MMM d, h:mm a")}
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
          {!isCompleted && task.status !== "IN_PROGRESS" && (
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
  );
}

export default function StaffJobs() {
  const [activeTab, setActiveTab] = useState("active");

  const { data: tasks, isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const { isRefreshing, pullDistance, threshold, progress } = usePullToRefresh({
    onRefresh: async () => {
      triggerHaptic("medium");
      await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  if (isLoading) {
    return <JobsSkeleton />;
  }

  const allTasks = tasks || [];
  const activeTasks = allTasks.filter(t => 
    t.status !== "DONE" && t.status !== "CANCELLED"
  );
  const completedTasks = allTasks.filter(t => 
    t.status === "DONE" || t.status === "CANCELLED"
  );

  const sortTasks = (list: Task[]) => {
    return [...list].sort((a, b) => {
      if (a.status === "IN_PROGRESS" && b.status !== "IN_PROGRESS") return -1;
      if (b.status === "IN_PROGRESS" && a.status !== "IN_PROGRESS") return 1;
      if (a.dueAt && b.dueAt) {
        return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      }
      if (a.dueAt) return -1;
      if (b.dueAt) return 1;
      return 0;
    });
  };

  return (
    <div>
      <PullToRefreshIndicator 
        isRefreshing={isRefreshing} 
        pullDistance={pullDistance} 
        threshold={threshold}
        progress={progress}
      />
      <div className="px-4 py-6 space-y-6 max-w-4xl mx-auto pb-24">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Jobs</h1>
          <p className="text-muted-foreground text-sm">
            Your assigned jobs
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="active">
              Active ({activeTasks.length})
            </TabsTrigger>
            <TabsTrigger value="completed">
              Completed ({completedTasks.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-4 space-y-3">
            {activeTasks.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="pt-6 text-center">
                  <CheckCircle2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">No active jobs</p>
                  <p className="text-sm text-muted-foreground/70 mt-1">
                    You're all caught up!
                  </p>
                </CardContent>
              </Card>
            ) : (
              sortTasks(activeTasks).map((task) => (
                <TaskCard key={task.id} task={task} />
              ))
            )}
          </TabsContent>

          <TabsContent value="completed" className="mt-4 space-y-3">
            {completedTasks.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="pt-6 text-center">
                  <p className="text-muted-foreground">No completed jobs yet</p>
                </CardContent>
              </Card>
            ) : (
              sortTasks(completedTasks).map((task) => (
                <TaskCard key={task.id} task={task} />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
