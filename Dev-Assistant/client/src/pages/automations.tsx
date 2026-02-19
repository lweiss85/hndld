import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Zap, Plus, Play, Pause, Trash2, ChevronRight, Clock,
  CheckCircle2, XCircle, AlertTriangle, ArrowLeft,
  Lock, Unlock, Bell, Mail, CalendarPlus, FileText,
  Webhook, ListTodo, ShieldCheck, DollarSign, Users,
  BookTemplate, History, Settings2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format } from "date-fns";

const TRIGGER_LABELS: Record<string, { label: string; icon: any; category: string }> = {
  SMART_LOCK_UNLOCK: { label: "Smart Lock Unlocked", icon: Unlock, category: "Smart Home" },
  SMART_LOCK_LOCK: { label: "Smart Lock Locked", icon: Lock, category: "Smart Home" },
  APPROVAL_CREATED: { label: "Approval Created", icon: ShieldCheck, category: "Approvals" },
  APPROVAL_PENDING_HOURS: { label: "Approval Pending (Hours)", icon: Clock, category: "Approvals" },
  APPROVAL_APPROVED: { label: "Approval Approved", icon: CheckCircle2, category: "Approvals" },
  APPROVAL_REJECTED: { label: "Approval Rejected", icon: XCircle, category: "Approvals" },
  BUDGET_THRESHOLD: { label: "Budget Threshold Reached", icon: DollarSign, category: "Finance" },
  BUDGET_EXCEEDED: { label: "Budget Exceeded", icon: AlertTriangle, category: "Finance" },
  TASK_CREATED: { label: "Task Created", icon: ListTodo, category: "Tasks" },
  TASK_COMPLETED: { label: "Task Completed", icon: CheckCircle2, category: "Tasks" },
  TASK_OVERDUE: { label: "Task Overdue", icon: AlertTriangle, category: "Tasks" },
  CLEANING_STARTED: { label: "Cleaning Started", icon: Settings2, category: "Services" },
  CLEANING_COMPLETED: { label: "Cleaning Completed", icon: CheckCircle2, category: "Services" },
  SCHEDULE_TIME: { label: "Scheduled Time", icon: Clock, category: "Schedule" },
  SCHEDULE_DAY: { label: "Scheduled Day", icon: CalendarPlus, category: "Schedule" },
  DOCUMENT_EXPIRING: { label: "Document Expiring", icon: FileText, category: "Documents" },
  SPENDING_CREATED: { label: "Spending Recorded", icon: DollarSign, category: "Finance" },
  CALENDAR_EVENT_SOON: { label: "Calendar Event Soon", icon: CalendarPlus, category: "Calendar" },
  GUEST_ACCESS_STARTED: { label: "Guest Access Started", icon: Users, category: "Guests" },
  GUEST_ACCESS_ENDED: { label: "Guest Access Ended", icon: Users, category: "Guests" },
};

const ACTION_LABELS: Record<string, { label: string; icon: any }> = {
  SEND_NOTIFICATION: { label: "Send Notification", icon: Bell },
  SEND_EMAIL: { label: "Send Email", icon: Mail },
  SEND_SMS: { label: "Send SMS", icon: Mail },
  CREATE_TASK: { label: "Create Task", icon: ListTodo },
  COMPLETE_TASK: { label: "Complete Task", icon: CheckCircle2 },
  CREATE_APPROVAL: { label: "Create Approval", icon: ShieldCheck },
  AUTO_APPROVE: { label: "Auto-Approve", icon: ShieldCheck },
  LOCK_DOOR: { label: "Lock Door", icon: Lock },
  UNLOCK_DOOR: { label: "Unlock Door", icon: Unlock },
  ADD_TO_CALENDAR: { label: "Add to Calendar", icon: CalendarPlus },
  UPDATE_BUDGET: { label: "Update Budget", icon: DollarSign },
  TRIGGER_WEBHOOK: { label: "Trigger Webhook", icon: Webhook },
  LOG_EVENT: { label: "Log Event", icon: FileText },
};

const COLOR_MAP: Record<string, string> = {
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  red: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  purple: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
};

interface AutomationItem {
  id: string;
  householdId: string;
  propertyId: string | null;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  trigger: string;
  triggerConfig: Record<string, any>;
  conditions: Record<string, any> | null;
  actions: Array<{ type: string; config: Record<string, any>; order: number }>;
  isEnabled: boolean;
  isPaused: boolean;
  pauseUntil: string | null;
  runCount: number;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  lastRunError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AutomationRunItem {
  id: string;
  automationId: string;
  triggeredBy: any;
  status: string;
  actionsExecuted: Array<{ type: string; status: string; result?: any; error?: string; executedAt: string }> | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface TemplateItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  trigger: string;
  triggerConfig: Record<string, any>;
  actions: Array<{ type: string; config: Record<string, any>; order: number }>;
}

type PageView = "list" | "create" | "detail" | "runs" | "templates";

export default function AutomationsPage() {
  const [view, setView] = useState<PageView>("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: automationsList = [], isLoading } = useQuery<AutomationItem[]>({
    queryKey: ["/api/v1/automations"],
  });

  const { data: templates = [] } = useQuery<TemplateItem[]>({
    queryKey: ["/api/v1/automations/templates"],
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: string; isEnabled: boolean }) => {
      await apiRequest("PUT", `/api/v1/automations/${id}`, { isEnabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/automations"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/v1/automations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/automations"] });
      setView("list");
      setSelectedId(null);
      toast({ title: "Automation deleted" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/v1/automations/${id}/test`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/automations"] });
      toast({
        title: "Test run completed",
        description: data.run?.status === "SUCCESS" ? "All actions executed successfully" : `Status: ${data.run?.status || "Unknown"}`,
      });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "pause" | "resume" }) => {
      await apiRequest("POST", `/api/v1/automations/${id}/${action}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/automations"] });
      toast({ title: "Automation updated" });
    },
  });

  const selected = automationsList.find((a) => a.id === selectedId);

  if (view === "create" || (view === "detail" && selected)) {
    return (
      <AutomationBuilder
        automation={view === "detail" ? selected : undefined}
        templates={templates}
        onSave={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/v1/automations"] });
          setView("list");
          toast({ title: view === "detail" ? "Automation updated" : "Automation created" });
        }}
        onCancel={() => setView("list")}
      />
    );
  }

  if (view === "runs" && selectedId) {
    return (
      <RunHistory
        automationId={selectedId}
        automationName={selected?.name || "Automation"}
        onBack={() => setView("list")}
      />
    );
  }

  if (view === "templates") {
    return (
      <TemplatesView
        templates={templates}
        onSelect={(template) => {
          setView("create");
        }}
        onBack={() => setView("list")}
      />
    );
  }

  return (
    <div className="min-h-screen bg-porcelain dark:bg-ink-navy pb-24">
      <div className="px-4 pt-6 pb-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-ink-navy dark:text-porcelain">Automations</h1>
            <p className="text-sm text-ink-navy/50 dark:text-porcelain/50 mt-1">
              {automationsList.length} automation{automationsList.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Button
            onClick={() => setView("create")}
            className="bg-ink-navy text-porcelain dark:bg-porcelain dark:text-ink-navy"
          >
            <Plus className="w-4 h-4 mr-1" /> New
          </Button>
        </div>

        {templates.length > 0 && (
          <button
            onClick={() => setView("templates")}
            className="w-full mb-4 flex items-center gap-3 p-3 rounded-xl border border-ink-navy/10 dark:border-porcelain/10 bg-white/50 dark:bg-white/5"
          >
            <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <BookTemplate className="w-5 h-5 text-purple-600 dark:text-purple-300" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-ink-navy dark:text-porcelain">Browse Templates</p>
              <p className="text-xs text-ink-navy/50 dark:text-porcelain/50">{templates.length} pre-built automations</p>
            </div>
            <ChevronRight className="w-4 h-4 text-ink-navy/30 dark:text-porcelain/30" />
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="px-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-white/50 dark:bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : automationsList.length === 0 ? (
        <div className="px-4 text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-ink-navy/5 dark:bg-porcelain/5 flex items-center justify-center">
            <Zap className="w-8 h-8 text-ink-navy/30 dark:text-porcelain/30" />
          </div>
          <h3 className="text-lg font-medium text-ink-navy dark:text-porcelain mb-2">No automations yet</h3>
          <p className="text-sm text-ink-navy/50 dark:text-porcelain/50 mb-6">
            Create your first automation to streamline household operations
          </p>
          <Button onClick={() => setView("create")} variant="outline">
            <Plus className="w-4 h-4 mr-1" /> Create Automation
          </Button>
        </div>
      ) : (
        <div className="px-4 space-y-3">
          {automationsList.map((automation) => {
            const triggerInfo = TRIGGER_LABELS[automation.trigger];
            const colorClass = COLOR_MAP[automation.color] || COLOR_MAP.blue;

            return (
              <Card
                key={automation.id}
                className={cn(
                  "border-0 shadow-sm transition-all",
                  !automation.isEnabled && "opacity-60"
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", colorClass)}>
                      <Zap className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-ink-navy dark:text-porcelain truncate">
                          {automation.name}
                        </h3>
                        {automation.isPaused && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">Paused</Badge>
                        )}
                      </div>
                      <p className="text-xs text-ink-navy/50 dark:text-porcelain/50 mb-2">
                        When: {triggerInfo?.label || automation.trigger}
                        {" → "}
                        {automation.actions.length} action{automation.actions.length !== 1 ? "s" : ""}
                      </p>
                      <div className="flex items-center gap-3 text-[11px] text-ink-navy/40 dark:text-porcelain/40">
                        <span className="flex items-center gap-1">
                          <Play className="w-3 h-3" /> {automation.runCount} runs
                        </span>
                        {automation.lastRunAt && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {formatDistanceToNow(new Date(automation.lastRunAt), { addSuffix: true })}
                          </span>
                        )}
                        {automation.lastRunStatus && (
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] px-1.5 py-0",
                              automation.lastRunStatus === "SUCCESS" && "text-emerald-600 border-emerald-200",
                              automation.lastRunStatus === "FAILED" && "text-red-600 border-red-200"
                            )}
                          >
                            {automation.lastRunStatus}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Switch
                      checked={automation.isEnabled}
                      onCheckedChange={(checked) => toggleMutation.mutate({ id: automation.id, isEnabled: checked })}
                      className="shrink-0"
                    />
                  </div>

                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-ink-navy/5 dark:border-porcelain/5">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-7 px-2"
                      onClick={() => { setSelectedId(automation.id); setView("detail"); }}
                    >
                      <Settings2 className="w-3 h-3 mr-1" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-7 px-2"
                      onClick={() => testMutation.mutate(automation.id)}
                      disabled={testMutation.isPending}
                    >
                      <Play className="w-3 h-3 mr-1" /> Test
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-7 px-2"
                      onClick={() => { setSelectedId(automation.id); setView("runs"); }}
                    >
                      <History className="w-3 h-3 mr-1" /> History
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-7 px-2"
                      onClick={() => pauseMutation.mutate({
                        id: automation.id,
                        action: automation.isPaused ? "resume" : "pause",
                      })}
                    >
                      {automation.isPaused ? <Play className="w-3 h-3 mr-1" /> : <Pause className="w-3 h-3 mr-1" />}
                      {automation.isPaused ? "Resume" : "Pause"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Automation?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-ink-navy/60 dark:text-porcelain/60">This action cannot be undone.</p>
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { if (selectedId) deleteMutation.mutate(selectedId); setShowDeleteConfirm(false); }}>Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AutomationBuilder({
  automation,
  templates,
  onSave,
  onCancel,
}: {
  automation?: AutomationItem;
  templates: TemplateItem[];
  onSave: () => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(automation ? 3 : 0);
  const [name, setName] = useState(automation?.name || "");
  const [description, setDescription] = useState(automation?.description || "");
  const [trigger, setTrigger] = useState(automation?.trigger || "");
  const [triggerConfig, setTriggerConfig] = useState<Record<string, any>>(automation?.triggerConfig || {});
  const [actions, setActions] = useState<Array<{ type: string; config: Record<string, any>; order: number }>>(
    automation?.actions || []
  );
  const [color, setColor] = useState(automation?.color || "blue");
  const { toast } = useToast();

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = { name, description, trigger, triggerConfig, actions, color, icon: "zap" };
      if (automation) {
        await apiRequest("PUT", `/api/v1/automations/${automation.id}`, body);
      } else {
        await apiRequest("POST", `/api/v1/automations`, body);
      }
    },
    onSuccess: onSave,
    onError: () => toast({ title: "Failed to save automation", variant: "destructive" }),
  });

  const applyTemplate = (template: TemplateItem) => {
    setName(template.name);
    setDescription(template.description);
    setTrigger(template.trigger);
    setTriggerConfig(template.triggerConfig);
    setActions(template.actions);
    setColor(template.color);
    setStep(3);
  };

  const addAction = (type: string) => {
    setActions([...actions, { type, config: {}, order: actions.length + 1 }]);
  };

  const removeAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  const updateActionConfig = (index: number, key: string, value: string) => {
    const updated = [...actions];
    updated[index] = { ...updated[index], config: { ...updated[index].config, [key]: value } };
    setActions(updated);
  };

  const triggerCategories = Object.entries(TRIGGER_LABELS).reduce((acc, [key, val]) => {
    if (!acc[val.category]) acc[val.category] = [];
    acc[val.category].push({ key, ...val });
    return acc;
  }, {} as Record<string, Array<{ key: string; label: string; icon: any; category: string }>>);

  return (
    <div className="min-h-screen bg-porcelain dark:bg-ink-navy pb-24">
      <div className="px-4 pt-6 pb-4">
        <button onClick={onCancel} className="flex items-center gap-1 text-sm text-ink-navy/60 dark:text-porcelain/60 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <h1 className="text-2xl font-semibold text-ink-navy dark:text-porcelain">
          {automation ? "Edit Automation" : "New Automation"}
        </h1>

        <div className="flex gap-1 mt-4 mb-6">
          {[0, 1, 2, 3].map((s) => (
            <div
              key={s}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                s <= step ? "bg-ink-navy dark:bg-porcelain" : "bg-ink-navy/10 dark:bg-porcelain/10"
              )}
            />
          ))}
        </div>
      </div>

      <div className="px-4">
        {step === 0 && !automation && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium text-ink-navy dark:text-porcelain">Start from scratch or use a template</h2>

            <button
              onClick={() => setStep(1)}
              className="w-full p-4 rounded-xl border-2 border-dashed border-ink-navy/20 dark:border-porcelain/20 text-center"
            >
              <Plus className="w-6 h-6 mx-auto mb-2 text-ink-navy/40 dark:text-porcelain/40" />
              <p className="text-sm font-medium text-ink-navy dark:text-porcelain">Start from Scratch</p>
            </button>

            {templates.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-ink-navy/60 dark:text-porcelain/60">Templates</h3>
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-white/5 border border-ink-navy/10 dark:border-porcelain/10"
                  >
                    <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", COLOR_MAP[t.color] || COLOR_MAP.blue)}>
                      <Zap className="w-5 h-5" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium text-ink-navy dark:text-porcelain">{t.name}</p>
                      <p className="text-xs text-ink-navy/50 dark:text-porcelain/50">{t.description}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-ink-navy/30 dark:text-porcelain/30" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium text-ink-navy dark:text-porcelain">Choose a Trigger</h2>
            <p className="text-sm text-ink-navy/50 dark:text-porcelain/50">What event should start this automation?</p>

            {Object.entries(triggerCategories).map(([category, triggers]) => (
              <div key={category} className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-navy/40 dark:text-porcelain/40">{category}</h3>
                {triggers.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => { setTrigger(key); setStep(2); }}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-xl border transition-colors",
                      trigger === key
                        ? "border-ink-navy dark:border-porcelain bg-ink-navy/5 dark:bg-porcelain/5"
                        : "border-ink-navy/10 dark:border-porcelain/10 bg-white dark:bg-white/5"
                    )}
                  >
                    <Icon className="w-5 h-5 text-ink-navy/60 dark:text-porcelain/60" />
                    <span className="text-sm text-ink-navy dark:text-porcelain">{label}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium text-ink-navy dark:text-porcelain">Add Actions</h2>
            <p className="text-sm text-ink-navy/50 dark:text-porcelain/50">What should happen when this triggers?</p>

            {actions.length > 0 && (
              <div className="space-y-2 mb-4">
                {actions.map((action, i) => {
                  const actionInfo = ACTION_LABELS[action.type];
                  const Icon = actionInfo?.icon || Zap;
                  return (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-white/5 border border-ink-navy/10 dark:border-porcelain/10">
                      <div className="w-8 h-8 rounded-lg bg-ink-navy/5 dark:bg-porcelain/5 flex items-center justify-center">
                        <Icon className="w-4 h-4 text-ink-navy/60 dark:text-porcelain/60" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-ink-navy dark:text-porcelain">{actionInfo?.label || action.type}</p>
                        {action.type === "SEND_NOTIFICATION" && (
                          <div className="mt-2 space-y-1">
                            <Input
                              placeholder="Title"
                              value={action.config.title || ""}
                              onChange={(e) => updateActionConfig(i, "title", e.target.value)}
                              className="h-7 text-xs"
                            />
                            <Input
                              placeholder="Body (use {{variable}} for data)"
                              value={action.config.body || ""}
                              onChange={(e) => updateActionConfig(i, "body", e.target.value)}
                              className="h-7 text-xs"
                            />
                          </div>
                        )}
                        {action.type === "CREATE_TASK" && (
                          <div className="mt-2 space-y-1">
                            <Input
                              placeholder="Task title"
                              value={action.config.title || ""}
                              onChange={(e) => updateActionConfig(i, "title", e.target.value)}
                              className="h-7 text-xs"
                            />
                          </div>
                        )}
                        {action.type === "TRIGGER_WEBHOOK" && (
                          <div className="mt-2">
                            <Input
                              placeholder="Webhook URL"
                              value={action.config.url || ""}
                              onChange={(e) => updateActionConfig(i, "url", e.target.value)}
                              className="h-7 text-xs"
                            />
                          </div>
                        )}
                      </div>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => removeAction(i)}>
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-navy/40 dark:text-porcelain/40">Add Action</h3>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(ACTION_LABELS).map(([key, { label, icon: Icon }]) => (
                  <button
                    key={key}
                    onClick={() => addAction(key)}
                    className="flex items-center gap-2 p-2.5 rounded-xl bg-white dark:bg-white/5 border border-ink-navy/10 dark:border-porcelain/10 text-left"
                  >
                    <Icon className="w-4 h-4 text-ink-navy/60 dark:text-porcelain/60 shrink-0" />
                    <span className="text-xs text-ink-navy dark:text-porcelain">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {actions.length > 0 && (
              <Button onClick={() => setStep(3)} className="w-full bg-ink-navy text-porcelain dark:bg-porcelain dark:text-ink-navy">
                Continue
              </Button>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium text-ink-navy dark:text-porcelain">Finalize</h2>

            <div className="space-y-3">
              <div>
                <Label className="text-xs">Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Automation" />
              </div>
              <div>
                <Label className="text-xs">Description (optional)</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this automation do?" rows={2} />
              </div>
              <div>
                <Label className="text-xs">Color</Label>
                <div className="flex gap-2 mt-1">
                  {Object.keys(COLOR_MAP).map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={cn(
                        "w-8 h-8 rounded-lg border-2 transition-all",
                        COLOR_MAP[c],
                        color === c ? "border-ink-navy dark:border-porcelain scale-110" : "border-transparent"
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>

            <Card className="border-0">
              <CardContent className="p-4">
                <h3 className="text-sm font-medium text-ink-navy dark:text-porcelain mb-2">Summary</h3>
                <div className="space-y-2 text-xs text-ink-navy/60 dark:text-porcelain/60">
                  <p><span className="font-medium">Trigger:</span> {TRIGGER_LABELS[trigger]?.label || trigger}</p>
                  <p><span className="font-medium">Actions:</span></p>
                  <ol className="list-decimal list-inside space-y-1">
                    {actions.map((a, i) => (
                      <li key={i}>{ACTION_LABELS[a.type]?.label || a.type}</li>
                    ))}
                  </ol>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(automation ? 3 : 2)} className="flex-1">
                Back
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!name || !trigger || actions.length === 0 || saveMutation.isPending}
                className="flex-1 bg-ink-navy text-porcelain dark:bg-porcelain dark:text-ink-navy"
              >
                {saveMutation.isPending ? "Saving..." : automation ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RunHistory({ automationId, automationName, onBack }: { automationId: string; automationName: string; onBack: () => void }) {
  const { data: runs = [], isLoading } = useQuery<AutomationRunItem[]>({
    queryKey: [`/api/v1/automations/${automationId}/runs`],
  });

  return (
    <div className="min-h-screen bg-porcelain dark:bg-ink-navy pb-24">
      <div className="px-4 pt-6 pb-4">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-ink-navy/60 dark:text-porcelain/60 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <h1 className="text-2xl font-semibold text-ink-navy dark:text-porcelain">Run History</h1>
        <p className="text-sm text-ink-navy/50 dark:text-porcelain/50 mt-1">{automationName}</p>
      </div>

      <div className="px-4 space-y-3">
        {isLoading ? (
          [1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-white/50 dark:bg-white/5 animate-pulse" />)
        ) : runs.length === 0 ? (
          <div className="text-center py-12">
            <History className="w-8 h-8 mx-auto mb-3 text-ink-navy/30 dark:text-porcelain/30" />
            <p className="text-sm text-ink-navy/50 dark:text-porcelain/50">No runs yet</p>
          </div>
        ) : (
          runs.map((run) => (
            <Card key={run.id} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs",
                      run.status === "SUCCESS" && "text-emerald-600 border-emerald-200",
                      run.status === "FAILED" && "text-red-600 border-red-200",
                      run.status === "RUNNING" && "text-blue-600 border-blue-200"
                    )}
                  >
                    {run.status === "SUCCESS" && <CheckCircle2 className="w-3 h-3 mr-1" />}
                    {run.status === "FAILED" && <XCircle className="w-3 h-3 mr-1" />}
                    {run.status}
                  </Badge>
                  <span className="text-xs text-ink-navy/40 dark:text-porcelain/40">
                    {format(new Date(run.startedAt), "MMM d, h:mm a")}
                  </span>
                </div>
                {run.error && (
                  <p className="text-xs text-red-500 mt-1 mb-2">{run.error}</p>
                )}
                {run.actionsExecuted && run.actionsExecuted.length > 0 && (
                  <div className="space-y-1 mt-2">
                    {run.actionsExecuted.map((a, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-ink-navy/60 dark:text-porcelain/60">
                        {a.status === "SUCCESS" ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                        ) : (
                          <XCircle className="w-3 h-3 text-red-500 shrink-0" />
                        )}
                        <span>{ACTION_LABELS[a.type]?.label || a.type}</span>
                        {a.error && <span className="text-red-400 truncate">- {a.error}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {run.completedAt && (
                  <p className="text-[11px] text-ink-navy/30 dark:text-porcelain/30 mt-2">
                    Duration: {Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)}s
                  </p>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function TemplatesView({
  templates,
  onSelect,
  onBack,
}: {
  templates: TemplateItem[];
  onSelect: (template: TemplateItem) => void;
  onBack: () => void;
}) {
  return (
    <div className="min-h-screen bg-porcelain dark:bg-ink-navy pb-24">
      <div className="px-4 pt-6 pb-4">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-ink-navy/60 dark:text-porcelain/60 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <h1 className="text-2xl font-semibold text-ink-navy dark:text-porcelain">Templates</h1>
        <p className="text-sm text-ink-navy/50 dark:text-porcelain/50 mt-1">Pre-built automations to get you started</p>
      </div>

      <div className="px-4 space-y-3">
        {templates.map((template) => {
          const triggerInfo = TRIGGER_LABELS[template.trigger];
          return (
            <Card key={template.id} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", COLOR_MAP[template.color] || COLOR_MAP.blue)}>
                    <Zap className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-ink-navy dark:text-porcelain">{template.name}</h3>
                    <p className="text-xs text-ink-navy/50 dark:text-porcelain/50 mt-1">{template.description}</p>
                    <div className="flex items-center gap-2 mt-2 text-[11px] text-ink-navy/40 dark:text-porcelain/40">
                      <span>Trigger: {triggerInfo?.label || template.trigger}</span>
                      <span>|</span>
                      <span>{template.actions.length} action{template.actions.length !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="w-full mt-3 bg-ink-navy text-porcelain dark:bg-porcelain dark:text-ink-navy text-xs"
                  onClick={() => onSelect(template)}
                >
                  Use Template
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
