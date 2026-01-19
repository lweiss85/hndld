import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Plus, 
  Clock, 
  MapPin,
  Tag,
  CheckCircle2,
  Circle,
  X,
  Play,
  Calendar,
  CalendarPlus,
  Edit,
  ChevronRight,
  Trash,
  Bell,
  StickyNote,
  FileText,
  ShoppingCart,
  School,
  Wrench,
  Settings,
  Flame,
  AlertTriangle,
  HelpCircle,
  Repeat,
  Camera,
  Loader2,
  XCircle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { format, addDays, addWeeks, nextMonday, setHours, isToday, isBefore, startOfDay } from "date-fns";
import { DateTimePicker } from "@/components/date-time-picker";
import type { Task, InsertTask, TaskChecklistItem, TaskTemplate } from "@shared/schema";
import { Label } from "@/components/ui/label";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { SwipeRow } from "@/components/premium/swipe-row";
import { showUndoToast } from "@/components/premium/toast-undo";
import { PageTransition, StaggeredList, triggerHaptic } from "@/components/juice";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { PullToRefreshIndicator } from "@/components/pull-to-refresh";
import { PhotoCapture } from "@/components/photo-capture";
import { useActiveServiceType } from "@/hooks/use-active-service-type";
import { withServiceType } from "@/lib/serviceUrl";

const STATUSES = [
  { value: "PLANNED", label: "Planned" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "WAITING_ON_CLIENT", label: "Waiting" },
  { value: "DONE", label: "Done" },
  { value: "CANCELLED", label: "Cancelled" },
];

const CATEGORIES = [
  { value: "HOUSEHOLD", label: "Household" },
  { value: "ERRANDS", label: "Errands" },
  { value: "MAINTENANCE", label: "Maintenance" },
  { value: "GROCERIES", label: "Groceries" },
  { value: "KIDS", label: "Kids" },
  { value: "PETS", label: "Pets" },
  { value: "EVENTS", label: "Events" },
  { value: "OTHER", label: "Other" },
];

const STATUS_COLORS: Record<string, string> = {
  PLANNED: "bg-info-muted text-info-muted-foreground",
  IN_PROGRESS: "bg-warning-muted text-warning-muted-foreground",
  WAITING_ON_CLIENT: "bg-warning-muted text-warning-muted-foreground",
  DONE: "bg-success-muted text-success-muted-foreground",
  CANCELLED: "bg-muted text-muted-foreground",
};

interface TaskWithChecklist extends Task {
  checklistItems?: TaskChecklistItem[];
}

function TasksSkeleton() {
  return (
    <div className="px-4 py-6 space-y-4 max-w-4xl mx-auto">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-10 w-full" />
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-24" />
      ))}
    </div>
  );
}

// Built-in default templates for when no custom templates exist
const DEFAULT_TEMPLATES = [
  { id: "default-groceries", name: "Weekly Groceries", title: "Weekly Grocery Shopping", category: "GROCERIES", urgency: "MEDIUM", icon: "shopping-cart" },
  { id: "default-school", name: "School Pickup", title: "School Pickup", category: "KIDS", urgency: "HIGH", icon: "school" },
  { id: "default-maintenance", name: "Home Maintenance", title: "Home Maintenance Check", category: "MAINTENANCE", urgency: "LOW", icon: "wrench" },
];

// Icon mapping for templates
const TEMPLATE_ICONS: Record<string, typeof ShoppingCart> = {
  "shopping-cart": ShoppingCart,
  "school": School,
  "wrench": Wrench,
  "file-text": FileText,
};

export default function Tasks() {
  const { toast } = useToast();
  const { activeServiceType } = useActiveServiceType();
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskWithChecklist | null>(null);
  const [newChecklistItem, setNewChecklistItem] = useState("");
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

  const tasksUrl = withServiceType("/api/tasks", activeServiceType);
  const { data: tasks, isLoading } = useQuery<TaskWithChecklist[]>({
    queryKey: [tasksUrl],
  });

  const { data: templates = [] } = useQuery<TaskTemplate[]>({
    queryKey: ["/api/task-templates"],
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (data: Partial<TaskTemplate>) => {
      return apiRequest("POST", "/api/task-templates", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-templates"] });
      setShowTemplateDialog(false);
      setNewTemplate({ name: "", title: "", category: "OTHER" as const, urgency: "MEDIUM" as const, location: "", icon: "file-text" });
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
      toast({
        title: "Task created",
        description: "Your task has been added",
      });
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

  const handleTaskPhotoUpload = async (file: File) => {
    if (!selectedTask) return;
    setIsUploadingTaskPhoto(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", "OTHER");
      formData.append("linkTo", JSON.stringify({ entityType: "TASK", entityId: selectedTask.id }));
      
      const response = await fetch("/api/files/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Upload failed");
      }
      
      const uploadedFile = await response.json();
      const imageUrl = uploadedFile.publicUrl || uploadedFile.storagePath;
      const currentImages = (selectedTask.images as string[]) || [];
      const newImages = [...currentImages, imageUrl];
      
      setSelectedTask({ ...selectedTask, images: newImages });
      await updateTaskMutation.mutateAsync({ id: selectedTask.id, images: newImages });
      triggerHaptic("light");
      toast({ title: "Photo added" });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "Please try again",
        variant: "destructive",
      });
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

  // Special mutation for completing tasks that handles recurrence
  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      return apiRequest("POST", `/api/tasks/${taskId}/complete`, {});
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      
      if (data.nextTask) {
        toast({ 
          title: "Task completed", 
          description: `Next scheduled for ${data.nextDue}` 
        });
      } else {
        toast({ title: "Task completed" });
      }
      triggerHaptic("medium");
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

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [taskToCancel, setTaskToCancel] = useState<TaskWithChecklist | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const previousStatusRef = useRef<{ id: string; status: string } | null>(null);

  const handleSwipeComplete = (task: TaskWithChecklist) => {
    previousStatusRef.current = { id: task.id, status: task.status };
    
    // Use the recurrence-aware completion endpoint
    completeTaskMutation.mutate(task.id);
    
    // Only show undo for non-recurring tasks
    if (!task.recurrence || task.recurrence === "none") {
      showUndoToast("Task marked as done", () => {
        if (previousStatusRef.current) {
          updateTaskMutation.mutate({ 
            id: previousStatusRef.current.id, 
            status: previousStatusRef.current.status as any 
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
          status: previousStatusRef.current.status as any 
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

  if (isLoading) return <TasksSkeleton />;

  // Priority order: HIGH = 0, MEDIUM = 1, LOW = 2
  const priorityOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  
  const filteredTasks = tasks
    ?.filter(t => selectedStatus === "all" || t.status === selectedStatus)
    ?.filter(t => !urgencyFilter || t.urgency === urgencyFilter)
    ?.filter(t => !dueTodayFilter || (t.dueAt && isToday(new Date(t.dueAt))))
    ?.filter(t => !overdueFilter || (t.dueAt && isBefore(new Date(t.dueAt), startOfDay(new Date())) && t.status !== "DONE"))
    ?.filter(t => !noDateFilter || !t.dueAt)
    ?.sort((a, b) => {
      // Sort by priority first (HIGH > MEDIUM > LOW)
      const priorityDiff = priorityOrder[a.urgency] - priorityOrder[b.urgency];
      if (priorityDiff !== 0) return priorityDiff;
      // Then by createdAt (newest first)
      return new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime();
    });

  const groupedTasks = STATUSES.reduce((acc, status) => {
    acc[status.value] = filteredTasks?.filter(t => t.status === status.value) || [];
    return acc;
  }, {} as Record<string, TaskWithChecklist[]>);

  return (
    <PageTransition className="relative">
      <PullToRefreshIndicator
        pullDistance={pullDistance}
        threshold={threshold}
        isRefreshing={isRefreshing}
        progress={progress}
      />
    <div className="px-4 py-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4 animate-fade-in-up">
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Tasks</h1>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" data-testid="button-templates">
                <FileText className="h-4 w-4 mr-1" />
                Templates
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {/* Show custom templates first if any exist */}
              {templates.length > 0 ? (
                templates.map((template) => {
                  const IconComponent = TEMPLATE_ICONS[template.icon || "file-text"] || FileText;
                  return (
                    <DropdownMenuItem 
                      key={template.id}
                      onClick={() => {
                        createTaskMutation.mutate({
                          title: template.title,
                          category: template.category as any,
                          urgency: template.urgency as any,
                          status: "PLANNED",
                          location: template.location || undefined,
                        });
                        toast({ title: "Task created from template" });
                      }}
                      data-testid={`template-${template.id}`}
                    >
                      <IconComponent className="h-4 w-4 mr-2" />
                      {template.name}
                    </DropdownMenuItem>
                  );
                })
              ) : (
                /* Show default templates if no custom ones */
                DEFAULT_TEMPLATES.map((template) => {
                  const IconComponent = TEMPLATE_ICONS[template.icon] || FileText;
                  return (
                    <DropdownMenuItem 
                      key={template.id}
                      onClick={() => {
                        createTaskMutation.mutate({
                          title: template.title,
                          category: template.category as any,
                          urgency: template.urgency as any,
                          status: "PLANNED",
                        });
                        toast({ title: "Task created from template" });
                      }}
                      data-testid={`template-${template.id}`}
                    >
                      <IconComponent className="h-4 w-4 mr-2" />
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
                <Settings className="h-4 w-4 mr-2" />
                Manage Templates
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Button size="sm" onClick={() => setShowCreateDialog(true)} data-testid="button-create-task">
            <Plus className="h-4 w-4 mr-1" />
            New
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto -mx-4 px-4">
        <Tabs value={selectedStatus} onValueChange={setSelectedStatus}>
          <TabsList className="w-max">
            <TabsTrigger value="all" data-testid="tab-all">
              All
            </TabsTrigger>
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

      {/* Quick Filters */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        <Button
          size="sm"
          variant={urgencyFilter === "HIGH" ? "default" : "outline"}
          onClick={() => setUrgencyFilter(urgencyFilter === "HIGH" ? null : "HIGH")}
          data-testid="filter-high-priority"
        >
          <Flame className="h-4 w-4 mr-1" />
          High Priority
        </Button>
        
        <Button
          size="sm"
          variant={dueTodayFilter ? "default" : "outline"}
          onClick={() => setDueTodayFilter(!dueTodayFilter)}
          data-testid="filter-due-today"
        >
          <Calendar className="h-4 w-4 mr-1" />
          Due Today
        </Button>
        
        <Button
          size="sm"
          variant={overdueFilter ? "default" : "outline"}
          onClick={() => setOverdueFilter(!overdueFilter)}
          data-testid="filter-overdue"
        >
          <AlertTriangle className="h-4 w-4 mr-1" />
          Overdue
        </Button>
        
        <Button
          size="sm"
          variant={noDateFilter ? "default" : "outline"}
          onClick={() => setNoDateFilter(!noDateFilter)}
          data-testid="filter-no-date"
        >
          <HelpCircle className="h-4 w-4 mr-1" />
          No Date Set
        </Button>
      </div>

      {filteredTasks?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <CheckCircle2 className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-medium text-lg mb-1">No tasks</h3>
          <p className="text-sm text-muted-foreground">
            Create a new task to get started
          </p>
        </div>
      ) : (
        <StaggeredList className="space-y-2">
          {filteredTasks?.map((task) => (
            <ContextMenu.Root key={task.id}>
              <ContextMenu.Trigger asChild>
                <SwipeRow
                  onSwipeRight={task.status !== "DONE" ? () => handleSwipeComplete(task) : undefined}
                  onSwipeLeft={task.status !== "WAITING_ON_CLIENT" && task.status !== "DONE" ? () => handleSwipeWaiting(task) : undefined}
                  rightLabel="Done"
                  leftLabel="Waiting"
                >
                  <Card 
                    className="hover-elevate cursor-pointer rounded-2xl"
                    onClick={() => setSelectedTask(task)}
                    data-testid={`card-task-${task.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div 
                          className="mt-0.5"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTaskDoneMutation.mutate({
                              id: task.id,
                              done: task.status !== "DONE",
                            });
                          }}
                        >
                          {task.status === "DONE" ? (
                            <CheckCircle2 className="h-5 w-5 text-success" />
                          ) : (
                            <Circle className="h-5 w-5 text-muted-foreground" />
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
                              <Tag className="h-3 w-3 mr-1" />
                              {task.category}
                            </Badge>
                            {task.dueAt && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {format(new Date(task.dueAt), "MMM d, h:mm a")}
                              </span>
                            )}
                            {task.location && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {task.location}
                              </span>
                            )}
                            {task.estimatedMinutes && (
                              <Badge variant="secondary" className="text-xs">
                                <Clock className="h-3 w-3 mr-1" />
                                {task.estimatedMinutes < 60 ? `${task.estimatedMinutes}m` : `${task.estimatedMinutes / 60}h`}
                              </Badge>
                            )}
                            {task.recurrence && task.recurrence !== "none" && (
                              <Badge variant="outline" className="text-xs">
                                <Repeat className="h-3 w-3 mr-1" />
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
                              <StickyNote className="h-3 w-3 mt-0.5 shrink-0" />
                              <span className="line-clamp-2">{task.notes}</span>
                            </div>
                          )}
                          {task.status !== "DONE" && (
                            <div className="mt-3 pt-2 border-t flex gap-2" onClick={(e) => e.stopPropagation()}>
                              {task.status === "PLANNED" && (
                                <Button
                                  size="sm"
                                  className="bg-amber-500 hover:bg-amber-600 text-white border-amber-500"
                                  onClick={() => {
                                    updateTaskMutation.mutate({
                                      id: task.id,
                                      status: "IN_PROGRESS",
                                    });
                                    triggerHaptic("medium");
                                    toast({ title: "Task started" });
                                  }}
                                  data-testid={`button-start-${task.id}`}
                                >
                                  <Play className="h-4 w-4 mr-1" />
                                  Start Now
                                </Button>
                              )}
                              
                              {task.status === "WAITING_ON_CLIENT" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    toast({ 
                                      title: "Nudge sent", 
                                      description: "Client has been reminded about this task"
                                    });
                                    triggerHaptic("light");
                                  }}
                                  data-testid={`button-nudge-${task.id}`}
                                >
                                  <Bell className="h-4 w-4 mr-1" />
                                  Send Reminder
                                </Button>
                              )}
                              
                              {task.status === "IN_PROGRESS" && (
                                <Button
                                  size="sm"
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
                                  onClick={() => {
                                    completeTaskMutation.mutate(task.id);
                                  }}
                                  data-testid={`button-complete-${task.id}`}
                                >
                                  <CheckCircle2 className="h-4 w-4 mr-1" />
                                  Complete
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </SwipeRow>
              </ContextMenu.Trigger>
              
              <ContextMenu.Portal>
                <ContextMenu.Content className="min-w-[200px] bg-card rounded-xl p-2 shadow-xl border z-50">
                  <ContextMenu.Item 
                    className="px-3 py-2 hover:bg-accent rounded-lg flex items-center gap-2 cursor-pointer"
                    onSelect={() => completeTaskMutation.mutate(task.id)}
                    data-testid={`context-done-${task.id}`}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Mark as Done
                  </ContextMenu.Item>
                  
                  <ContextMenu.Item 
                    className="px-3 py-2 hover:bg-accent rounded-lg flex items-center gap-2 cursor-pointer"
                    onSelect={() => updateTaskMutation.mutate({ id: task.id, status: "IN_PROGRESS" })}
                    data-testid={`context-start-${task.id}`}
                  >
                    <Play className="h-4 w-4" />
                    Start Now
                  </ContextMenu.Item>
                  
                  <ContextMenu.Separator className="h-px bg-border my-1" />
                  
                  <ContextMenu.Sub>
                    <ContextMenu.SubTrigger className="px-3 py-2 hover:bg-accent rounded-lg flex items-center gap-2 cursor-pointer">
                      <Calendar className="h-4 w-4" />
                      Reschedule
                      <ChevronRight className="h-4 w-4 ml-auto" />
                    </ContextMenu.SubTrigger>
                    
                    <ContextMenu.SubContent className="min-w-[160px] bg-card rounded-xl p-2 shadow-xl border z-50">
                      <ContextMenu.Item 
                        className="px-3 py-2 hover:bg-accent rounded-lg cursor-pointer"
                        onSelect={() => updateTaskMutation.mutate({ id: task.id, dueAt: setHours(new Date(), 17) })}
                        data-testid={`context-today-${task.id}`}
                      >
                        Today 5pm
                      </ContextMenu.Item>
                      <ContextMenu.Item 
                        className="px-3 py-2 hover:bg-accent rounded-lg cursor-pointer"
                        onSelect={() => updateTaskMutation.mutate({ id: task.id, dueAt: setHours(addDays(new Date(), 1), 9) })}
                        data-testid={`context-tomorrow-${task.id}`}
                      >
                        Tomorrow 9am
                      </ContextMenu.Item>
                      <ContextMenu.Item 
                        className="px-3 py-2 hover:bg-accent rounded-lg cursor-pointer"
                        onSelect={() => updateTaskMutation.mutate({ id: task.id, dueAt: setHours(nextMonday(new Date()), 9) })}
                        data-testid={`context-monday-${task.id}`}
                      >
                        Next Monday
                      </ContextMenu.Item>
                      <ContextMenu.Item 
                        className="px-3 py-2 hover:bg-accent rounded-lg cursor-pointer"
                        onSelect={() => setSelectedTask(task)}
                        data-testid={`context-custom-${task.id}`}
                      >
                        Custom...
                      </ContextMenu.Item>
                    </ContextMenu.SubContent>
                  </ContextMenu.Sub>
                  
                  <ContextMenu.Separator className="h-px bg-border my-1" />
                  
                  <ContextMenu.Item 
                    className="px-3 py-2 hover:bg-accent rounded-lg flex items-center gap-2 cursor-pointer"
                    onSelect={() => setSelectedTask(task)}
                    data-testid={`context-edit-${task.id}`}
                  >
                    <Edit className="h-4 w-4" />
                    Full Edit
                  </ContextMenu.Item>
                  
                  <ContextMenu.Item 
                    className="px-3 py-2 hover:bg-accent rounded-lg flex items-center gap-2 cursor-pointer"
                    onSelect={() => {
                      if (task.status === "DONE" || task.status === "CANCELLED") {
                        toast({
                          title: "Cannot cancel",
                          description: "This task is already completed or cancelled",
                          variant: "destructive",
                        });
                        return;
                      }
                      setTaskToCancel(task);
                      setShowCancelDialog(true);
                    }}
                    data-testid={`context-cancel-${task.id}`}
                  >
                    <XCircle className="h-4 w-4" />
                    Cancel Task
                  </ContextMenu.Item>
                  
                  <ContextMenu.Item 
                    className="px-3 py-2 hover:bg-destructive/10 text-destructive rounded-lg flex items-center gap-2 cursor-pointer"
                    onSelect={() => {
                      toast({
                        title: "Delete coming soon",
                        description: "This feature will be added shortly",
                      });
                    }}
                    data-testid={`context-delete-${task.id}`}
                  >
                    <Trash className="h-4 w-4" />
                    Delete
                  </ContextMenu.Item>
                </ContextMenu.Content>
              </ContextMenu.Portal>
            </ContextMenu.Root>
          ))}
        </StaggeredList>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Task title"
              value={newTask.title || ""}
              onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
              data-testid="input-task-title"
            />
            
            <Textarea
              placeholder="Description (optional)"
              value={newTask.description || ""}
              onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
              rows={2}
              data-testid="input-task-description"
            />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Category</label>
                <Select
                  value={newTask.category || "OTHER"}
                  onValueChange={(value) => setNewTask({ ...newTask, category: value as any })}
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
                  onValueChange={(value) => setNewTask({ ...newTask, status: value as any })}
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
                    onClick={() => setNewTask({ ...newTask, urgency: level as any })}
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
                value={newTask.dueAt ? new Date(newTask.dueAt as any) : null}
                onChange={(date) => setNewTask({ 
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
                onChange={(e) => setNewTask({ ...newTask, location: e.target.value })}
                data-testid="input-task-location"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Repeat</label>
              <Select
                value={(newTask as any).recurrence || "none"}
                onValueChange={(value) => setNewTask({ ...newTask, recurrence: value as any })}
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
              {(newTask as any).recurrence === "custom" && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-sm text-muted-foreground">Every</span>
                  <Input
                    type="number"
                    min="1"
                    className="w-20"
                    value={(newTask as any).recurrenceCustomDays || ""}
                    onChange={(e) => setNewTask({ ...newTask, recurrenceCustomDays: parseInt(e.target.value) || undefined } as any)}
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
                    onClick={() => setNewTask({ ...newTask, estimatedMinutes: newTask.estimatedMinutes === minutes ? undefined : minutes })}
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
                  onChange={(e) => setNewTask({ ...newTask, estimatedMinutes: parseInt(e.target.value) || undefined })}
                  data-testid="input-estimate-custom"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => createTaskMutation.mutate(newTask)}
              disabled={!newTask.title || createTaskMutation.isPending}
              className="w-full"
              data-testid="button-submit-task"
            >
              Create Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedTask} onOpenChange={() => setSelectedTask(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
          </DialogHeader>
          {selectedTask && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Title</label>
                <Input
                  value={selectedTask.title}
                  onChange={(e) => setSelectedTask({ ...selectedTask, title: e.target.value })}
                  onBlur={() => {
                    updateTaskMutation.mutate({ 
                      id: selectedTask.id, 
                      title: selectedTask.title 
                    });
                  }}
                  data-testid="input-edit-task-title"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Description</label>
                <Textarea
                  value={selectedTask.description || ""}
                  onChange={(e) => setSelectedTask({ ...selectedTask, description: e.target.value })}
                  onBlur={() => {
                    updateTaskMutation.mutate({ 
                      id: selectedTask.id, 
                      description: selectedTask.description 
                    });
                  }}
                  rows={3}
                  data-testid="input-edit-task-description"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Due Date</label>
                <DateTimePicker
                  value={selectedTask.dueAt ? new Date(selectedTask.dueAt) : null}
                  onChange={(date) => {
                    setSelectedTask({ ...selectedTask, dueAt: date });
                    updateTaskMutation.mutate({ 
                      id: selectedTask.id, 
                      dueAt: date 
                    });
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
                        setSelectedTask({ ...selectedTask, dueAt: preset.value });
                        updateTaskMutation.mutate({ 
                          id: selectedTask.id, 
                          dueAt: preset.value 
                        });
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
                  value={selectedTask.location || ""}
                  onChange={(e) => setSelectedTask({ ...selectedTask, location: e.target.value })}
                  onBlur={() => {
                    updateTaskMutation.mutate({ 
                      id: selectedTask.id, 
                      location: selectedTask.location 
                    });
                  }}
                  placeholder="Add location"
                  data-testid="input-edit-task-location"
                />
              </div>

              {(selectedTask.checklistItems && selectedTask.checklistItems.length > 0) || true ? (
                <div>
                  <label className="text-sm font-medium mb-2 block">Checklist</label>
                  {selectedTask.checklistItems && selectedTask.checklistItems.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {selectedTask.checklistItems.map((item) => (
                        <div key={item.id} className="flex items-center gap-2">
                          <Checkbox
                            checked={item.done}
                            onCheckedChange={(checked) => {
                              updateChecklistItemMutation.mutate({
                                id: item.id,
                                done: !!checked,
                              });
                              setSelectedTask({
                                ...selectedTask,
                                checklistItems: selectedTask.checklistItems?.map(i =>
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
                        if (e.key === "Enter" && newChecklistItem.trim()) {
                          createChecklistItemMutation.mutate({
                            taskId: selectedTask.id,
                            text: newChecklistItem,
                          });
                          setNewChecklistItem("");
                        }
                      }}
                      data-testid="input-new-checklist-item"
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => {
                        if (newChecklistItem.trim()) {
                          createChecklistItemMutation.mutate({
                            taskId: selectedTask.id,
                            text: newChecklistItem,
                          });
                          setNewChecklistItem("");
                        }
                      }}
                      data-testid="button-add-checklist-item"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">Category</label>
                  <Select
                    value={selectedTask.category}
                    onValueChange={(value) => {
                      setSelectedTask({ ...selectedTask, category: value as any });
                      updateTaskMutation.mutate({ id: selectedTask.id, category: value as any });
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
                    value={selectedTask.urgency}
                    onValueChange={(value) => {
                      setSelectedTask({ ...selectedTask, urgency: value as any });
                      updateTaskMutation.mutate({ id: selectedTask.id, urgency: value as any });
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
                  value={selectedTask.status}
                  onValueChange={(value) => {
                    setSelectedTask({ ...selectedTask, status: value as any });
                    updateTaskMutation.mutate({ id: selectedTask.id, status: value as any });
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
                  value={selectedTask.notes || ""}
                  onChange={(e) => setSelectedTask({ ...selectedTask, notes: e.target.value })}
                  onBlur={() => {
                    updateTaskMutation.mutate({ 
                      id: selectedTask.id, 
                      notes: selectedTask.notes 
                    });
                  }}
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
                      variant={selectedTask.estimatedMinutes === minutes ? "default" : "outline"}
                      onClick={() => {
                        const newEstimate = selectedTask.estimatedMinutes === minutes ? null : minutes;
                        setSelectedTask({ ...selectedTask, estimatedMinutes: newEstimate });
                        updateTaskMutation.mutate({ id: selectedTask.id, estimatedMinutes: newEstimate });
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
                    value={selectedTask.estimatedMinutes && ![15, 30, 60, 120].includes(selectedTask.estimatedMinutes) ? selectedTask.estimatedMinutes : ""}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || null;
                      setSelectedTask({ ...selectedTask, estimatedMinutes: val });
                    }}
                    onBlur={() => {
                      updateTaskMutation.mutate({ id: selectedTask.id, estimatedMinutes: selectedTask.estimatedMinutes });
                    }}
                    data-testid="input-edit-estimate-custom"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Photos</label>
                {((selectedTask.images as string[])?.length || 0) > 0 && (
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {(selectedTask.images as string[]).map((img, index) => (
                      <div key={index} className="relative aspect-square">
                        <img 
                          src={img} 
                          alt="" 
                          className="w-full h-full object-cover rounded-md"
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          className="absolute top-1 right-1 p-1"
                          onClick={() => removeTaskImage(index)}
                          data-testid={`button-remove-task-image-${index}`}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <PhotoCapture
                    onPhotoCapture={handleTaskPhotoUpload}
                    disabled={isUploadingTaskPhoto}
                    buttonVariant="outline"
                    buttonSize="sm"
                    showLabel
                  />
                  {isUploadingTaskPhoto && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Uploading...
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => setSelectedTask(null)}
              className="w-full"
              data-testid="button-close-task-dialog"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Management Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage Templates</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Existing templates */}
            {templates.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Your Templates</Label>
                {templates.map((template) => {
                  const IconComponent = TEMPLATE_ICONS[template.icon || "file-text"] || FileText;
                  return (
                    <div 
                      key={template.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        <IconComponent className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium text-sm">{template.name}</p>
                          <p className="text-xs text-muted-foreground">{template.title}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setEditingTemplate(template)}
                          data-testid={`button-edit-template-${template.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteTemplateMutation.mutate(template.id)}
                          data-testid={`button-delete-template-${template.id}`}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Create new template form */}
            <div className="border-t pt-4 space-y-3">
              <Label className="text-sm font-medium">Create New Template</Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Template Name</Label>
                  <Input
                    placeholder="e.g. Weekly Groceries"
                    value={newTemplate.name}
                    onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                    data-testid="input-template-name"
                  />
                </div>
                <div>
                  <Label className="text-xs">Task Title</Label>
                  <Input
                    placeholder="e.g. Go grocery shopping"
                    value={newTemplate.title}
                    onChange={(e) => setNewTemplate({ ...newTemplate, title: e.target.value })}
                    data-testid="input-template-title"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Category</Label>
                  <Select
                    value={newTemplate.category}
                    onValueChange={(value) => setNewTemplate({ ...newTemplate, category: value as typeof newTemplate.category })}
                  >
                    <SelectTrigger data-testid="select-template-category">
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
                  <Label className="text-xs">Urgency</Label>
                  <Select
                    value={newTemplate.urgency}
                    onValueChange={(value) => setNewTemplate({ ...newTemplate, urgency: value as typeof newTemplate.urgency })}
                  >
                    <SelectTrigger data-testid="select-template-urgency">
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
                <Label className="text-xs">Location (optional)</Label>
                <Input
                  placeholder="e.g. Whole Foods"
                  value={newTemplate.location}
                  onChange={(e) => setNewTemplate({ ...newTemplate, location: e.target.value })}
                  data-testid="input-template-location"
                />
              </div>
              <div>
                <Label className="text-xs">Icon</Label>
                <Select
                  value={newTemplate.icon}
                  onValueChange={(value) => setNewTemplate({ ...newTemplate, icon: value })}
                >
                  <SelectTrigger data-testid="select-template-icon">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="file-text">Document</SelectItem>
                    <SelectItem value="shopping-cart">Shopping Cart</SelectItem>
                    <SelectItem value="school">School</SelectItem>
                    <SelectItem value="wrench">Wrench</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full"
                disabled={!newTemplate.name || !newTemplate.title || createTemplateMutation.isPending}
                onClick={() => createTemplateMutation.mutate(newTemplate)}
                data-testid="button-create-template"
              >
                <Plus className="h-4 w-4 mr-1" />
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
                  <Input
                    value={editingTemplate.name}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                    data-testid="input-edit-template-name"
                  />
                </div>
                <div>
                  <Label className="text-xs">Task Title</Label>
                  <Input
                    value={editingTemplate.title}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, title: e.target.value })}
                    data-testid="input-edit-template-title"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Category</Label>
                  <Select
                    value={editingTemplate.category}
                    onValueChange={(value) => setEditingTemplate({ ...editingTemplate, category: value as any })}
                  >
                    <SelectTrigger data-testid="select-edit-template-category">
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
                  <Label className="text-xs">Urgency</Label>
                  <Select
                    value={editingTemplate.urgency}
                    onValueChange={(value) => setEditingTemplate({ ...editingTemplate, urgency: value as any })}
                  >
                    <SelectTrigger data-testid="select-edit-template-urgency">
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Location (optional)</Label>
                  <Input
                    value={editingTemplate.location || ""}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, location: e.target.value })}
                    data-testid="input-edit-template-location"
                  />
                </div>
                <div>
                  <Label className="text-xs">Icon</Label>
                  <Select
                    value={editingTemplate.icon || "file-text"}
                    onValueChange={(value) => setEditingTemplate({ ...editingTemplate, icon: value })}
                  >
                    <SelectTrigger data-testid="select-edit-template-icon">
                      <SelectValue />
                    </SelectTrigger>
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
                <Button variant="outline" onClick={() => setEditingTemplate(null)}>
                  Cancel
                </Button>
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

      <Dialog open={showCancelDialog} onOpenChange={(open) => {
        if (!open) {
          setShowCancelDialog(false);
          setTaskToCancel(null);
          setCancelReason("");
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {taskToCancel && (
              <p className="text-sm text-muted-foreground">
                Are you sure you want to cancel "{taskToCancel.title}"? 
                All household assistants will be notified.
              </p>
            )}
            <div>
              <Label className="text-sm mb-1 block">Reason (optional)</Label>
              <Textarea
                placeholder="Why is this task being cancelled?"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                data-testid="input-cancel-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCancelDialog(false);
                setTaskToCancel(null);
                setCancelReason("");
              }}
              data-testid="button-cancel-dialog-dismiss"
            >
              Keep Task
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (taskToCancel) {
                  cancelTaskMutation.mutate({
                    id: taskToCancel.id,
                    reason: cancelReason || undefined,
                  });
                }
              }}
              disabled={cancelTaskMutation.isPending}
              data-testid="button-confirm-cancel"
            >
              {cancelTaskMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <XCircle className="h-4 w-4 mr-1" />
              )}
              Cancel Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
    </PageTransition>
  );
}
