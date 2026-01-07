import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { 
  Plus, 
  BookOpen,
  ListChecks,
  ChevronRight,
  X,
  GripVertical,
  Edit2,
  Trash2,
  ArrowLeft
} from "lucide-react";
import type { Playbook, PlaybookStep } from "@shared/schema";
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

interface PlaybookWithSteps extends Playbook {
  steps?: PlaybookStep[];
}

interface StepInput {
  title: string;
  description: string | null;
  estimatedMinutes: number | null;
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
    setNewSteps([...newSteps, { title: "", description: null, estimatedMinutes: null }]);
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
                <Card key={index} className="relative">
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-muted-foreground min-w-[24px]">
                        {index + 1}.
                      </span>
                      <Input
                        value={step.title}
                        onChange={(e) => updateStep(index, { title: e.target.value })}
                        placeholder="Step title"
                        className="flex-1"
                        data-testid={`input-step-title-${index}`}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeStep(index)}
                        data-testid={`button-remove-step-${index}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <Input
                      value={step.description || ""}
                      onChange={(e) => updateStep(index, { description: e.target.value || null })}
                      placeholder="Additional details (optional)"
                      className="ml-8"
                      data-testid={`input-step-description-${index}`}
                    />
                    <div className="ml-8">
                      <Input
                        type="number"
                        value={step.estimatedMinutes || ""}
                        onChange={(e) => updateStep(index, { estimatedMinutes: e.target.value ? parseInt(e.target.value) : null })}
                        placeholder="Minutes (optional)"
                        className="w-32"
                        data-testid={`input-step-minutes-${index}`}
                      />
                    </div>
                  </CardContent>
                </Card>
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
                        {step.estimatedMinutes && (
                          <Badge variant="outline" className="mt-2">
                            {step.estimatedMinutes} min
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {(!playbookDetail?.steps || playbookDetail.steps.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No steps defined yet. Click edit to add steps.
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
          <h1 className="text-2xl font-semibold">Playbooks</h1>
          <p className="text-sm text-muted-foreground">Standard operating procedures</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-playbook">
          <Plus className="h-4 w-4 mr-2" />
          New Playbook
        </Button>
      </div>

      {!playbooks || playbooks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Playbooks Yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first playbook to document household procedures
            </p>
            <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-first-playbook">
              <Plus className="h-4 w-4 mr-2" />
              Create Playbook
            </Button>
          </CardContent>
        </Card>
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
                <div key={index} className="flex items-start gap-2 p-3 border rounded-md">
                  <span className="text-sm font-medium text-muted-foreground min-w-[24px] mt-2">
                    {index + 1}.
                  </span>
                  <div className="flex-1 space-y-2">
                    <Input
                      value={step.title}
                      onChange={(e) => updateStep(index, { title: e.target.value })}
                      placeholder="Step title"
                      data-testid={`input-new-step-title-${index}`}
                    />
                    <Input
                      value={step.description || ""}
                      onChange={(e) => updateStep(index, { description: e.target.value || null })}
                      placeholder="Details (optional)"
                      data-testid={`input-new-step-description-${index}`}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeStep(index)}
                    data-testid={`button-remove-new-step-${index}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
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
