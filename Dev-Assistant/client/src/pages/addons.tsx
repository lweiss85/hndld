import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { 
  Sparkles, 
  Plus, 
  Clock, 
  CalendarDays,
} from "lucide-react";
import { format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PageTransition, StaggeredList } from "@/components/juice";

interface AddonService {
  id: string;
  name: string;
  description?: string;
  priceInCents: number;
  estimatedMinutes?: number;
  category?: string;
}

interface CleaningVisit {
  id: string;
  scheduledAt: string;
  status: string;
}

interface PendingAddon {
  id: string;
  title: string;
  amount?: number;
  status: string;
  createdAt: string;
}

function AddonsSkeleton() {
  return (
    <div className="px-4 py-6 space-y-4 max-w-4xl mx-auto">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-24 w-full" />
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    </div>
  );
}

export default function Addons() {
  const { toast } = useToast();
  const [selectedAddon, setSelectedAddon] = useState<AddonService | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const { data: addons, isLoading: addonsLoading } = useQuery<AddonService[]>({
    queryKey: ["/api/addon-services"],
  });

  const { data: nextVisit } = useQuery<CleaningVisit>({
    queryKey: ["/api/cleaning/next"],
  });

  const { data: pendingAddons } = useQuery<PendingAddon[]>({
    queryKey: ["/api/approvals"],
    select: (data) => data?.filter((a: any) => a.status === "PENDING" && a.title?.startsWith("Add-on:")) || [],
  });

  const requestAddonMutation = useMutation({
    mutationFn: async (addon: AddonService) => {
      return apiRequest("POST", "/api/approvals", {
        title: `Add-on: ${addon.name}`,
        details: addon.description || `Request for ${addon.name} add-on service`,
        amount: addon.priceInCents,
        metadata: { addonId: addon.id, type: "ADDON" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      setShowConfirmDialog(false);
      setSelectedAddon(null);
      toast({
        title: "Add-on requested",
        description: "Your cleaning team will be notified.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to request add-on. Please try again.",
        variant: "destructive",
      });
    },
  });

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  const handleAddonClick = (addon: AddonService) => {
    setSelectedAddon(addon);
    setShowConfirmDialog(true);
  };

  if (addonsLoading) return <AddonsSkeleton />;

  const defaultAddons: AddonService[] = [
    { id: "1", name: "Deep Clean Refrigerator", description: "Interior shelves, drawers, and seals", priceInCents: 2500, estimatedMinutes: 30 },
    { id: "2", name: "Interior Windows", description: "All accessible interior windows", priceInCents: 4000, estimatedMinutes: 45 },
    { id: "3", name: "Oven Cleaning", description: "Deep clean oven interior and racks", priceInCents: 3000, estimatedMinutes: 30 },
    { id: "4", name: "Inside Cabinets", description: "Wipe down cabinet interiors", priceInCents: 3500, estimatedMinutes: 40 },
    { id: "5", name: "Laundry Service", description: "Wash, dry, and fold one load", priceInCents: 2000, estimatedMinutes: 60 },
    { id: "6", name: "Change Bed Linens", description: "Strip and remake beds with fresh linens", priceInCents: 1500, estimatedMinutes: 15 },
    { id: "7", name: "Baseboards", description: "Wipe down all baseboards", priceInCents: 2500, estimatedMinutes: 30 },
    { id: "8", name: "Organize Pantry", description: "Organize and tidy pantry shelves", priceInCents: 4000, estimatedMinutes: 45 },
  ];

  const displayAddons = addons && addons.length > 0 ? addons : defaultAddons;

  return (
    <PageTransition>
      <div className="px-4 py-6 space-y-6 max-w-4xl mx-auto pb-24">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Add-ons</h1>
        </div>

        {nextVisit && (
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <CalendarDays className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">Next Cleaning</p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(nextVisit.scheduledAt), "EEEE, MMMM d 'at' h:mm a")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {pendingAddons && pendingAddons.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Pending Requests ({pendingAddons.length})
            </h2>
            <StaggeredList className="space-y-2">
              {pendingAddons.map((addon) => (
                <Card key={addon.id} className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-amber-600" />
                        <span className="font-medium text-sm">{addon.title.replace("Add-on: ", "")}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {addon.amount && (
                          <span className="text-sm font-medium">{formatPrice(addon.amount)}</span>
                        )}
                        <Badge variant="secondary" className="text-xs">Pending</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </StaggeredList>
          </div>
        )}

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Available Add-ons
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {displayAddons.map((addon) => (
              <Card 
                key={addon.id}
                className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all active:scale-[0.98]"
                onClick={() => handleAddonClick(addon)}
                data-testid={`addon-card-${addon.id}`}
              >
                <CardContent className="p-4">
                  <div className="space-y-2">
                    <h3 className="font-medium text-sm leading-tight">{addon.name}</h3>
                    {addon.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{addon.description}</p>
                    )}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-lg font-bold text-primary">{formatPrice(addon.priceInCents)}</span>
                      {addon.estimatedMinutes && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {addon.estimatedMinutes}m
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Add to Next Cleaning?</DialogTitle>
              <DialogDescription>
                {selectedAddon?.name}
              </DialogDescription>
            </DialogHeader>
            
            {selectedAddon && (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Price</span>
                    <span className="text-xl font-bold">{formatPrice(selectedAddon.priceInCents)}</span>
                  </div>
                  {selectedAddon.estimatedMinutes && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Est. time</span>
                      <span className="text-sm">{selectedAddon.estimatedMinutes} minutes</span>
                    </div>
                  )}
                </div>
                
                {selectedAddon.description && (
                  <p className="text-sm text-muted-foreground">{selectedAddon.description}</p>
                )}
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setShowConfirmDialog(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => selectedAddon && requestAddonMutation.mutate(selectedAddon)}
                disabled={requestAddonMutation.isPending}
              >
                {requestAddonMutation.isPending ? (
                  "Adding..."
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-1" />
                    Add to Cleaning
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}
