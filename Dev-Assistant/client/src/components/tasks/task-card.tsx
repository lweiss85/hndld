import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MapPin,
  Tag,
  Circle,
  Play,
  Bell,
  StickyNote,
  Repeat,
} from "lucide-react";
import { IconComplete, IconClock, IconAlert } from "@/components/icons/hndld-icons";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { TaskWithChecklist } from "./task-constants";
import { STATUS_COLORS } from "./task-constants";

interface TaskCardProps {
  task: TaskWithChecklist;
  onSelect: (task: TaskWithChecklist) => void;
  onToggleDone: (id: string, done: boolean) => void;
  onStartTask: (id: string) => void;
  onCompleteTask: (id: string) => void;
  onNudge: () => void;
}

export function TaskCard({ task, onSelect, onToggleDone, onStartTask, onCompleteTask, onNudge }: TaskCardProps) {
  return (
    <Card
      className="hover-elevate cursor-pointer rounded-2xl"
      onClick={() => onSelect(task)}
      data-testid={`card-task-${task.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div
            className="mt-0.5"
            onClick={(e) => {
              e.stopPropagation();
              onToggleDone(task.id, task.status !== "DONE");
            }}
          >
            {task.status === "DONE" ? (
              <IconComplete size={20} className="text-success" aria-hidden="true" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className={cn(
                "font-medium",
                task.status === "DONE" && "line-through text-muted-foreground"
              )}>
                {task.title}
              </h3>
              <Badge
                className={cn("shrink-0 text-xs", STATUS_COLORS[task.status])}
              >
                {task.status.replace("_", " ")}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <Badge variant="outline" className="text-xs">
                <Tag className="h-3 w-3 mr-1" aria-hidden="true" />
                {task.category}
              </Badge>
              {task.dueAt && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <IconClock size={12} aria-hidden="true" />
                  {format(new Date(task.dueAt), "MMM d, h:mm a")}
                </span>
              )}
              {task.location && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" aria-hidden="true" />
                  {task.location}
                </span>
              )}
              {task.estimatedMinutes && (
                <Badge variant="secondary" className="text-xs">
                  <IconClock size={12} className="mr-1" aria-hidden="true" />
                  {task.estimatedMinutes < 60 ? `${task.estimatedMinutes}m` : `${task.estimatedMinutes / 60}h`}
                </Badge>
              )}
              {task.recurrence && task.recurrence !== "none" && (
                <Badge variant="outline" className="text-xs">
                  <Repeat className="h-3 w-3 mr-1" aria-hidden="true" />
                  {task.recurrence === "custom" ? `Every ${task.recurrenceCustomDays}d` : task.recurrence}
                </Badge>
              )}
            </div>
            {task.checklistItems && task.checklistItems.length > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{
                      width: `${(task.checklistItems.filter(i => i.done).length / task.checklistItems.length) * 100}%`
                    }}
                  />
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {task.checklistItems.filter(i => i.done).length}/{task.checklistItems.length}
                </span>
              </div>
            )}
            {task.notes && (
              <div className="mt-2 text-xs text-muted-foreground flex items-start gap-1.5 bg-muted/50 rounded-md p-2">
                <StickyNote className="h-3 w-3 mt-0.5 shrink-0" aria-hidden="true" />
                <span className="line-clamp-2">{task.notes}</span>
              </div>
            )}
            {task.status !== "DONE" && (
              <div className="mt-3 pt-2 border-t flex gap-2" onClick={(e) => e.stopPropagation()}>
                {task.status === "PLANNED" && (
                  <Button
                    size="sm"
                    className="bg-amber-500 hover:bg-amber-600 text-white border-amber-500"
                    onClick={() => onStartTask(task.id)}
                    data-testid={`button-start-${task.id}`}
                  >
                    <Play className="h-4 w-4 mr-1" aria-hidden="true" />
                    Start Now
                  </Button>
                )}

                {task.status === "WAITING_ON_CLIENT" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onNudge}
                    data-testid={`button-nudge-${task.id}`}
                  >
                    <Bell className="h-4 w-4 mr-1" aria-hidden="true" />
                    Send Reminder
                  </Button>
                )}

                {task.status === "IN_PROGRESS" && (
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
                    onClick={() => onCompleteTask(task.id)}
                    data-testid={`button-complete-${task.id}`}
                  >
                    <IconComplete size={16} className="mr-1" aria-hidden="true" />
                    Complete
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
