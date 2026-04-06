import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, XCircle } from "lucide-react";
import type { TaskWithChecklist } from "./task-constants";

interface CancelTaskDialogProps {
  open: boolean;
  task: TaskWithChecklist | null;
  reason: string;
  onReasonChange: (reason: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}

export function CancelTaskDialog({
  open,
  task,
  reason,
  onReasonChange,
  onClose,
  onConfirm,
  isPending,
}: CancelTaskDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {task && (
            <p className="text-sm text-muted-foreground">
              Are you sure you want to cancel "{task.title}"?
              All household assistants will be notified.
            </p>
          )}
          <div>
            <Label className="text-sm mb-1 block">Reason (optional)</Label>
            <Textarea
              placeholder="Why is this task being cancelled?"
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              rows={3}
              data-testid="input-cancel-reason"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            data-testid="button-cancel-dialog-dismiss"
          >
            Keep Task
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
            data-testid="button-confirm-cancel"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <XCircle className="h-4 w-4 mr-1" />
            )}
            Cancel Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
