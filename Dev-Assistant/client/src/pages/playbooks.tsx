import { useState } from "react";
import { HandledIllustration } from "@/components/illustrations";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
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
import { 
  Plus, 
  BookOpen,
  ListChecks,
  ChevronRight,
  ChevronDown,
  X,
  GripVertical,
  Edit2,
  Trash2,
  ArrowLeft,
  Settings2,
  Wrench
} from "lucide-react";
import type { Playbook, PlaybookStep, PropertyRoom } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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

const ACTION_TYPES = [
  { value: "CLEAN", label: "Clean" },
  { value: "INSPECT", label: "Inspect" },
  { value: "RESTOCK", label: "Restock" },
  { value: "ORGANIZE", label: "Organize" },
  { value: "REPAIR", label: "Repair" },
  { value: "SANITIZE", label: "Sanitize" },
  { value: "VACUUM", label: "Vacuum" },
  { value: "MOP", label: "Mop" },
  { value: "DUST", label: "Dust" },
  { value: "WASH", label: "Wash" },
  { value: "REPORT", label: "Report" },
  { value: "PHOTOGRAPH", label: "Photograph" },
  { value: "CUSTOM", label: "Custom" },
];

const VERIFICATION_METHODS = [
  { value: "NONE", label: "None" },
  { value: "PHOTO_BEFORE_AFTER", label: "Photo (Before & After)" },
  { value: "PHOTO_AFTER", label: "Photo (After)" },
  { value: "CHECKLIST", label: "Checklist" },
  { value: "VISUAL_INSPECT", label: "Visual Inspection" },
];

interface PlaybookWithSteps extends Playbook {
  steps?: PlaybookStep[];
}

interface StepInput {
  title: string;
  description: string | null;
  estimatedMinutes: number | null;
  actionType: string | null;
  roomId: string | null;
  targetSurface: string | null;
  toolsRequired: string[];
  verificationMethod: string | null;
  acceptanceCriteria: string | null;
  safetyConstraints: string[];
  dependsOnSteps: number[];
  isParallelizable: boolean;
}

function createEmptyStep(): StepInput {
  return {
    title: "",
    description: null,
    estimatedMinutes: null,
    actionType: null,
    roomId: null,
    targetSurface: null,
    toolsRequired: [],
    verificationMethod: null,
    acceptanceCriteria: null,
    safetyConstraints: [],
    dependsOnSteps: [],
    isParallelizable: false,
  };
}

function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [inputValue, setInputValue] = useState("");

  const addTag = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
      setInputValue("");
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {value.map((tag, i) => (
          <Badge key={i} variant="secondary" className="gap-1 pr-1">
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              className="ml-0.5 rounded-full hover:bg-muted p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-1.5">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder={placeholder}
          className="flex-1"
        />
        <Button type="button" variant="outline" size="sm" onClick={addTag} disabled={!inputValue.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}

function StepEditor({
  step,
  index,
  totalSteps,
  rooms,
  onUpdate,
  onRemove,
  testIdPrefix,
}: {
  step: StepInput;
  index: number;
  totalSteps: number;
  rooms: PropertyRoom[];
  onUpdate: (updates: Partial<StepInput>) => void;
  onRemove: () => void;
  testIdPrefix: string;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <Card className="relative">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground min-w-[24px]">
            {index + 1}.
          </span>
          <Input
            value={step.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            placeholder="Step title"
            className="flex-1"
            data-testid={`${testIdPrefix}-title-${index}`}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            data-testid={`button-remove-${testIdPrefix.replace("input-", "")}-${index}`}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <Input
          value={step.description || ""}
          onChange={(e) => onUpdate({ description: e.target.value || null })}
          placeholder="Additional details (optional)"
          className="ml-8"
          data-testid={`${testIdPrefix}-description-${index}`}
        />

        <div className="ml-8 flex flex-wrap gap-2">
          <Input
            type="number"
            value={step.estimatedMinutes || ""}
            onChange={(e) => onUpdate({ estimatedMinutes: e.target.value ? parseInt(e.target.value) : null })}
            placeholder="Minutes"
            className="w-28"
            data-testid={`${testIdPrefix}-minutes-${index}`}
          />

          <Select
            value={step.actionType || ""}
            onValueChange={(v) => onUpdate({ actionType: v || null })}
          >
            <SelectTrigger className="w-36" data-testid={`select-step-action-${index}`}>
              <SelectValue placeholder="Action type" />
            </SelectTrigger>
            <SelectContent>
              {ACTION_TYPES.map((a) => (
                <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={step.roomId || ""}
            onValueChange={(v) => onUpdate({ roomId: v || null })}
          >
            <SelectTrigger className="w-40" data-testid={`select-step-room-${index}`}>
              <SelectValue placeholder="Room" />
            </SelectTrigger>
            <SelectContent>
              {rooms.length === 0 ? (
                <SelectItem value="_none" disabled>No rooms configured</SelectItem>
              ) : (
                rooms.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="ml-8 space-y-1">
          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground h-7 px-2">
                <Wrench className="h-3.5 w-3.5" />
                Details
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Target Surface</label>
                <Input
                  value={step.targetSurface || ""}
                  onChange={(e) => onUpdate({ targetSurface: e.target.value || null })}
                  placeholder="e.g., Granite countertop, Glass shower door"
                  data-testid={`input-step-surface-${index}`}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Tools Required</label>
                <TagInput
                  value={step.toolsRequired}
                  onChange={(v) => onUpdate({ toolsRequired: v })}
                  placeholder="Add a tool and press Enter"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Verification Method</label>
                <Select
                  value={step.verificationMethod || "NONE"}
                  onValueChange={(v) => onUpdate({ verificationMethod: v === "NONE" ? null : v })}
                >
                  <SelectTrigger data-testid={`select-step-verification-${index}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VERIFICATION_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground h-7 px-2">
                <Settings2 className="h-3.5 w-3.5" />
                Advanced
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Acceptance Criteria</label>
                <Textarea
                  value={step.acceptanceCriteria || ""}
                  onChange={(e) => onUpdate({ acceptanceCriteria: e.target.value || null })}
                  placeholder="What must be true for this step to be considered done?"
                  rows={2}
                  data-testid={`input-step-criteria-${index}`}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Safety Constraints</label>
                <TagInput
                  value={step.safetyConstraints}
                  onChange={(v) => onUpdate({ safetyConstraints: v })}
                  placeholder="Add safety constraint and press Enter"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Depends on Steps</label>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: totalSteps }, (_, i) => i).filter(i => i !== index).map((i) => (
                    <Button
                      key={i}
                      type="button"
                      variant={step.dependsOnSteps.includes(i + 1) ? "default" : "outline"}
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => {
                        const stepNum = i + 1;
                        if (step.dependsOnSteps.includes(stepNum)) {
                          onUpdate({ dependsOnSteps: step.dependsOnSteps.filter(s => s !== stepNum) });
                        } else {
                          onUpdate({ dependsOnSteps: [...step.dependsOnSteps, stepNum] });
                        }
                      }}
                    >
                      {i + 1}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={step.isParallelizable}
                  onCheckedChange={(v) => onUpdate({ isParallelizable: v })}
                  data-testid={`switch-step-parallel-${index}`}
                />
                <label className="text-xs text-muted-foreground">Can run in parallel</label>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </CardContent>
    </Card>
  );
}

function PlaybooksSkeleton() {
  return (
    <div className="px-4 py-6 space-y-4 max-w-4xl mx-auto">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-12 w-full" />
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-24" />
      ))}
    </div>
  );
}

export default function Playbooks() {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedPlaybook, setSelectedPlaybook] = useState<PlaybookWithSteps | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [newPlaybook, setNewPlaybook] = useState({
    title: "",
    description: "",
    category: "HOUSEHOLD",
  });
  const [newSteps, setNewSteps] = useState<StepInput[]>([]);

  const { data: playbooks, isLoading } = useQuery<Playbook[]>({
    queryKey: ["/api/playbooks"],
  });

  const { data: playbookDetail, isLoading: isDetailLoading } = useQuery<PlaybookWithSteps>({
    queryKey: ["/api/playbooks", selectedPlaybook?.id],
    enabled: !!selectedPlaybook?.id,
  });

  const { data: allRooms } = useQuery<PropertyRoom[]>({
    queryKey: ["/api/v1/property-rooms-all"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/v1/properties");
      const data = await res.json();
      const propertyList = data.properties || [];
      const rooms: PropertyRoom[] = [];
      for (const prop of propertyList) {
        try {
          const roomRes = await apiRequest("GET", `/api/v1/properties/${prop.id}/rooms`);
          const roomData = await roomRes.json();
          const roomList = roomData.rooms || [];
          rooms.push(...roomList);
        } catch {}
      }
      return rooms;
    },
  });

  const rooms = allRooms || [];

  const createPlaybookMutation = useMutation({
    mutationFn: async (data: { title: string; description: string; category: string; steps: StepInput[] }) => {
      return apiRequest("POST", "/api/playbooks", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playbooks"] });
      setShowCreateDialog(false);
      resetForm();
      toast({
        title: "Playbook created",
        description: "Your SOP has been saved",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to create playbook",
      });
    },
  });

  const updatePlaybookMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string; title: string; description: string; category: string; steps: StepInput[] }) => {
      return apiRequest("PATCH", `/api/playbooks/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playbooks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/playbooks", selectedPlaybook?.id] });
      setIsEditing(false);
      toast({
        title: "Playbook updated",
        description: "Your changes have been saved",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update playbook",
      });
    },
  });

  const deletePlaybookMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/playbooks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playbooks"] });
      setSelectedPlaybook(null);
      toast({
        title: "Playbook deleted",
        description: "The playbook has been removed",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete playbook",
      });
    },
  });

  const resetForm = () => {
    setNewPlaybook({ title: "", description: "", category: "HOUSEHOLD" });
    setNewSteps([]);
  };

  const addStep = () => {
    setNewSteps([...newSteps, createEmptyStep()]);
  };

  const removeStep = (index: number) => {
    setNewSteps(newSteps.filter((_, i) => i !== index));
  };

  const updateStep = (index: number, updates: Partial<StepInput>) => {
    setNewSteps(newSteps.map((step, i) => i === index ? { ...step, ...updates } : step));
  };

  const handleCreate = () => {
    if (!newPlaybook.title.trim()) {
      toast({ variant: "destructive", title: "Title required", description: "Please enter a title" });
      return;
    }
    createPlaybookMutation.mutate({
      ...newPlaybook,
      steps: newSteps.filter(s => s.title.trim()),
    });
  };

  const handleUpdate = () => {
    if (!selectedPlaybook) return;
    updatePlaybookMutation.mutate({
      id: selectedPlaybook.id,
      ...newPlaybook,
      steps: newSteps.filter(s => s.title.trim()),
    });
  };

  const startEditing = () => {
    if (playbookDetail) {
      setNewPlaybook({
        title: playbookDetail.title,
        description: playbookDetail.description || "",
        category: playbookDetail.category || "HOUSEHOLD",
      });
      setNewSteps((playbookDetail.steps || []).map(s => ({
        title: s.title,
        description: s.description,
        estimatedMinutes: s.estimatedMinutes,
        actionType: s.actionType || null,
        roomId: s.roomId || null,
        targetSurface: s.targetSurface || null,
        toolsRequired: (s.toolsRequired as string[]) || [],
        verificationMethod: s.verificationMethod || null,
        acceptanceCriteria: s.acceptanceCriteria || null,
        safetyConstraints: (s.safetyConstraints as string[]) || [],
        dependsOnSteps: (s.dependsOnSteps as number[]) || [],
        isParallelizable: s.isParallelizable || false,
      })));
      setIsEditing(true);
    }
  };

  if (isLoading) {
    return <PlaybooksSkeleton />;
  }

  if (selectedPlaybook) {
    return (
      <div className="px-4 py-6 pb-28 space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setSelectedPlaybook(null);
              setIsEditing(false);
              resetForm();
            }}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold" data-testid="text-playbook-title">
              {isEditing ? "Edit Playbook" : playbookDetail?.title || selectedPlaybook.title}
            </h1>
            {!isEditing && playbookDetail?.category && (
              <Badge variant="secondary" className="mt-1">
                {CATEGORIES.find(c => c.value === playbookDetail.category)?.label || playbookDetail.category}
              </Badge>
            )}
          </div>
          {!isEditing && (
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={startEditing}
                data-testid="button-edit-playbook"
              >
                <Edit2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => deletePlaybookMutation.mutate(selectedPlaybook.id)}
                data-testid="button-delete-playbook"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                value={newPlaybook.title}
                onChange={(e) => setNewPlaybook({ ...newPlaybook, title: e.target.value })}
                placeholder="e.g., Weekly Deep Clean"
                data-testid="input-playbook-title"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Category</label>
              <Select
                value={newPlaybook.category}
                onValueChange={(v) => setNewPlaybook({ ...newPlaybook, category: v })}
              >
                <SelectTrigger data-testid="select-playbook-category">
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

            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={newPlaybook.description}
                onChange={(e) => setNewPlaybook({ ...newPlaybook, description: e.target.value })}
                placeholder="Brief overview of this procedure..."
                rows={2}
                data-testid="input-playbook-description"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Steps</label>
                <Button variant="ghost" size="sm" onClick={addStep} data-testid="button-add-step">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Step
                </Button>
              </div>

              {newSteps.map((step, index) => (
                <StepEditor
                  key={index}
                  step={step}
                  index={index}
                  totalSteps={newSteps.length}
                  rooms={rooms}
                  onUpdate={(updates) => updateStep(index, updates)}
                  onRemove={() => removeStep(index)}
                  testIdPrefix="input-step"
                />
              ))}
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditing(false);
                  resetForm();
                }}
                className="flex-1"
                data-testid="button-cancel-edit"
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpdate}
                disabled={updatePlaybookMutation.isPending}
                className="flex-1"
                data-testid="button-save-playbook"
              >
                {updatePlaybookMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        ) : isDetailLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-16" />
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {playbookDetail?.description && (
              <p className="text-muted-foreground" data-testid="text-playbook-description">
                {playbookDetail.description}
              </p>
            )}

            <div className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ListChecks className="h-4 w-4" />
                Steps ({playbookDetail?.steps?.length || 0})
              </h2>

              {playbookDetail?.steps?.map((step, index) => (
                <Card key={step.id} data-testid={`card-step-${index}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-medium flex items-center justify-center">
                        {step.stepNumber}
                      </span>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium">{step.title}</h3>
                        {step.description && (
                          <p className="text-sm text-muted-foreground mt-1">{step.description}</p>
                        )}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {step.estimatedMinutes && (
                            <Badge variant="outline">
                              {step.estimatedMinutes} min
                            </Badge>
                          )}
                          {step.actionType && (
                            <Badge variant="secondary">
                              {ACTION_TYPES.find(a => a.value === step.actionType)?.label || step.actionType}
                            </Badge>
                          )}
                          {step.roomId && (
                            <Badge variant="secondary">
                              {rooms.find(r => r.id === step.roomId)?.name || "Room"}
                            </Badge>
                          )}
                          {step.verificationMethod && step.verificationMethod !== "NONE" && (
                            <Badge variant="outline">
                              {VERIFICATION_METHODS.find(m => m.value === step.verificationMethod)?.label}
                            </Badge>
                          )}
                          {step.isParallelizable && (
                            <Badge variant="outline">Parallelizable</Badge>
                          )}
                        </div>
                        {step.targetSurface && (
                          <p className="text-xs text-muted-foreground mt-1">Surface: {step.targetSurface}</p>
                        )}
                        {step.toolsRequired && (step.toolsRequired as string[]).length > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5">Tools: {(step.toolsRequired as string[]).join(", ")}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {(!playbookDetail?.steps || playbookDetail.steps.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Steps will appear here once added.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="px-4 py-6 pb-28 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-light tracking-tight">Playbooks</h1>
          <p className="text-sm text-muted-foreground">Standard operating procedures</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-playbook">
          <Plus className="h-4 w-4 mr-2" />
          New Playbook
        </Button>
      </div>

      {!playbooks || playbooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <HandledIllustration size={56} className="mb-5 opacity-40" />
          <h3 className="font-display text-xl font-light tracking-tight text-foreground mb-1.5">No playbooks yet</h3>
          <p className="text-sm text-muted-foreground max-w-[300px] leading-relaxed mb-5">
            Standard procedures for your household will be kept here.
          </p>
          <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-first-playbook">
            <Plus className="h-4 w-4 mr-2" />
            Create Playbook
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {playbooks.map((playbook) => (
            <Card
              key={playbook.id}
              className="hover-elevate active-elevate-2 cursor-pointer"
              onClick={() => setSelectedPlaybook(playbook)}
              data-testid={`card-playbook-${playbook.id}`}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BookOpen className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium truncate">{playbook.title}</h3>
                  {playbook.description && (
                    <p className="text-sm text-muted-foreground truncate">{playbook.description}</p>
                  )}
                </div>
                {playbook.category && (
                  <Badge variant="secondary" className="flex-shrink-0">
                    {CATEGORIES.find(c => c.value === playbook.category)?.label || playbook.category}
                  </Badge>
                )}
                <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Playbook</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                value={newPlaybook.title}
                onChange={(e) => setNewPlaybook({ ...newPlaybook, title: e.target.value })}
                placeholder="e.g., Weekly Deep Clean"
                data-testid="input-new-playbook-title"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Category</label>
              <Select
                value={newPlaybook.category}
                onValueChange={(v) => setNewPlaybook({ ...newPlaybook, category: v })}
              >
                <SelectTrigger data-testid="select-new-playbook-category">
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

            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={newPlaybook.description}
                onChange={(e) => setNewPlaybook({ ...newPlaybook, description: e.target.value })}
                placeholder="Brief overview of this procedure..."
                rows={2}
                data-testid="input-new-playbook-description"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Steps</label>
                <Button variant="ghost" size="sm" onClick={addStep} data-testid="button-add-new-step">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Step
                </Button>
              </div>

              {newSteps.map((step, index) => (
                <StepEditor
                  key={index}
                  step={step}
                  index={index}
                  totalSteps={newSteps.length}
                  rooms={rooms}
                  onUpdate={(updates) => updateStep(index, updates)}
                  onRemove={() => removeStep(index)}
                  testIdPrefix="input-new-step"
                />
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                resetForm();
              }}
              data-testid="button-cancel-create"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createPlaybookMutation.isPending}
              data-testid="button-submit-playbook"
            >
              {createPlaybookMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
