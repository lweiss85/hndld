import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest, versionedUrl } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Building2, 
  Plus, 
  Home, 
  Users,
  ChevronRight,
  Settings,
  ArrowLeft
} from "lucide-react";
import { Link } from "wouter";
import type { Organization, Household } from "@shared/schema";

const createOrgSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
});

const createHouseholdSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
});

type CreateOrgForm = z.infer<typeof createOrgSchema>;
type CreateHouseholdForm = z.infer<typeof createHouseholdSchema>;

function CreateOrganizationDialog() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  
  const form = useForm<CreateOrgForm>({
    resolver: zodResolver(createOrgSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateOrgForm) => {
      return apiRequest("POST", "/api/organizations", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      toast({ title: "Organization created successfully" });
      setOpen(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Failed to create organization", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="button-create-org">
          <Plus className="h-4 w-4 mr-1" />
          New Organization
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Organization</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Organization Name</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="e.g., Smith Family Services" 
                      data-testid="input-org-name"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Brief description of this organization"
                      data-testid="input-org-description"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-org">
                {createMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function OrganizationCard({ org }: { org: Organization }) {
  const [expanded, setExpanded] = useState(false);
  const [showAddHousehold, setShowAddHousehold] = useState(false);
  const { toast } = useToast();

  const { data: households = [], isLoading } = useQuery<Household[]>({
    queryKey: ["/api/organizations", org.id, "households"],
    queryFn: async () => {
      const res = await fetch(versionedUrl(`/api/organizations/${org.id}/households`), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch households");
      return res.json();
    },
    enabled: expanded,
  });

  const householdForm = useForm<CreateHouseholdForm>({
    resolver: zodResolver(createHouseholdSchema),
    defaultValues: { name: "" },
  });

  const createHouseholdMutation = useMutation({
    mutationFn: async (data: CreateHouseholdForm) => {
      return apiRequest("POST", `/api/organizations/${org.id}/households`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", org.id, "households"] });
      toast({ title: "Household created successfully" });
      setShowAddHousehold(false);
      householdForm.reset();
    },
    onError: () => {
      toast({ title: "Failed to create household", variant: "destructive" });
    },
  });

  const statusColor = {
    ACTIVE: "bg-success-muted text-success-muted-foreground border-success/20",
    SUSPENDED: "bg-destructive-muted text-destructive-muted-foreground border-destructive/20",
    TRIAL: "bg-warning-muted text-warning-muted-foreground border-warning/20",
  };

  return (
    <Card 
      className="overflow-visible"
      data-testid={`card-org-${org.id}`}
    >
      <CardContent className="p-4">
        <div 
          className="flex items-center gap-4 cursor-pointer hover-elevate rounded-md p-2 -m-2"
          onClick={() => setExpanded(!expanded)}
          data-testid={`button-expand-org-${org.id}`}
        >
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-lg">{org.name}</h3>
              <Badge variant="outline" className={statusColor[org.status as keyof typeof statusColor]}>
                {org.status}
              </Badge>
            </div>
            {org.description && (
              <p className="text-sm text-muted-foreground line-clamp-1">{org.description}</p>
            )}
          </div>
          <ChevronRight className={`h-5 w-5 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Home className="h-4 w-4" />
                <span>Households ({isLoading ? "..." : households.length}/{org.maxHouseholds})</span>
              </div>
              <Button 
                size="sm" 
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAddHousehold(true);
                }}
                data-testid={`button-add-household-${org.id}`}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Household
              </Button>
            </div>

            {showAddHousehold && (
              <Card className="bg-muted/50">
                <CardContent className="p-4">
                  <Form {...householdForm}>
                    <form 
                      onSubmit={householdForm.handleSubmit((data) => createHouseholdMutation.mutate(data))} 
                      className="space-y-3"
                    >
                      <FormField
                        control={householdForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Household Name</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="e.g., Johnson Residence" 
                                data-testid="input-household-name"
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex justify-end gap-2">
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setShowAddHousehold(false)}
                        >
                          Cancel
                        </Button>
                        <Button 
                          type="submit" 
                          size="sm"
                          disabled={createHouseholdMutation.isPending}
                          data-testid="button-submit-household"
                        >
                          {createHouseholdMutation.isPending ? "Creating..." : "Create"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            )}

            {isLoading ? (
              <div className="text-center py-4 text-muted-foreground">Loading households...</div>
            ) : households.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                No households yet. Add your first household to get started.
              </div>
            ) : (
              <div className="space-y-2">
                {households.map((household) => (
                  <div 
                    key={household.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover-elevate cursor-pointer"
                    data-testid={`card-household-${household.id}`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center">
                      <Home className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{household.name}</p>
                    </div>
                    <Button size="icon" variant="ghost">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Organizations() {
  const { data: organizations = [], isLoading } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
  });

  return (
    <div className="px-4 py-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Link href="/settings">
          <Button size="icon" variant="ghost" data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Organizations</h1>
          <p className="text-sm text-muted-foreground">Manage your organizations and households</p>
        </div>
        <CreateOrganizationDialog />
      </div>

      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-lg" data-testid="text-org-count">
                {isLoading ? "Loading..." : `${organizations.length} Organization${organizations.length !== 1 ? "s" : ""}`}
              </h2>
              <p className="text-sm text-muted-foreground">
                Multi-household management for professional assistants
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading organizations...</div>
      ) : organizations.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-2">No Organizations Yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first organization to manage multiple households under one umbrella.
            </p>
            <CreateOrganizationDialog />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {organizations.map((org) => (
            <OrganizationCard key={org.id} org={org} />
          ))}
        </div>
      )}
    </div>
  );
}
