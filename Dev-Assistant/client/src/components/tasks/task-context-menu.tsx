import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  Play,
  Calendar,
  ChevronRight,
  Edit,
  Trash,
  XCircle,
} from "lucide-react";
import { IconComplete } from "@/components/icons/hndld-icons";
import { addDays, nextMonday, setHours } from "date-fns";
import type { TaskWithChecklist } from "./task-constants";

interface TaskContextMenuProps {
  task: TaskWithChecklist;
  children: React.ReactNode;
  onComplete: (id: string) => void;
  onStart: (id: string) => void;
  onReschedule: (id: string, date: Date) => void;
  onEdit: (task: TaskWithChecklist) => void;
  onCancel: (task: TaskWithChecklist) => void;
  onDelete: () => void;
}

export function TaskContextMenu({
  task,
  children,
  onComplete,
  onStart,
  onReschedule,
  onEdit,
  onCancel,
  onDelete,
}: TaskContextMenuProps) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        {children}
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content className="min-w-[200px] bg-card rounded-xl p-2 shadow-xl border z-50">
          <ContextMenu.Item
            className="px-3 py-2 hover:bg-accent rounded-lg flex items-center gap-2 cursor-pointer"
            onSelect={() => onComplete(task.id)}
            data-testid={`context-done-${task.id}`}
          >
            <IconComplete size={16} aria-hidden="true" />
            Mark as Done
          </ContextMenu.Item>

          <ContextMenu.Item
            className="px-3 py-2 hover:bg-accent rounded-lg flex items-center gap-2 cursor-pointer"
            onSelect={() => onStart(task.id)}
            data-testid={`context-start-${task.id}`}
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            Start Now
          </ContextMenu.Item>

          <ContextMenu.Separator className="h-px bg-border my-1" />

          <ContextMenu.Sub>
            <ContextMenu.SubTrigger className="px-3 py-2 hover:bg-accent rounded-lg flex items-center gap-2 cursor-pointer">
              <Calendar className="h-4 w-4" aria-hidden="true" />
              Reschedule
              <ChevronRight className="h-4 w-4 ml-auto" aria-hidden="true" />
            </ContextMenu.SubTrigger>

            <ContextMenu.SubContent className="min-w-[160px] bg-card rounded-xl p-2 shadow-xl border z-50">
              <ContextMenu.Item
                className="px-3 py-2 hover:bg-accent rounded-lg cursor-pointer"
                onSelect={() => onReschedule(task.id, setHours(new Date(), 17))}
                data-testid={`context-today-${task.id}`}
              >
                Today 5pm
              </ContextMenu.Item>
              <ContextMenu.Item
                className="px-3 py-2 hover:bg-accent rounded-lg cursor-pointer"
                onSelect={() => onReschedule(task.id, setHours(addDays(new Date(), 1), 9))}
                data-testid={`context-tomorrow-${task.id}`}
              >
                Tomorrow 9am
              </ContextMenu.Item>
              <ContextMenu.Item
                className="px-3 py-2 hover:bg-accent rounded-lg cursor-pointer"
                onSelect={() => onReschedule(task.id, setHours(nextMonday(new Date()), 9))}
                data-testid={`context-monday-${task.id}`}
              >
                Next Monday
              </ContextMenu.Item>
              <ContextMenu.Item
                className="px-3 py-2 hover:bg-accent rounded-lg cursor-pointer"
                onSelect={() => onEdit(task)}
                data-testid={`context-custom-${task.id}`}
              >
                Custom...
              </ContextMenu.Item>
            </ContextMenu.SubContent>
          </ContextMenu.Sub>

          <ContextMenu.Separator className="h-px bg-border my-1" />

          <ContextMenu.Item
            className="px-3 py-2 hover:bg-accent rounded-lg flex items-center gap-2 cursor-pointer"
            onSelect={() => onEdit(task)}
            data-testid={`context-edit-${task.id}`}
          >
            <Edit className="h-4 w-4" aria-hidden="true" />
            Full Edit
          </ContextMenu.Item>

          <ContextMenu.Item
            className="px-3 py-2 hover:bg-accent rounded-lg flex items-center gap-2 cursor-pointer"
            onSelect={() => onCancel(task)}
            data-testid={`context-cancel-${task.id}`}
          >
            <XCircle className="h-4 w-4" aria-hidden="true" />
            Cancel Task
          </ContextMenu.Item>

          <ContextMenu.Item
            className="px-3 py-2 hover:bg-destructive/10 text-destructive rounded-lg flex items-center gap-2 cursor-pointer"
            onSelect={onDelete}
            data-testid={`context-delete-${task.id}`}
          >
            <Trash className="h-4 w-4" aria-hidden="true" />
            Delete
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
