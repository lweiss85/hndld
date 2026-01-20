import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
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
  Sparkles,
  Clock,
  DollarSign,
  Pencil,
  Trash2,
  GripVertical
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PageTransition, StaggeredList } from "@/components/juice";

interface AddonService {
  id: string;
  name: string;
  description?: string | null;
  priceInCents: number;
  estimatedMinutes?: number | null;
  category?: string | null;
  sortOrder: number;
  isActive: boolean;
}

const ADDON_CATEGORIES = [
  "Deep Clean",
  "Specialty",
  "Organization",
  "Laundry",
  "Kitchen",
  "Outdoor",
  "Other",
];

function ManageAddonsSkeleton() {
  return (
    <div className="px-4 py-6 space-y-4 max-w-4xl mx-auto">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-64" />
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-24" />
      ))}
    </div>
  );
}

export default function ManageAddons() {
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [editingAddon, setEditingAddon] = useState<AddonService | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    priceInCents: "",
    estimatedMinutes: "",
    category: "",
  });

  const { data: addons, isLoading } = useQuery<AddonService[]>({
    queryKey: ["/api/addon-services"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/addon-services", {
        ...data,
        priceInCents: Math.round(parseFloat(data.priceInCents) * 100),
        estimatedMinutes: data.estimatedMinutes ? parseInt(data.estimatedMinutes, 10) : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/addon-services"] });
      closeDialog();
      toast({ title: "Add-on created", description: "The add-on service has been added" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create add-on", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      return apiRequest("PATCH", `/api/addon-services/${id}`, {
        ...data,
        priceInCents: Math.round(parseFloat(data.priceInCents) * 100),
        estimatedMinutes: data.estimatedMinutes ? parseInt(data.estimatedMinutes, 10) : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/addon-services"] });
      closeDialog();
      toast({ title: "Add-on updated", description: "Changes have been saved" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update add-on", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/addon-services/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/addon-services"] });
      toast({ title: "Add-on removed", description: "The add-on service has been removed" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove add-on", variant: "destructive" });
    },
  });

  const closeDialog = () => {
    setShowDialog(false);
    setEditingAddon(null);
    setFormData({
      name: "",
      description: "",
      priceInCents: "",
      estimatedMinutes: "",
      category: "",
    });
  };

  const openCreateDialog = () => {
    setEditingAddon(null);
    setFormData({
      name: "",
      description: "",
      priceInCents: "",
      estimatedMinutes: "",
      category: "",
    });
    setShowDialog(true);
  };

  const openEditDialog = (addon: AddonService) => {
    setEditingAddon(addon);
    setFormData({
      name: addon.name,
      description: addon.description || "",
      priceInCents: (addon.priceInCents / 100).toFixed(2),
      estimatedMinutes: addon.estimatedMinutes?.toString() || "",
      category: addon.category || "",
    });
    setShowDialog(true);
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.priceInCents) {
      toast({ title: "Missing fields", description: "Name and price are required", variant: "destructive" });
      return;
    }

    if (editingAddon) {
      updateMutation.mutate({ id: editingAddon.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (addon: AddonService) => {
    if (confirm(`Remove "${addon.name}" from your add-on services?`)) {
      deleteMutation.mutate(addon.id);
    }
  };

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  if (isLoading) return <ManageAddonsSkeleton />;

  const groupedAddons = addons?.reduce((acc, addon) => {
    const category = addon.category || "Other";
    if (!acc[category]) acc[category] = [];
    acc[category].push(addon);
    return acc;
  }, {} as Record<string, AddonService[]>);

  return (
    <PageTransition>
      <div className="px-4 py-6 space-y-6 max-w-4xl mx-auto pb-24">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Add-on Services</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage extra services clients can request with their cleaning
            </p>
          </div>
          <Button size="sm" onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>

        {!addons?.length ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <Sparkles className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="font-medium mb-2">No add-on services yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create add-on services that clients can request with their cleanings
              </p>
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-1" />
                Create your first add-on
              </Button>
            </CardContent>
          </Card>
        ) : (
          <StaggeredList className="space-y-6">
            {Object.entries(groupedAddons || {}).map(([category, categoryAddons]) => (
              <div key={category} className="space-y-3">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  {category}
                </h2>
                <div className="space-y-2">
                  {categoryAddons.map((addon) => (
                    <Card key={addon.id} className="overflow-hidden">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="text-muted-foreground/50 cursor-move">
                            <GripVertical className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h3 className="font-medium">{addon.name}</h3>
                                {addon.description && (
                                  <p className="text-sm text-muted-foreground mt-0.5">
                                    {addon.description}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => openEditDialog(addon)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => handleDelete(addon)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 mt-2 text-sm">
                              <span className="flex items-center gap-1 font-medium text-ink-navy">
                                <DollarSign className="h-3.5 w-3.5" />
                                {formatPrice(addon.priceInCents)}
                              </span>
                              {addon.estimatedMinutes && (
                                <span className="flex items-center gap-1 text-muted-foreground">
                                  <Clock className="h-3.5 w-3.5" />
                                  {addon.estimatedMinutes} min
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </StaggeredList>
        )}

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingAddon ? "Edit Add-on Service" : "New Add-on Service"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Inside Fridge Cleaning"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Brief description of what's included..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price">Price *</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      className="pl-9"
                      value={formData.priceInCents}
                      onChange={(e) => setFormData({ ...formData, priceInCents: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time">Est. Time (min)</Label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="time"
                      type="number"
                      min="0"
                      placeholder="30"
                      className="pl-9"
                      value={formData.estimatedMinutes}
                      onChange={(e) => setFormData({ ...formData, estimatedMinutes: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({ ...formData, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {ADDON_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button 
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingAddon ? "Save Changes" : "Create Add-on"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}
