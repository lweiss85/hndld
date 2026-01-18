import { Check, Circle, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface TimelineStep {
  label: string;
  description?: string;
  timestamp?: Date | string;
  status: "completed" | "current" | "upcoming";
}

interface StatusTimelineProps {
  steps: TimelineStep[];
  className?: string;
  compact?: boolean;
}

export function StatusTimeline({ steps, className, compact = false }: StatusTimelineProps) {
  return (
    <div className={cn("relative", className)}>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        
        return (
          <div key={index} className={cn("flex gap-3", !isLast && (compact ? "pb-3" : "pb-4"))}>
            <div className="relative flex flex-col items-center">
              <div
                className={cn(
                  "flex items-center justify-center rounded-full shrink-0",
                  compact ? "w-6 h-6" : "w-8 h-8",
                  step.status === "completed" && "bg-success text-success-foreground",
                  step.status === "current" && "bg-primary text-primary-foreground",
                  step.status === "upcoming" && "bg-muted text-muted-foreground"
                )}
              >
                {step.status === "completed" && <Check className={compact ? "h-3 w-3" : "h-4 w-4"} />}
                {step.status === "current" && <Loader2 className={cn(compact ? "h-3 w-3" : "h-4 w-4", "animate-spin")} />}
                {step.status === "upcoming" && <Circle className={compact ? "h-3 w-3" : "h-4 w-4"} />}
              </div>
              {!isLast && (
                <div
                  className={cn(
                    "w-0.5 flex-1 mt-1",
                    step.status === "completed" ? "bg-success" : "bg-border"
                  )}
                />
              )}
            </div>
            <div className={cn("flex-1 min-w-0", compact ? "pt-0.5" : "pt-1")}>
              <p
                className={cn(
                  "font-medium",
                  compact ? "text-xs" : "text-sm",
                  step.status === "upcoming" && "text-muted-foreground"
                )}
              >
                {step.label}
              </p>
              {step.description && !compact && (
                <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
              )}
              {step.timestamp && (
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(step.timestamp), { addSuffix: true })}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function RequestStatusTimeline({ 
  createdAt, 
  acceptedAt, 
  completedAt,
  compact = false 
}: { 
  createdAt: Date | string;
  acceptedAt?: Date | string | null;
  completedAt?: Date | string | null;
  compact?: boolean;
}) {
  const steps: TimelineStep[] = [
    {
      label: "Request submitted",
      timestamp: createdAt,
      status: "completed",
    },
    {
      label: acceptedAt ? "Accepted by assistant" : "Under review",
      description: acceptedAt ? undefined : "Your assistant will review this soon",
      timestamp: acceptedAt || undefined,
      status: acceptedAt ? "completed" : "current",
    },
    {
      label: "Task completed",
      timestamp: completedAt || undefined,
      status: completedAt ? "completed" : "upcoming",
    },
  ];

  return <StatusTimeline steps={steps} compact={compact} />;
}

export function TaskStatusTimeline({
  status,
  createdAt,
  startedAt,
  completedAt,
  compact = false,
}: {
  status: string;
  createdAt: Date | string;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  compact?: boolean;
}) {
  const getSteps = (): TimelineStep[] => {
    const steps: TimelineStep[] = [
      {
        label: "Task created",
        timestamp: createdAt,
        status: "completed",
      },
    ];

    if (status === "PLANNED") {
      steps.push({
        label: "Scheduled to start",
        status: "current",
      });
      steps.push({
        label: "Completed",
        status: "upcoming",
      });
    } else if (status === "IN_PROGRESS") {
      steps.push({
        label: "In progress",
        timestamp: startedAt || undefined,
        status: "current",
      });
      steps.push({
        label: "Completed",
        status: "upcoming",
      });
    } else if (status === "WAITING_ON_CLIENT") {
      steps.push({
        label: "Started",
        timestamp: startedAt || undefined,
        status: "completed",
      });
      steps.push({
        label: "Waiting on you",
        description: "Your input is needed",
        status: "current",
      });
      steps.push({
        label: "Completed",
        status: "upcoming",
      });
    } else if (status === "DONE") {
      steps.push({
        label: "Started",
        timestamp: startedAt || undefined,
        status: "completed",
      });
      steps.push({
        label: "Completed",
        timestamp: completedAt || undefined,
        status: "completed",
      });
    }

    return steps;
  };

  return <StatusTimeline steps={getSteps()} compact={compact} />;
}
