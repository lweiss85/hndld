import { useState, useRef } from "react";
import { HandledIllustration } from "@/components/illustrations";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Calendar,
  Edit,
  Trash,
  Flame,
  HelpCircle,
  FileText,
  Settings,
} from "lucide-react";
import { IconAlert } from "@/components/icons/hndld-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { isToday, isBefore, startOfDay } from "date-fns";
import type { InsertTask, TaskTemplate } from "@shared/schema";
import { Label } from "@/components/ui/label";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { SwipeRow } from "@/components/premium/swipe-row";
import { showUndoToast } from "@/components/premium/toast-undo";
import { PageTransition, StaggeredList, triggerHaptic } from "@/components/juice";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { PullToRefreshIndicator } from "@/components/pull-to-refresh";
import { useActiveServiceType } from "@/hooks/use-active-service-type";
import { withServiceType } from "@/lib/serviceUrl";
import {
  TaskCard,
  TaskContextMenu,
  CreateTaskDialog,
  EditTaskDialog,
  CancelTaskDialog,
  STATUSES,
  CATEGORIES,
  DEFAULT_TEMPLATES,
  TEMPLATE_ICONS,
  type TaskWithChecklist,
} from "@/components/tasks";
import { versionedUrl } from "@/lib/queryClient";

function TasksSkeleton() {
  return (
    <div className="px-4 py-6 space-y-4 max-w-4xl mx-auto" aria-busy="true">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-10 w-full" />
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-24" />
      ))}
    </div>
  );
}

export default function Tasks() {
  const { toast } = useToast();
  const { activeServiceType } = useActiveServiceType();
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskWithChecklist | null>(null);
  const [isUploadingTaskPhoto, setIsUploadingTaskPhoto] = useState(false);

  // Quick filters
  const [urgencyFilter, setUrgencyFilter] = useState<string | null>(null);
  const [dueTodayFilter, setDueTodayFilter] = useState(false);
  const [overdueFilter, setOverdueFilter] = useState(false);
  const [noDateFilter, setNoDateFilter] = useState(false);
  const [newTask, setNewTask] = useState<Partial<InsertTask>>({
    title: "",
    description: "",
    category: "OTHER",
    urgency: "MEDIUM",
    status: "PLANNED",
    estimatedMinutes: undefined,
  });
  const [newTemplate, setNewTemplate] = useState<{
    name: string;
    title: string;
    category: "HOUSEHOLD" | "ERRANDS" | "MAINTENANCE" | "GROCERIES" | "KIDS" | "PETS" | "EVENTS" | "OTHER";
    urgency: "LOW" | "MEDIUM" | "HIGH";
    location: string;
    icon: string;
  }>({
    name: "",
    title: "",
    category: "OTHER",
    urgency: "MEDIUM",
    location: "",
    icon: "file-text",
  });

  // Cancel dialog state
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [taskToCancel, setTaskToCancel] = useState<TaskWithChecklist | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const tasksUrl = withServiceType("/api/tasks", activeServiceType);
  const { data: tasks, isLoading } = useQuery<TaskWithChecklist[]>({
    queryKey: [tasksUrl],
  });

  const { data: templates = [] } = useQuery<TaskTemplate[]>({
    queryKey: ["/api/task-templates"],
  });

  // --- Mutations ---

  const createTemplateMutation = useMutation({
    mutationFn: async (data: Partial<TaskTemplate>) => {
      return apiRequest("POST", "/api/task-templates", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-templates"] });
      setShowTemplateDialog(false);
      setNewTemplate({ name: "", title: "", category: "OTHER", urgency: "MEDIUM", location: "", icon: "file-text" });
      toast({ title: "Template created" });
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<TaskTemplate>) => {
      return apiRequest("PATCH", `/api/task-templates/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-templates"] });
      setEditingTemplate(null);
      toast({ title: "Template updated" });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/task-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-templates"] });
      toast({ title: "Template deleted" });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (data: Partial<InsertTask>) => {
      return apiRequest("POST", "/api/tasks", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/today"] });
      setShowCreateDialog(false);
      setNewTask({
        title: "",
        description: "",
        category: "OTHER",
        urgency: "MEDIUM",
        status: "PLANNED",
        estimatedMinutes: undefined,
      });
      toast({ title: "Task created", description: "Your task has been added" });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<InsertTask>) => {
      return apiRequest("PATCH", `/api/tasks/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
  });

  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      return apiRequest("POST", `/api/tasks/${taskId}/complete`, {});
    },
    onSuccess: (data: Response) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Task completed" });
      triggerHaptic("medium");
    },
  });

  const toggleTaskDoneMutation = useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      return apiRequest("PATCH", `/api/tasks/${id}`, {
        status: done ? "DONE" : "IN_PROGRESS",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
  });

  const createChecklistItemMutation = useMutation({
    mutationFn: async ({ taskId, text }: { taskId: string; text: string }) => {
      return apiRequest("POST", `/api/tasks/${taskId}/checklist`, { text });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      if (selectedTask) {
        const updatedTasks = tasks?.find(t => t.id === selectedTask.id);
        if (updatedTasks) setSelectedTask(updatedTasks);
      }
    },
  });

  const updateChecklistItemMutation = useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      return apiRequest("PATCH", `/api/checklist/${id}`, { done });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  const cancelTaskMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      return apiRequest("POST", `/api/tasks/${id}/cancel`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Task cancelled" });
      setShowCancelDialog(false);
      setTaskToCancel(null);
      setCancelReason("");
      triggerHaptic("light");
    },
  });

  // --- Photo handlers ---

  const handleTaskPhotoUpload = async (file: File) => {
    if (!selectedTask) return;
    setIsUploadingTaskPhoto(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", "OTHER");
      formData.append("linkTo", JSON.stringify({ entityType: "TASK", entityId: selectedTask.id }));

      const response = await fetch(versionedUrl("/api/files/upload"), {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) throw new Error("Upload failed");

      const uploadedFile = await response.json();
      const imageUrl = uploadedFile.publicUrl || uploadedFile.storagePath;
      const currentImages = (selectedTask.images as string[]) || [];
      const newImages = [...currentImages, imageUrl];

      setSelectedTask({ ...selectedTask, images: newImages });
      await updateTaskMutation.mutateAsync({ id: selectedTask.id, images: newImages });
      triggerHaptic("light");
      toast({ title: "Photo added" });
    } catch {
      toast({ title: "Upload failed", description: "Please try again", variant: "destructive" });
    } finally {
      setIsUploadingTaskPhoto(false);
    }
  };

  const removeTaskImage = async (index: number) => {
    if (!selectedTask) return;
    const currentImages = (selectedTask.images as string[]) || [];
    const newImages = currentImages.filter((_, i) => i !== index);
    setSelectedTask({ ...selectedTask, images: newImages });
    await updateTaskMutation.mutateAsync({ id: selectedTask.id, images: newImages });
    toast({ title: "Photo removed" });
  };

  // --- Swipe handlers ---

  const previousStatusRef = useRef<{ id: string; status: string } | null>(null);

  const handleSwipeComplete = (task: TaskWithChecklist) => {
    previousStatusRef.current = { id: task.id, status: task.status };
    completeTaskMutation.mutate(task.id);

    if (!task.recurrence || task.recurrence === "none") {
      showUndoToast("Task marked as done", () => {
        if (previousStatusRef.current) {
          updateTaskMutation.mutate({
            id: previousStatusRef.current.id,
            status: previousStatusRef.current.status as InsertTask["status"],
          });
        }
      });
    }
  };

  const handleSwipeWaiting = (task: TaskWithChecklist) => {
    previousStatusRef.current = { id: task.id, status: task.status };
    updateTaskMutation.mutate({ id: task.id, status: "WAITING_ON_CLIENT" });

    showUndoToast("Task moved to waiting", () => {
      if (previousStatusRef.current) {
        updateTaskMutation.mutate({
          id: previousStatusRef.current.id,
          status: previousStatusRef.current.status as InsertTask["status"],
        });
      }
    });
  };

  const { isRefreshing, pullDistance, threshold, progress } = usePullToRefresh({
    onRefresh: async () => {
      triggerHaptic("medium");
      await queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  // --- Filtering & sorting ---

  if (isLoading) return <TasksSkeleton />;

  const priorityOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

  const filteredTasks = tasks
    ?.filter(t => selectedStatus === "all" || t.status === selectedStatus)
    ?.filter(t => !urgencyFilter || t.urgency === urgencyFilter)
    ?.filter(t => !dueTodayFilter || (t.dueAt && isToday(new Date(t.dueAt))))
    ?.filter(t => !overdueFilter || (t.dueAt && isBefore(new Date(t.dueAt), startOfDay(new Date())) && t.status !== "DONE"))
    ?.filter(t => !noDateFilter || !t.dueAt)
    ?.sort((a, b) => {
      const priorityDiff = priorityOrder[a.urgency] - priorityOrder[b.urgency];
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime();
    });

  return (
    <PageTransition className="relative">
      <PullToRefreshIndicator
        pullDistance={pullDistance}
        threshold={threshold}
        isRefreshing={isRefreshing}
        progress={progress}
      />
    <div className="px-4 py-6 space-y-4 max-w-4xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4 animate-fade-in-up">
        <h1 className="font-display text-3xl font-light tracking-tight" data-testid="text-page-title">Tasks</h1>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" data-testid="button-templates">
                <FileText className="h-4 w-4 mr-1" aria-hidden="true" />
                Templates
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {templates.length > 0 ? (
                templates.map((template) => {
                  const IconComponent = TEMPLATE_ICONS[template.icon || "file-text"] || FileText;
                  return (
                    <DropdownMenuItem
                      key={template.id}
                      onClick={() => {
                        createTaskMutation.mutate({
                          title: template.title,
                          category: template.category as InsertTask["category"],
                          urgency: template.urgency as InsertTask["urgency"],
                          status: "PLANNED",
                          location: template.location || undefined,
                        });
                        toast({ title: "Task created from template" });
                      }}
                      data-testid={`template-${template.id}`}
                    >
                      <IconComponent className="h-4 w-4 mr-2" aria-hidden="true" />
                      {template.name}
                    </DropdownMenuItem>
                  );
                })
              ) : (
                DEFAULT_TEMPLATES.map((template) => {
                  const IconComponent = TEMPLATE_ICONS[template.icon] || FileText;
                  return (
                    <DropdownMenuItem
                      key={template.id}
                      onClick={() => {
                        createTaskMutation.mutate({
                          title: template.title,
                          category: template.category as InsertTask["category"],
                          urgency: template.urgency as InsertTask["urgency"],
                          status: "PLANNED",
                        });
                        toast({ title: "Task created from template" });
                      }}
                      data-testid={`template-${template.id}`}
                    >
                      <IconComponent className="h-4 w-4 mr-2" aria-hidden="true" />
                      {template.name}
                    </DropdownMenuItem>
                  );
                })
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowTemplateDialog(true)}
                data-testid="template-manage"
              >
                <Settings className="h-4 w-4 mr-2" aria-hidden="true" />
                Manage Templates
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm" onClick={() => setShowCreateDialog(true)} data-testid="button-create-task">
            <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
            New
          </Button>
        </div>
      </div>

      {/* Status tabs */}
      <div className="overflow-x-auto -mx-4 px-4">
        <Tabs value={selectedStatus} onValueChange={setSelectedStatus}>
          <TabsList className="w-max">
            <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
            {STATUSES.map((status) => (
              <TabsTrigger
                key={status.value}
                value={status.value}
                data-testid={`tab-${status.value.toLowerCase()}`}
              >
                {status.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Quick filters */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        <Button size="sm" variant={urgencyFilter === "HIGH" ? "default" : "outline"} onClick={() => setUrgencyFilter(urgencyFilter === "HIGH" ? null : "HIGH")} data-testid="filter-high-priority">
          <Flame className="h-4 w-4 mr-1" aria-hidden="true" />
          High Priority
        </Button>
        <Button size="sm" variant={dueTodayFilter ? "default" : "outline"} onClick={() => setDueTodayFilter(!dueTodayFilter)} data-testid="filter-due-today">
          <Calendar className="h-4 w-4 mr-1" aria-hidden="true" />
          Due Today
        </Button>
        <Button size="sm" variant={overdueFilter ? "default" : "outline"} onClick={() => setOverdueFilter(!overdueFilter)} data-testid="filter-overdue">
          <IconAlert size={16} className="mr-1" aria-hidden="true" />
          Overdue
        </Button>
        <Button size="sm" variant={noDateFilter ? "default" : "outline"} onClick={() => setNoDateFilter(!noDateFilter)} data-testid="filter-no-date">
          <HelpCircle className="h-4 w-4 mr-1" aria-hidden="true" />
          No Date Set
        </Button>
      </div>

      {/* Task list */}
      {filteredTasks?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <HandledIllustration size={56} className="mb-5 opacity-40" />
          <h3 className="font-display text-xl font-light tracking-tight text-foreground mb-1.5">Your day is clear</h3>
          <p className="text-sm text-muted-foreground max-w-[300px] leading-relaxed">
            Nothing is pending at the moment.
          </p>
        </div>
      ) : (
        <StaggeredList className="space-y-2" aria-label="Task list">
          {filteredTasks?.map((task) => (
            <TaskContextMenu
              key={task.id}
              task={task}
              onComplete={(id) => completeTaskMutation.mutate(id)}
              onStart={(id) => updateTaskMutation.mutate({ id, status: "IN_PROGRESS" })}
              onReschedule={(id, date) => updateTaskMutation.mutate({ id, dueAt: date })}
              onEdit={setSelectedTask}
              onCancel={(t) => {
                if (t.status === "DONE" || t.status === "CANCELLED") {
                  toast({ title: "Cannot cancel", description: "This task is already completed or cancelled", variant: "destructive" });
                  return;
                }
                setTaskToCancel(t);
                setShowCancelDialog(true);
              }}
              onDelete={() => toast({ title: "Delete coming soon", description: "This feature will be added shortly" })}
            >
              <SwipeRow
                onSwipeRight={task.status !== "DONE" ? () => handleSwipeComplete(task) : undefined}
                onSwipeLeft={task.status !== "WAITING_ON_CLIENT" && task.status !== "DONE" ? () => handleSwipeWaiting(task) : undefined}
                rightLabel="Done"
                leftLabel="Waiting"
              >
                <TaskCard
                  task={task}
                  onSelect={setSelectedTask}
                  onToggleDone={(id, done) => toggleTaskDoneMutation.mutate({ id, done })}
                  onStartTask={(id) => {
                    updateTaskMutation.mutate({ id, status: "IN_PROGRESS" });
                    triggerHaptic("medium");
                    toast({ title: "Task started" });
                  }}
                  onCompleteTask={(id) => completeTaskMutation.mutate(id)}
                  onNudge={() => {
                    toast({ title: "Nudge sent", description: "Client has been reminded about this task" });
                    triggerHaptic("light");
                  }}
                />
              </SwipeRow>
            </TaskContextMenu>
          ))}
        </StaggeredList>
      )}

      {/* Dialogs */}
      <CreateTaskDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        newTask={newTask}
        onTaskChange={setNewTask}
        onSubmit={() => createTaskMutation.mutate(newTask)}
        isPending={createTaskMutation.isPending}
      />

      <EditTaskDialog
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onTaskChange={setSelectedTask}
        onUpdateField={(id, data) => updateTaskMutation.mutate({ id, ...data })}
        onCreateChecklistItem={(taskId, text) => createChecklistItemMutation.mutate({ taskId, text })}
        onUpdateChecklistItem={(id, done) => updateChecklistItemMutation.mutate({ id, done })}
        onPhotoUpload={handleTaskPhotoUpload}
        onRemovePhoto={removeTaskImage}
        isUploadingPhoto={isUploadingTaskPhoto}
      />

      <CancelTaskDialog
        open={showCancelDialog}
        task={taskToCancel}
        reason={cancelReason}
        onReasonChange={setCancelReason}
        onClose={() => {
          setShowCancelDialog(false);
          setTaskToCancel(null);
          setCancelReason("");
        }}
        onConfirm={() => {
          if (taskToCancel) {
            cancelTaskMutation.mutate({ id: taskToCancel.id, reason: cancelReason || undefined });
          }
        }}
        isPending={cancelTaskMutation.isPending}
      />

      {/* Template Management Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage Templates</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {templates.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Your Templates</Label>
                {templates.map((template) => {
                  const IconComponent = TEMPLATE_ICONS[template.icon || "file-text"] || FileText;
                  return (
                    <div key={template.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2">
                        <IconComponent className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        <div>
                          <p className="font-medium text-sm">{template.name}</p>
                          <p className="text-xs text-muted-foreground">{template.title}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" onClick={() => setEditingTemplate(template)} aria-label={`Edit template ${template.name}`} data-testid={`button-edit-template-${template.id}`}>
                          <Edit className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => deleteTemplateMutation.mutate(template.id)} aria-label={`Delete template ${template.name}`} data-testid={`button-delete-template-${template.id}`}>
                          <Trash className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="border-t pt-4 space-y-3">
              <Label className="text-sm font-medium">Create New Template</Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Template Name</Label>
                  <Input placeholder="e.g. Weekly Groceries" value={newTemplate.name} onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })} data-testid="input-template-name" />
                </div>
                <div>
                  <Label className="text-xs">Task Title</Label>
                  <Input placeholder="e.g. Go grocery shopping" value={newTemplate.title} onChange={(e) => setNewTemplate({ ...newTemplate, title: e.target.value })} data-testid="input-template-title" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Category</Label>
                  <Select value={newTemplate.category} onValueChange={(value) => setNewTemplate({ ...newTemplate, category: value as typeof newTemplate.category })}>
                    <SelectTrigger data-testid="select-template-category"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (<SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Urgency</Label>
                  <Select value={newTemplate.urgency} onValueChange={(value) => setNewTemplate({ ...newTemplate, urgency: value as typeof newTemplate.urgency })}>
                    <SelectTrigger data-testid="select-template-urgency"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Location (optional)</Label>
                <Input placeholder="e.g. Whole Foods" value={newTemplate.location} onChange={(e) => setNewTemplate({ ...newTemplate, location: e.target.value })} data-testid="input-template-location" />
              </div>
              <div>
                <Label className="text-xs">Icon</Label>
                <Select value={newTemplate.icon} onValueChange={(value) => setNewTemplate({ ...newTemplate, icon: value })}>
                  <SelectTrigger data-testid="select-template-icon"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="file-text">Document</SelectItem>
                    <SelectItem value="shopping-cart">Shopping Cart</SelectItem>
                    <SelectItem value="school">School</SelectItem>
                    <SelectItem value="wrench">Wrench</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" disabled={!newTemplate.name || !newTemplate.title || createTemplateMutation.isPending} onClick={() => createTemplateMutation.mutate(newTemplate)} data-testid="button-create-template">
                <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
                Create Template
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Template Dialog */}
      <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
          </DialogHeader>
          {editingTemplate && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Template Name</Label>
                  <Input value={editingTemplate.name} onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })} data-testid="input-edit-template-name" />
                </div>
                <div>
                  <Label className="text-xs">Task Title</Label>
                  <Input value={editingTemplate.title} onChange={(e) => setEditingTemplate({ ...editingTemplate, title: e.target.value })} data-testid="input-edit-template-title" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Category</Label>
                  <Select value={editingTemplate.category} onValueChange={(value) => setEditingTemplate({ ...editingTemplate, category: value as TaskTemplate["category"] })}>
                    <SelectTrigger data-testid="select-edit-template-category"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (<SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Urgency</Label>
                  <Select value={editingTemplate.urgency} onValueChange={(value) => setEditingTemplate({ ...editingTemplate, urgency: value as TaskTemplate["urgency"] })}>
                    <SelectTrigger data-testid="select-edit-template-urgency"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Location (optional)</Label>
                  <Input value={editingTemplate.location || ""} onChange={(e) => setEditingTemplate({ ...editingTemplate, location: e.target.value })} data-testid="input-edit-template-location" />
                </div>
                <div>
                  <Label className="text-xs">Icon</Label>
                  <Select value={editingTemplate.icon || "file-text"} onValueChange={(value) => setEditingTemplate({ ...editingTemplate, icon: value })}>
                    <SelectTrigger data-testid="select-edit-template-icon"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="file-text">Document</SelectItem>
                      <SelectItem value="shopping-cart">Shopping Cart</SelectItem>
                      <SelectItem value="school">School</SelectItem>
                      <SelectItem value="wrench">Wrench</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingTemplate(null)}>Cancel</Button>
                <Button
                  onClick={() => updateTemplateMutation.mutate({
                    id: editingTemplate.id,
                    name: editingTemplate.name,
                    title: editingTemplate.title,
                    category: editingTemplate.category,
                    urgency: editingTemplate.urgency,
                    location: editingTemplate.location,
                    icon: editingTemplate.icon,
                  })}
                  disabled={updateTemplateMutation.isPending}
                  data-testid="button-save-template"
                >
                  Save Changes
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
    </PageTransition>
  );
}
