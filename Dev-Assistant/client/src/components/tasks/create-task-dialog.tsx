import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateTimePicker } from "@/components/date-time-picker";
import type { InsertTask } from "@shared/schema";
import { STATUSES, CATEGORIES } from "./task-constants";

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newTask: Partial<InsertTask>;
  onTaskChange: (task: Partial<InsertTask>) => void;
  onSubmit: () => void;
  isPending: boolean;
}

export function CreateTaskDialog({
  open,
  onOpenChange,
  newTask,
  onTaskChange,
  onSubmit,
  isPending,
}: CreateTaskDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            placeholder="Task title"
            value={newTask.title || ""}
            onChange={(e) => onTaskChange({ ...newTask, title: e.target.value })}
            data-testid="input-task-title"
          />

          <Textarea
            placeholder="Description (optional)"
            value={newTask.description || ""}
            onChange={(e) => onTaskChange({ ...newTask, description: e.target.value })}
            rows={2}
            data-testid="input-task-description"
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Category</label>
              <Select
                value={newTask.category || "OTHER"}
                onValueChange={(value) => onTaskChange({ ...newTask, category: value as InsertTask["category"] })}
              >
                <SelectTrigger data-testid="select-task-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Status</label>
              <Select
                value={newTask.status || "PLANNED"}
                onValueChange={(value) => onTaskChange({ ...newTask, status: value as InsertTask["status"] })}
              >
                <SelectTrigger data-testid="select-task-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Urgency</label>
            <div className="flex gap-2">
              {["LOW", "MEDIUM", "HIGH"].map((level) => (
                <Button
                  key={level}
                  variant={newTask.urgency === level ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => onTaskChange({ ...newTask, urgency: level as InsertTask["urgency"] })}
                  data-testid={`button-urgency-${level.toLowerCase()}`}
                >
                  {level}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Due Date</label>
            <DateTimePicker
              value={newTask.dueAt ? new Date(newTask.dueAt as string | number | Date) : null}
              onChange={(date) => onTaskChange({
                ...newTask,
                dueAt: date || undefined
              })}
              placeholder="Tap to select date & time"
              data-testid="input-task-due"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Location</label>
            <Input
              placeholder="Optional location"
              value={newTask.location || ""}
              onChange={(e) => onTaskChange({ ...newTask, location: e.target.value })}
              data-testid="input-task-location"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Repeat</label>
            <Select
              value={(newTask as Record<string, unknown>).recurrence as string || "none"}
              onValueChange={(value) => onTaskChange({ ...newTask, recurrence: value } as Partial<InsertTask>)}
            >
              <SelectTrigger data-testid="select-task-recurrence">
                <SelectValue placeholder="Does not repeat" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Does not repeat</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="biweekly">Every 2 weeks</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="custom">Custom...</SelectItem>
              </SelectContent>
            </Select>
            {(newTask as Record<string, unknown>).recurrence === "custom" && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-sm text-muted-foreground">Every</span>
                <Input
                  type="number"
                  min="1"
                  className="w-20"
                  value={(newTask as Record<string, unknown>).recurrenceCustomDays as string || ""}
                  onChange={(e) => onTaskChange({ ...newTask, recurrenceCustomDays: parseInt(e.target.value) || undefined } as Partial<InsertTask>)}
                  placeholder="7"
                  data-testid="input-recurrence-custom-days"
                />
                <span className="text-sm text-muted-foreground">days</span>
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Estimated Time</label>
            <div className="flex flex-wrap gap-2">
              {[15, 30, 60, 120].map((minutes) => (
                <Button
                  key={minutes}
                  type="button"
                  size="sm"
                  variant={newTask.estimatedMinutes === minutes ? "default" : "outline"}
                  onClick={() => onTaskChange({ ...newTask, estimatedMinutes: newTask.estimatedMinutes === minutes ? undefined : minutes })}
                  data-testid={`button-estimate-${minutes}`}
                >
                  {minutes < 60 ? `${minutes}m` : `${minutes / 60}h`}
                </Button>
              ))}
              <Input
                type="number"
                placeholder="Custom"
                className="w-20"
                value={newTask.estimatedMinutes && ![15, 30, 60, 120].includes(newTask.estimatedMinutes) ? newTask.estimatedMinutes : ""}
                onChange={(e) => onTaskChange({ ...newTask, estimatedMinutes: parseInt(e.target.value) || undefined })}
                data-testid="input-estimate-custom"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={onSubmit}
            disabled={!newTask.title || isPending}
            className="w-full"
            data-testid="button-submit-task"
          >
            Create Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
