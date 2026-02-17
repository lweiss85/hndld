import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
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
  Plus, 
  Phone, 
  Mail,
  User,
  Building,
  Search
} from "lucide-react";
import type { Vendor, InsertVendor } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PageTransition, StaggeredList } from "@/components/juice";

const VENDOR_CATEGORIES = [
  "Plumber",
  "Electrician",
  "HVAC",
  "Landscaping",
  "Cleaning",
  "Pool Service",
  "Pest Control",
  "Handyman",
  "Other",
];

function VendorsSkeleton() {
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

export default function Vendors() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [newVendor, setNewVendor] = useState<Partial<InsertVendor>>({
    name: "",
    phone: "",
    email: "",
    category: "",
    notes: "",
  });

  const { data: vendors, isLoading } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
  });

  const createVendorMutation = useMutation({
    mutationFn: async (data: Partial<InsertVendor>) => {
      return apiRequest("POST", "/api/vendors", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      setShowCreateDialog(false);
      setNewVendor({
        name: "",
        phone: "",
        email: "",
        category: "",
        notes: "",
      });
      toast({
        title: "Vendor added",
        description: "Your vendor has been saved",
      });
    },
  });

  if (isLoading) return <VendorsSkeleton />;

  const filteredVendors = vendors?.filter(v => 
    v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupedVendors = filteredVendors?.reduce((acc, vendor) => {
    const category = vendor.category || "Other";
    if (!acc[category]) acc[category] = [];
    acc[category].push(vendor);
    return acc;
  }, {} as Record<string, Vendor[]>);

  return (
    <PageTransition>
    <div className="px-4 py-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4 animate-fade-in-up">
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Vendors</h1>
        <Button size="sm" onClick={() => setShowCreateDialog(true)} data-testid="button-add-vendor">
          <Plus aria-hidden="true" className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>

      <div className="relative">
        <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search vendors..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
          aria-label="Search vendors"
          data-testid="input-search-vendors"
        />
      </div>

      {filteredVendors?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Building aria-hidden="true" className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-medium text-lg mb-1">No vendors yet</h3>
          <p className="text-sm text-muted-foreground">
            Add your household service providers
          </p>
        </div>
      ) : (
        <div className="space-y-6" aria-label="Vendor list" role="region">
          {Object.entries(groupedVendors || {}).map(([category, categoryVendors]) => (
            <div key={category} className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                {category}
              </h2>
              {categoryVendors.map((vendor) => (
                <Card 
                  key={vendor.id} 
                  className="hover-elevate cursor-pointer"
                  onClick={() => setSelectedVendor(vendor)}
                  data-testid={`card-vendor-${vendor.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <User aria-hidden="true" className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium">{vendor.name}</h3>
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
                          {vendor.phone && (
                            <span className="flex items-center gap-1">
                              <Phone aria-hidden="true" className="h-3 w-3" />
                              {vendor.phone}
                            </span>
                          )}
                          {vendor.email && (
                            <span className="flex items-center gap-1">
                              <Mail aria-hidden="true" className="h-3 w-3" />
                              {vendor.email}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ))}
        </div>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Vendor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Vendor name"
              value={newVendor.name || ""}
              onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })}
              aria-label="Vendor name"
              data-testid="input-vendor-name"
            />
            
            <Input
              placeholder="Phone number"
              type="tel"
              value={newVendor.phone || ""}
              onChange={(e) => setNewVendor({ ...newVendor, phone: e.target.value })}
              aria-label="Phone number"
              data-testid="input-vendor-phone"
            />

            <Input
              placeholder="Email"
              type="email"
              value={newVendor.email || ""}
              onChange={(e) => setNewVendor({ ...newVendor, email: e.target.value })}
              aria-label="Email"
              data-testid="input-vendor-email"
            />

            <div>
              <label className="text-sm font-medium mb-2 block">Category</label>
              <div className="flex flex-wrap gap-2">
                {VENDOR_CATEGORIES.map((cat) => (
                  <Button
                    key={cat}
                    variant={newVendor.category === cat ? "default" : "outline"}
                    size="sm"
                    onClick={() => setNewVendor({ ...newVendor, category: cat })}
                    data-testid={`button-category-${cat.toLowerCase()}`}
                  >
                    {cat}
                  </Button>
                ))}
              </div>
            </div>

            <Textarea
              placeholder="Notes (optional)"
              value={newVendor.notes || ""}
              onChange={(e) => setNewVendor({ ...newVendor, notes: e.target.value })}
              rows={2}
              aria-label="Notes"
              data-testid="input-vendor-notes"
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() => createVendorMutation.mutate(newVendor)}
              disabled={!newVendor.name || createVendorMutation.isPending}
              className="w-full"
              data-testid="button-save-vendor"
            >
              Save Vendor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedVendor} onOpenChange={() => setSelectedVendor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedVendor?.name}</DialogTitle>
          </DialogHeader>
          {selectedVendor && (
            <div className="space-y-4">
              {selectedVendor.category && (
                <Badge variant="secondary">{selectedVendor.category}</Badge>
              )}
              
              {selectedVendor.phone && (
                <a 
                  href={`tel:${selectedVendor.phone}`}
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  aria-label={`Call ${selectedVendor.name} at ${selectedVendor.phone}`}
                >
                  <Phone aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
                  <span>{selectedVendor.phone}</span>
                </a>
              )}

              {selectedVendor.email && (
                <a 
                  href={`mailto:${selectedVendor.email}`}
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  aria-label={`Email ${selectedVendor.name} at ${selectedVendor.email}`}
                >
                  <Mail aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
                  <span>{selectedVendor.email}</span>
                </a>
              )}

              {selectedVendor.notes && (
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">{selectedVendor.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </PageTransition>
  );
}
