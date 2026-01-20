# Cleaning Client Fix - Drop-in Code

## STEP 1: Schema Additions
**File: `shared/schema.ts`**

Add these AFTER your existing enums (around line 37):

```typescript
// Service type enum - ADD THIS
export const serviceTypeEnum = pgEnum("service_type", ["PA", "CLEANING"]);
```

Add this field to your `households` table (around line 58):

```typescript
export const households = pgTable("households", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  organizationId: varchar("organization_id").references(() => organizations.id),
  serviceType: serviceTypeEnum("service_type").default("PA").notNull(), // ADD THIS LINE
  createdAt: timestamp("created_at").defaultNow(),
});
```

Add this NEW table at the end of your schema (before the relations section):

```typescript
// Add-on Services Catalog (for cleaning service type)
export const addonServices = pgTable("addon_services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").references(() => organizations.id),
  householdId: varchar("household_id").references(() => households.id),
  name: text("name").notNull(),
  description: text("description"),
  priceInCents: integer("price_in_cents").notNull(),
  estimatedMinutes: integer("estimated_minutes"),
  category: text("category").default("general"),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("addon_services_household_idx").on(table.householdId),
  index("addon_services_org_idx").on(table.organizationId),
]);

// Cleaning visits tracking
export const cleaningVisits = pgTable("cleaning_visits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  householdId: varchar("household_id").references(() => households.id).notNull(),
  scheduledAt: timestamp("scheduled_at").notNull(),
  completedAt: timestamp("completed_at"),
  status: text("status").default("SCHEDULED").notNull(), // SCHEDULED, IN_PROGRESS, COMPLETED, CANCELLED
  notes: text("notes"),
  rating: integer("rating"), // 1-5
  feedback: text("feedback"),
  cleanerName: text("cleaner_name"),
  beforePhotos: jsonb("before_photos").$type<string[]>().default([]),
  afterPhotos: jsonb("after_photos").$type<string[]>().default([]),
  addonsRequested: jsonb("addons_requested").$type<string[]>().default([]),
  totalPriceInCents: integer("total_price_in_cents"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("cleaning_visits_household_idx").on(table.householdId),
  index("cleaning_visits_scheduled_idx").on(table.scheduledAt),
]);

export type AddonService = typeof addonServices.$inferSelect;
export type InsertAddonService = typeof addonServices.$inferInsert;
export type CleaningVisit = typeof cleaningVisits.$inferSelect;
export type InsertCleaningVisit = typeof cleaningVisits.$inferInsert;
```

After adding, run: `npm run db:push`

---

## STEP 2: Service Type Hook
**File: `client/src/hooks/use-service-type.ts`** (CREATE NEW FILE)

```typescript
import { useQuery } from "@tanstack/react-query";

interface HouseholdData {
  id: string;
  name: string;
  serviceType: "PA" | "CLEANING";
}

export function useServiceType() {
  const { data: household } = useQuery<HouseholdData>({
    queryKey: ["/api/household"],
  });

  return {
    serviceType: household?.serviceType || "PA",
    isCleaning: household?.serviceType === "CLEANING",
    isPA: household?.serviceType !== "CLEANING",
    isLoading: !household,
  };
}
```

---

## STEP 3: Update Bottom Nav
**File: `client/src/components/layout/bottom-nav.tsx`**

Replace the entire file with:

```typescript
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useUser } from "@/lib/user-context";
import { useServiceType } from "@/hooks/use-service-type";
import { usePendingInvoices } from "@/hooks/usePendingInvoices";
import { 
  Calendar, 
  CheckSquare, 
  ClipboardList, 
  Home, 
  Building2, 
  Clock,
  FileText,
  Mail,
  Receipt,
  CreditCard,
  Sparkles,
  CalendarDays
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PayNowSheet } from "@/components/pay-now-sheet";

interface NavItem {
  path: string;
  icon: React.ReactNode;
  label: string;
}

const assistantTabs: NavItem[] = [
  { path: "/", icon: <Clock className="h-5 w-5" />, label: "Today" },
  { path: "/tasks", icon: <ClipboardList className="h-5 w-5" />, label: "Tasks" },
  { path: "/calendar", icon: <Calendar className="h-5 w-5" />, label: "Calendar" },
  { path: "/spending", icon: <Receipt className="h-5 w-5" />, label: "Money" },
  { path: "/house", icon: <Building2 className="h-5 w-5" />, label: "House" },
];

// PA client tabs (original)
const paClientTabs: NavItem[] = [
  { path: "/", icon: <Home className="h-5 w-5" />, label: "Home" },
  { path: "/updates", icon: <FileText className="h-5 w-5" />, label: "Updates" },
  { path: "/approvals", icon: <CheckSquare className="h-5 w-5" />, label: "Approvals" },
  { path: "/spending", icon: <Receipt className="h-5 w-5" />, label: "Money" },
  { path: "/messages", icon: <Mail className="h-5 w-5" />, label: "Messages" },
];

// CLEANING client tabs (new)
const cleaningClientTabs: NavItem[] = [
  { path: "/", icon: <Home className="h-5 w-5" />, label: "Home" },
  { path: "/schedule", icon: <CalendarDays className="h-5 w-5" />, label: "Schedule" },
  { path: "/addons", icon: <Sparkles className="h-5 w-5" />, label: "Add-ons" },
  { path: "/spending", icon: <Receipt className="h-5 w-5" />, label: "Money" },
  { path: "/messages", icon: <Mail className="h-5 w-5" />, label: "Messages" },
];

export function BottomNav() {
  const [location] = useLocation();
  const { activeRole } = useUser();
  const { isCleaning } = useServiceType();
  const { data: pendingInvoices } = usePendingInvoices();
  const [showPaySheet, setShowPaySheet] = useState(false);

  // Choose tabs based on role AND service type
  const tabs = activeRole === "ASSISTANT" 
    ? assistantTabs 
    : isCleaning 
      ? cleaningClientTabs 
      : paClientTabs;

  const hasUnpaidInvoices = activeRole === "CLIENT" && pendingInvoices && pendingInvoices.count > 0;

  useEffect(() => {
    if (hasUnpaidInvoices) {
      document.documentElement.style.setProperty("--hndld-bottom-pad", "8rem");
    } else {
      document.documentElement.style.setProperty("--hndld-bottom-pad", "5rem");
    }
  }, [hasUnpaidInvoices]);

  const handleTabClick = () => {
    if (navigator.vibrate) {
      navigator.vibrate(8);
    }
  };

  const formatAmount = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  return (
    <>
      <nav 
        className="fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-t border-border/50 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        data-testid="bottom-nav"
      >
        {hasUnpaidInvoices && pendingInvoices && (
          <div className="px-4 py-2 animate-in slide-in-from-bottom-2 fade-in duration-300">
            <Button
              onClick={() => setShowPaySheet(true)}
              className="w-full h-12 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/25 font-semibold text-base"
              data-testid="button-pay-now-cta"
            >
              <CreditCard className="h-5 w-5 mr-2" />
              Pay {formatAmount(pendingInvoices.totalAmount)}
              {pendingInvoices.count > 1 && (
                <Badge variant="secondary" className="ml-2 bg-white/20 text-white border-0">
                  {pendingInvoices.count} invoices
                </Badge>
              )}
            </Button>
          </div>
        )}
        
        <div className="flex items-center justify-around h-14 px-1">
          {tabs.map((tab) => {
            const isActive = location === tab.path || 
              (tab.path !== "/" && location.startsWith(tab.path));
            
            return (
              <Link key={tab.path} href={tab.path} className="flex-1">
                <button
                  onClick={handleTabClick}
                  className={cn(
                    "relative flex flex-col items-center justify-center gap-0.5 py-1.5 w-full min-h-[44px] transition-all duration-200",
                    isActive ? "text-foreground" : "text-muted-foreground"
                  )}
                  data-testid={`button-nav-${tab.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {isActive && (
                    <div className="absolute inset-1 bg-primary/10 rounded-xl" />
                  )}
                  <span className={cn(
                    "relative z-10 transition-transform duration-200",
                    isActive && "scale-110"
                  )}>
                    {tab.icon}
                  </span>
                  <span className={cn(
                    "relative z-10 text-[10px] whitespace-nowrap",
                    isActive ? "font-semibold" : "font-normal"
                  )}>
                    {tab.label}
                  </span>
                </button>
              </Link>
            );
          })}
        </div>
      </nav>

      {hasUnpaidInvoices && pendingInvoices?.latestInvoiceId && (
        <PayNowSheet
          open={showPaySheet}
          onOpenChange={setShowPaySheet}
          spendingId={pendingInvoices.latestInvoiceId}
          vendorName={pendingInvoices.latestInvoiceTitle || "Invoice"}
        />
      )}
    </>
  );
}
```

---

## STEP 4: Add-ons Page (for Cleaning Clients)
**File: `client/src/pages/addons.tsx`** (CREATE NEW FILE)

```typescript
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Check, 
  Clock, 
  DollarSign,
  CalendarDays,
  CheckCircle2,
  X
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

  // Fetch available add-on services
  const { data: addons, isLoading: addonsLoading } = useQuery<AddonService[]>({
    queryKey: ["/api/addon-services"],
  });

  // Fetch next scheduled cleaning
  const { data: nextVisit } = useQuery<CleaningVisit>({
    queryKey: ["/api/cleaning/next"],
  });

  // Fetch pending add-on requests (approvals with addon context)
  const { data: pendingAddons } = useQuery<PendingAddon[]>({
    queryKey: ["/api/approvals"],
    select: (data) => data?.filter((a: any) => a.status === "PENDING") || [],
  });

  // Request an add-on (creates an approval)
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

  // Default add-ons if none configured
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

        {/* Next Cleaning Card */}
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

        {/* Pending Add-ons */}
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

        {/* Available Add-ons */}
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

        {/* Confirmation Dialog */}
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
```

---

## STEP 5: Schedule Page (for Cleaning Clients)
**File: `client/src/pages/schedule.tsx`** (CREATE NEW FILE)

```typescript
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  CalendarDays, 
  Clock, 
  CheckCircle2, 
  Star,
  ChevronRight,
  Plus,
  Sparkles
} from "lucide-react";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { Link } from "wouter";
import { PageTransition, StaggeredList } from "@/components/juice";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CleaningVisit {
  id: string;
  scheduledAt: string;
  completedAt?: string;
  status: string;
  notes?: string;
  rating?: number;
  cleanerName?: string;
  addonsRequested?: string[];
  totalPriceInCents?: number;
}

function ScheduleSkeleton() {
  return (
    <div className="px-4 py-6 space-y-4 max-w-4xl mx-auto">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-6 w-32" />
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-24" />
      ))}
    </div>
  );
}

export default function Schedule() {
  const { toast } = useToast();

  const { data: visits, isLoading } = useQuery<CleaningVisit[]>({
    queryKey: ["/api/cleaning/visits"],
  });

  const requestExtraMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/requests", {
        title: "Request Extra Cleaning Visit",
        description: "I would like to schedule an additional cleaning visit.",
        category: "HOUSEHOLD",
        urgency: "MEDIUM",
      });
    },
    onSuccess: () => {
      toast({
        title: "Request sent",
        description: "Your cleaning team will reach out to schedule.",
      });
    },
  });

  if (isLoading) return <ScheduleSkeleton />;

  // Separate upcoming and past visits
  const now = new Date();
  const upcomingVisits = visits?.filter(v => !isPast(new Date(v.scheduledAt)) && v.status !== "COMPLETED") || [];
  const pastVisits = visits?.filter(v => v.status === "COMPLETED" || isPast(new Date(v.scheduledAt))) || [];
  const nextVisit = upcomingVisits[0];

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  return (
    <PageTransition>
      <div className="px-4 py-6 space-y-6 max-w-4xl mx-auto pb-24">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Schedule</h1>
        </div>

        {/* Next Cleaning - Hero Card */}
        {nextVisit ? (
          <Card className="overflow-hidden">
            <div className="bg-gradient-to-br from-primary/10 to-primary/5 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Next Cleaning</p>
                  <p className="text-2xl font-bold">
                    {format(new Date(nextVisit.scheduledAt), "EEEE")}
                  </p>
                  <p className="text-lg text-muted-foreground">
                    {format(new Date(nextVisit.scheduledAt), "MMMM d, yyyy")}
                  </p>
                  <p className="text-sm font-medium mt-2">
                    {format(new Date(nextVisit.scheduledAt), "h:mm a")}
                  </p>
                </div>
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <CalendarDays className="h-8 w-8 text-primary" />
                </div>
              </div>
              
              {nextVisit.cleanerName && (
                <p className="text-sm text-muted-foreground mt-4">
                  Cleaner: <span className="font-medium text-foreground">{nextVisit.cleanerName}</span>
                </p>
              )}
              
              <div className="flex gap-2 mt-4">
                <Button asChild className="flex-1">
                  <Link href="/addons">
                    <Sparkles className="h-4 w-4 mr-2" />
                    Add Services
                  </Link>
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-6 text-center">
              <CalendarDays className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
              <h3 className="font-medium mb-1">No upcoming cleanings</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Request a cleaning to get started
              </p>
              <Button 
                onClick={() => requestExtraMutation.mutate()}
                disabled={requestExtraMutation.isPending}
              >
                <Plus className="h-4 w-4 mr-2" />
                Request Cleaning
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <div className="flex gap-3">
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={() => requestExtraMutation.mutate()}
            disabled={requestExtraMutation.isPending}
          >
            <Plus className="h-4 w-4 mr-2" />
            Book Extra
          </Button>
          <Button variant="outline" className="flex-1" asChild>
            <Link href="/messages">
              <ChevronRight className="h-4 w-4 mr-2" />
              Message Team
            </Link>
          </Button>
        </div>

        {/* Upcoming Visits */}
        {upcomingVisits.length > 1 && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Upcoming ({upcomingVisits.length - 1} more)
            </h2>
            <StaggeredList className="space-y-2">
              {upcomingVisits.slice(1).map((visit) => (
                <Card key={visit.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                          <CalendarDays className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium">
                            {format(new Date(visit.scheduledAt), "EEE, MMM d")}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(visit.scheduledAt), "h:mm a")}
                          </p>
                        </div>
                      </div>
                      <Badge variant="secondary">Scheduled</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </StaggeredList>
          </div>
        )}

        {/* Past Visits */}
        {pastVisits.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Past Cleanings
            </h2>
            <StaggeredList className="space-y-2">
              {pastVisits.slice(0, 10).map((visit) => (
                <Card key={visit.id} className="opacity-80">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                          <p className="font-medium">
                            {format(new Date(visit.scheduledAt), "EEE, MMM d, yyyy")}
                          </p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            {visit.rating && (
                              <span className="flex items-center gap-1">
                                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                                {visit.rating}
                              </span>
                            )}
                            {visit.cleanerName && (
                              <span>{visit.cleanerName}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      {visit.totalPriceInCents && (
                        <span className="text-sm font-medium">
                          {formatPrice(visit.totalPriceInCents)}
                        </span>
                      )}
                    </div>
                    {visit.notes && (
                      <p className="text-sm text-muted-foreground mt-2 pl-13">
                        {visit.notes}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </StaggeredList>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
```

---

## STEP 6: Update App Router
**File: `client/src/App.tsx`**

Add imports at the top:
```typescript
import Addons from "@/pages/addons";
import Schedule from "@/pages/schedule";
```

Update `ClientRouter` to include new routes:
```typescript
function ClientRouter() {
  return (
    <Switch>
      <Route path="/" component={ThisWeek} />
      <Route path="/tasks" component={Tasks} />
      <Route path="/calendar" component={Calendar} />
      <Route path="/approvals" component={Approvals} />
      <Route path="/addons" component={Addons} />        {/* ADD THIS */}
      <Route path="/schedule" component={Schedule} />    {/* ADD THIS */}
      <Route path="/requests" component={Requests} />
      <Route path="/updates" component={Updates} />
      <Route path="/house" component={House} />
      <Route path="/vendors" component={Vendors} />
      <Route path="/spending" component={Spending} />
      <Route path="/playbooks" component={Playbooks} />
      <Route path="/messages" component={Messages} />
      <Route path="/files" component={Files} />
      <Route path="/emergency" component={Emergency} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/profile" component={HouseholdProfile} />
      <Route path="/payment-profile" component={PaymentProfile} />
      <Route component={NotFound} />
    </Switch>
  );
}
```

---

## STEP 7: Add API Routes
**File: `server/routes.ts`**

Add these routes (search for a good location, like near other household routes):

```typescript
// =============================================================================
// CLEANING SERVICE ROUTES
// =============================================================================

// Get household info including service type
app.get("/api/household", isAuthenticated, householdContext, async (req: any, res) => {
  try {
    const householdId = req.householdId;
    const household = await storage.getHousehold(householdId);
    res.json(household);
  } catch (error) {
    console.error("Error fetching household:", error);
    res.status(500).json({ message: "Failed to fetch household" });
  }
});

// Get add-on services catalog
app.get("/api/addon-services", isAuthenticated, householdContext, async (req: any, res) => {
  try {
    const householdId = req.householdId;
    const addons = await storage.getAddonServices(householdId);
    res.json(addons);
  } catch (error) {
    console.error("Error fetching addon services:", error);
    res.status(500).json({ message: "Failed to fetch addon services" });
  }
});

// Get next scheduled cleaning
app.get("/api/cleaning/next", isAuthenticated, householdContext, async (req: any, res) => {
  try {
    const householdId = req.householdId;
    const nextVisit = await storage.getNextCleaningVisit(householdId);
    res.json(nextVisit);
  } catch (error) {
    console.error("Error fetching next cleaning:", error);
    res.status(500).json({ message: "Failed to fetch next cleaning" });
  }
});

// Get all cleaning visits
app.get("/api/cleaning/visits", isAuthenticated, householdContext, async (req: any, res) => {
  try {
    const householdId = req.householdId;
    const visits = await storage.getCleaningVisits(householdId);
    res.json(visits);
  } catch (error) {
    console.error("Error fetching cleaning visits:", error);
    res.status(500).json({ message: "Failed to fetch cleaning visits" });
  }
});

// Create a cleaning visit (assistant only)
app.post("/api/cleaning/visits", isAuthenticated, householdContext, async (req: any, res) => {
  try {
    const householdId = req.householdId;
    const visit = await storage.createCleaningVisit({
      ...req.body,
      householdId,
    });
    res.json(visit);
  } catch (error) {
    console.error("Error creating cleaning visit:", error);
    res.status(500).json({ message: "Failed to create cleaning visit" });
  }
});

// Update a cleaning visit
app.patch("/api/cleaning/visits/:id", isAuthenticated, householdContext, async (req: any, res) => {
  try {
    const { id } = req.params;
    const visit = await storage.updateCleaningVisit(id, req.body);
    res.json(visit);
  } catch (error) {
    console.error("Error updating cleaning visit:", error);
    res.status(500).json({ message: "Failed to update cleaning visit" });
  }
});
```

---

## STEP 8: Add Storage Methods
**File: `server/storage.ts`**

Add these methods to your DatabaseStorage class:

```typescript
// Add these imports at the top if not present
import { addonServices, cleaningVisits, households } from "@shared/schema";

// Add these methods to the DatabaseStorage class:

async getHousehold(householdId: string) {
  const [household] = await db.select().from(households).where(eq(households.id, householdId));
  return household;
}

async getAddonServices(householdId: string) {
  // First try household-specific addons
  let addons = await db.select().from(addonServices)
    .where(and(
      eq(addonServices.householdId, householdId),
      eq(addonServices.isActive, true)
    ))
    .orderBy(addonServices.sortOrder);
  
  // If none, try organization-level addons
  if (addons.length === 0) {
    const household = await this.getHousehold(householdId);
    if (household?.organizationId) {
      addons = await db.select().from(addonServices)
        .where(and(
          eq(addonServices.organizationId, household.organizationId),
          eq(addonServices.isActive, true)
        ))
        .orderBy(addonServices.sortOrder);
    }
  }
  
  return addons;
}

async getNextCleaningVisit(householdId: string) {
  const now = new Date();
  const [visit] = await db.select().from(cleaningVisits)
    .where(and(
      eq(cleaningVisits.householdId, householdId),
      gte(cleaningVisits.scheduledAt, now),
      eq(cleaningVisits.status, "SCHEDULED")
    ))
    .orderBy(cleaningVisits.scheduledAt)
    .limit(1);
  return visit;
}

async getCleaningVisits(householdId: string) {
  return db.select().from(cleaningVisits)
    .where(eq(cleaningVisits.householdId, householdId))
    .orderBy(desc(cleaningVisits.scheduledAt))
    .limit(50);
}

async createCleaningVisit(data: InsertCleaningVisit) {
  const [visit] = await db.insert(cleaningVisits).values(data).returning();
  return visit;
}

async updateCleaningVisit(id: string, data: Partial<CleaningVisit>) {
  const [visit] = await db.update(cleaningVisits)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(cleaningVisits.id, id))
    .returning();
  return visit;
}
```

Also add imports at top of storage.ts:
```typescript
import { addonServices, cleaningVisits, type InsertCleaningVisit, type CleaningVisit } from "@shared/schema";
import { gte, desc } from "drizzle-orm";
```

---

## STEP 9: Set a Household to CLEANING (for testing)

Run this SQL in your database or create a quick endpoint:

```sql
UPDATE households SET service_type = 'CLEANING' WHERE id = 'YOUR_HOUSEHOLD_ID';
```

Or add a temporary endpoint:
```typescript
app.post("/api/admin/set-cleaning", isAuthenticated, householdContext, async (req: any, res) => {
  const householdId = req.householdId;
  await db.update(households)
    .set({ serviceType: "CLEANING" })
    .where(eq(households.id, householdId));
  res.json({ success: true });
});
```

---

## Summary of Files to Create/Modify

| File | Action |
|------|--------|
| `shared/schema.ts` | ADD serviceType enum, addonServices table, cleaningVisits table |
| `client/src/hooks/use-service-type.ts` | CREATE (new file) |
| `client/src/components/layout/bottom-nav.tsx` | REPLACE |
| `client/src/pages/addons.tsx` | CREATE (new file) |
| `client/src/pages/schedule.tsx` | CREATE (new file) |
| `client/src/App.tsx` | ADD imports and routes |
| `server/routes.ts` | ADD cleaning routes |
| `server/storage.ts` | ADD storage methods |

After all changes, run:
```bash
npm run db:push
```

Then set your test household to CLEANING service type and verify the new nav appears!
