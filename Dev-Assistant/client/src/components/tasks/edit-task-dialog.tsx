import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Plus, X, Loader2 } from "lucide-react";
import { DateTimePicker } from "@/components/date-time-picker";
import { PhotoCapture } from "@/components/photo-capture";
import { addDays, addWeeks, nextMonday, setHours } from "date-fns";
import { cn } from "@/lib/utils";
import type { InsertTask } from "@shared/schema";
import { STATUSES, CATEGORIES } from "./task-constants";
import type { TaskWithChecklist } from "./task-constants";

interface EditTaskDialogProps {
  task: TaskWithChecklist | null;
  onClose: () => void;
  onTaskChange: (task: TaskWithChecklist) => void;
  onUpdateField: (id: string, data: Partial<InsertTask>) => void;
  onCreateChecklistItem: (taskId: string, text: string) => void;
  onUpdateChecklistItem: (id: string, done: boolean) => void;
  onPhotoUpload: (file: File) => void;
  onRemovePhoto: (index: number) => void;
  isUploadingPhoto: boolean;
}

export function EditTaskDialog({
  task,
  onClose,
  onTaskChange,
  onUpdateField,
  onCreateChecklistItem,
  onUpdateChecklistItem,
  onPhotoUpload,
  onRemovePhoto,
  isUploadingPhoto,
}: EditTaskDialogProps) {
  const [newChecklistItem, setNewChecklistItem] = useState("");

  if (!task) return null;

  const addChecklistItem = () => {
    if (newChecklistItem.trim()) {
      onCreateChecklistItem(task.id, newChecklistItem);
      setNewChecklistItem("");
    }
  };

  return (
    <Dialog open={!!task} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Title</label>
            <Input
              value={task.title}
              onChange={(e) => onTaskChange({ ...task, title: e.target.value })}
              onBlur={() => onUpdateField(task.id, { title: task.title })}
              data-testid="input-edit-task-title"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Description</label>
            <Textarea
              value={task.description || ""}
              onChange={(e) => onTaskChange({ ...task, description: e.target.value })}
              onBlur={() => onUpdateField(task.id, { description: task.description })}
              rows={3}
              data-testid="input-edit-task-description"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Due Date</label>
            <DateTimePicker
              value={task.dueAt ? new Date(task.dueAt) : null}
              onChange={(date) => {
                onTaskChange({ ...task, dueAt: date });
                onUpdateField(task.id, { dueAt: date });
              }}
              placeholder="Tap to select date & time"
              data-testid="input-edit-task-due"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Quick Reschedule</label>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Today 5pm", value: setHours(new Date(), 17) },
                { label: "Tomorrow 9am", value: setHours(addDays(new Date(), 1), 9) },
                { label: "Next Monday", value: nextMonday(new Date()) },
                { label: "Next Week", value: addWeeks(new Date(), 1) },
              ].map((preset) => (
                <Button
                  key={preset.label}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onTaskChange({ ...task, dueAt: preset.value });
                    onUpdateField(task.id, { dueAt: preset.value });
                  }}
                  data-testid={`button-reschedule-${preset.label.toLowerCase().replace(/\s/g, '-')}`}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Location</label>
            <Input
              value={task.location || ""}
              onChange={(e) => onTaskChange({ ...task, location: e.target.value })}
              onBlur={() => onUpdateField(task.id, { location: task.location })}
              placeholder="Add location"
              data-testid="input-edit-task-location"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Checklist</label>
            {task.checklistItems && task.checklistItems.length > 0 && (
              <div className="space-y-2 mb-3">
                {task.checklistItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <Checkbox
                      checked={item.done}
                      onCheckedChange={(checked) => {
                        onUpdateChecklistItem(item.id, !!checked);
                        onTaskChange({
                          ...task,
                          checklistItems: task.checklistItems?.map(i =>
                            i.id === item.id ? { ...i, done: !!checked } : i
                          ),
                        });
                      }}
                      data-testid={`checkbox-${item.id}`}
                    />
                    <span className={cn(
                      "text-sm flex-1",
                      item.done && "line-through text-muted-foreground"
                    )}>
                      {item.text}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Input
                placeholder="Add item..."
                value={newChecklistItem}
                onChange={(e) => setNewChecklistItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addChecklistItem();
                }}
                data-testid="input-new-checklist-item"
              />
              <Button
                size="icon"
                variant="outline"
                onClick={addChecklistItem}
                aria-label="Add checklist item"
                data-testid="button-add-checklist-item"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Category</label>
              <Select
                value={task.category}
                onValueChange={(value) => {
                  onTaskChange({ ...task, category: value as TaskWithChecklist["category"] });
                  onUpdateField(task.id, { category: value as InsertTask["category"] });
                }}
              >
                <SelectTrigger data-testid="select-edit-task-category">
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
              <label className="text-sm font-medium mb-1 block">Urgency</label>
              <Select
                value={task.urgency}
                onValueChange={(value) => {
                  onTaskChange({ ...task, urgency: value as TaskWithChecklist["urgency"] });
                  onUpdateField(task.id, { urgency: value as InsertTask["urgency"] });
                }}
              >
                <SelectTrigger data-testid="select-edit-task-urgency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Status</label>
            <Select
              value={task.status}
              onValueChange={(value) => {
                onTaskChange({ ...task, status: value as TaskWithChecklist["status"] });
                onUpdateField(task.id, { status: value as InsertTask["status"] });
              }}
            >
              <SelectTrigger data-testid="select-edit-task-status">
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

          <div>
            <label className="text-sm font-medium mb-2 block">Notes</label>
            <Textarea
              placeholder="Add notes visible only to you..."
              value={task.notes || ""}
              onChange={(e) => onTaskChange({ ...task, notes: e.target.value })}
              onBlur={() => onUpdateField(task.id, { notes: task.notes })}
              rows={3}
              data-testid="input-task-notes"
            />
            <p className="text-xs text-muted-foreground mt-1">
              These notes are private and not shared with the client
            </p>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Estimated Time</label>
            <div className="flex flex-wrap gap-2">
              {[15, 30, 60, 120].map((minutes) => (
                <Button
                  key={minutes}
                  type="button"
                  size="sm"
                  variant={task.estimatedMinutes === minutes ? "default" : "outline"}
                  onClick={() => {
                    const newEstimate = task.estimatedMinutes === minutes ? null : minutes;
                    onTaskChange({ ...task, estimatedMinutes: newEstimate });
                    onUpdateField(task.id, { estimatedMinutes: newEstimate });
                  }}
                  data-testid={`button-edit-estimate-${minutes}`}
                >
                  {minutes < 60 ? `${minutes}m` : `${minutes / 60}h`}
                </Button>
              ))}
              <Input
                type="number"
                placeholder="Custom"
                className="w-20"
                value={task.estimatedMinutes && ![15, 30, 60, 120].includes(task.estimatedMinutes) ? task.estimatedMinutes : ""}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || null;
                  onTaskChange({ ...task, estimatedMinutes: val });
                }}
                onBlur={() => onUpdateField(task.id, { estimatedMinutes: task.estimatedMinutes })}
                data-testid="input-edit-estimate-custom"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Photos</label>
            {((task.images as string[])?.length || 0) > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-3">
                {(task.images as string[]).map((img, index) => (
                  <div key={index} className="relative aspect-square">
                    <img
                      src={img}
                      alt={`Task photo ${index + 1}`}
                      className="w-full h-full object-cover rounded-md"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      className="absolute top-1 right-1 p-1"
                      onClick={() => onRemovePhoto(index)}
                      aria-label={`Remove task photo ${index + 1}`}
                      data-testid={`button-remove-task-image-${index}`}
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <PhotoCapture
                onPhotoCapture={onPhotoUpload}
                disabled={isUploadingPhoto}
                buttonVariant="outline"
                buttonSize="sm"
                showLabel
              />
              {isUploadingPhoto && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading...
                </div>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={onClose}
            className="w-full"
            data-testid="button-close-task-dialog"
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
