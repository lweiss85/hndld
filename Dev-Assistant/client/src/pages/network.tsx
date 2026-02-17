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
  Users,
  UserPlus,
  Share2,
  ShoppingCart,
  AlertTriangle,
  Star,
  Check,
  X,
  ArrowRight,
  Percent,
  Shield,
  Phone,
  Clock,
  ChevronRight,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PageTransition } from "@/components/juice";
import { cn } from "@/lib/utils";

type Tab = "connections" | "referrals" | "group-buys" | "emergency";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "connections", label: "Network", icon: <Users className="h-4 w-4" /> },
  { id: "referrals", label: "Referrals", icon: <Share2 className="h-4 w-4" /> },
  { id: "group-buys", label: "Group Deals", icon: <ShoppingCart className="h-4 w-4" /> },
  { id: "emergency", label: "Coverage", icon: <Shield className="h-4 w-4" /> },
];

function NetworkSkeleton() {
  return (
    <div className="px-4 py-6 space-y-4 max-w-4xl mx-auto" aria-busy="true">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-10 w-full" />
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-24" />
      ))}
    </div>
  );
}

function ConnectionsTab() {
  const { toast } = useToast();
  const [showInvite, setShowInvite] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");

  const { data: connections, isLoading } = useQuery<any[]>({
    queryKey: ["/api/v1/network/connections"],
  });

  const { data: summary } = useQuery<any>({
    queryKey: ["/api/v1/network/summary"],
  });

  const sendRequest = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/v1/network/connections", {
        targetHouseholdId: targetId,
        message: inviteMessage || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/network/connections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/network/summary"] });
      setShowInvite(false);
      setTargetId("");
      setInviteMessage("");
      toast({ title: "Request sent", description: "Connection request has been sent" });
    },
    onError: () => {
      toast({ title: "Failed to send", description: "Could not send connection request", variant: "destructive" });
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/v1/network/connections/${id}/accept`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/network/connections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/network/summary"] });
      toast({ title: "Connected", description: "You are now connected" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/v1/network/connections/${id}/reject`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/network/connections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/network/summary"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/v1/network/connections/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/network/connections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/network/summary"] });
      toast({ title: "Removed", description: "Connection has been removed" });
    },
  });

  if (isLoading) return <NetworkSkeleton />;

  const pending = connections?.filter((c) => c.status === "PENDING" && c.direction === "received") || [];
  const accepted = connections?.filter((c) => c.status === "ACCEPTED") || [];
  const sent = connections?.filter((c) => c.status === "PENDING" && c.direction === "sent") || [];

  return (
    <div className="space-y-6">
      {summary && (
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-semibold">{summary.connections}</div>
              <div className="text-xs text-muted-foreground">Connected</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-semibold">{summary.pendingReferrals}</div>
              <div className="text-xs text-muted-foreground">Referrals</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-semibold">{summary.openGroupBuys}</div>
              <div className="text-xs text-muted-foreground">Group Deals</div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Your Network</h2>
        <Button size="sm" onClick={() => setShowInvite(true)}>
          <UserPlus className="h-4 w-4 mr-1" />
          Connect
        </Button>
      </div>

      {pending.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Pending Requests
          </h3>
          {pending.map((conn) => (
            <Card key={conn.id} className="border-amber-200 dark:border-amber-800">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{conn.otherHouseholdName}</div>
                    {conn.message && (
                      <p className="text-sm text-muted-foreground mt-1">{conn.message}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => rejectMutation.mutate(conn.id)}
                      disabled={rejectMutation.isPending}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => acceptMutation.mutate(conn.id)}
                      disabled={acceptMutation.isPending}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {accepted.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Connected Households
          </h3>
          {accepted.map((conn) => (
            <Card key={conn.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="font-medium">{conn.otherHouseholdName}</div>
                      <div className="text-xs text-muted-foreground">Connected</div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground"
                    onClick={() => removeMutation.mutate(conn.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {sent.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Sent Requests
          </h3>
          {sent.map((conn) => (
            <Card key={conn.id} className="opacity-60">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{conn.otherHouseholdName}</div>
                  <Badge variant="secondary">Pending</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {accepted.length === 0 && pending.length === 0 && sent.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-medium text-lg mb-1">No connections yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Connect with other households to share vendors, referrals, and group deals
          </p>
          <Button onClick={() => setShowInvite(true)}>
            <UserPlus className="h-4 w-4 mr-1" />
            Connect a Household
          </Button>
        </div>
      )}

      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Connect with a Household</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Household ID</label>
              <Input
                placeholder="Enter household ID"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Ask the other household for their ID from their settings page
              </p>
            </div>
            <Textarea
              placeholder="Add a message (optional)"
              value={inviteMessage}
              onChange={(e) => setInviteMessage(e.target.value)}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() => sendRequest.mutate()}
              disabled={!targetId || sendRequest.isPending}
              className="w-full"
            >
              Send Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReferralsTab() {
  const { toast } = useToast();

  const { data: allReferrals, isLoading } = useQuery<any[]>({
    queryKey: ["/api/v1/network/referrals"],
  });

  const respondMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("POST", `/api/v1/network/referrals/${id}/respond`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/network/referrals"] });
      toast({ title: "Response saved" });
    },
  });

  if (isLoading) return <NetworkSkeleton />;

  const received = allReferrals?.filter((r) => r.direction === "received") || [];
  const sent = allReferrals?.filter((r) => r.direction === "sent") || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Vendor Referrals</h2>
      </div>

      <p className="text-sm text-muted-foreground">
        Receive trusted vendor recommendations from connected households, and share your favorites with them.
      </p>

      {received.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Received
          </h3>
          {received.map((ref: any) => (
            <Card key={ref.id} className={ref.status === "SENT" ? "border-amber-200 dark:border-amber-800" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{ref.vendorName || "Vendor"}</span>
                      {ref.vendorCategory && (
                        <Badge variant="secondary" className="text-xs">{ref.vendorCategory}</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Referred by {ref.otherHouseholdName}
                    </p>
                    {ref.message && (
                      <p className="text-sm mt-2 italic">"{ref.message}"</p>
                    )}
                    {ref.vendorPhone && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {ref.vendorPhone}
                      </p>
                    )}
                  </div>
                  {ref.status === "SENT" ? (
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => respondMutation.mutate({ id: ref.id, status: "DECLINED" })}
                      >
                        Decline
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => respondMutation.mutate({ id: ref.id, status: "ACCEPTED" })}
                      >
                        Accept
                      </Button>
                    </div>
                  ) : (
                    <Badge variant={ref.status === "ACCEPTED" ? "default" : "secondary"}>
                      {ref.status === "ACCEPTED" ? "Accepted" : "Declined"}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {sent.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Sent
          </h3>
          {sent.map((ref: any) => (
            <Card key={ref.id} className="opacity-75">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{ref.vendorName || "Vendor"}</div>
                    <p className="text-sm text-muted-foreground">
                      Sent to {ref.otherHouseholdName}
                    </p>
                  </div>
                  <Badge variant={ref.status === "ACCEPTED" ? "default" : "secondary"}>
                    {ref.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(!allReferrals || allReferrals.length === 0) && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Share2 className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-medium text-lg mb-1">No referrals yet</h3>
          <p className="text-sm text-muted-foreground">
            Share vendors from your Vendors page to send referrals to connected households
          </p>
        </div>
      )}
    </div>
  );
}

function GroupBuysTab() {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [newOffer, setNewOffer] = useState({
    vendorName: "",
    serviceCategory: "",
    description: "",
    discountPercent: "",
    minHouseholds: "2",
    location: "",
  });

  const { data: groupBuys, isLoading } = useQuery<any[]>({
    queryKey: ["/api/v1/network/group-buys"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/v1/network/group-buys", {
        ...newOffer,
        discountPercent: parseInt(newOffer.discountPercent) || 0,
        minHouseholds: parseInt(newOffer.minHouseholds) || 2,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/network/group-buys"] });
      setShowCreate(false);
      setNewOffer({ vendorName: "", serviceCategory: "", description: "", discountPercent: "", minHouseholds: "2", location: "" });
      toast({ title: "Group deal created", description: "Connected households can now join" });
    },
  });

  const joinMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/v1/network/group-buys/${id}/join`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/network/group-buys"] });
      toast({ title: "Joined", description: "You've joined this group deal" });
    },
    onError: () => {
      toast({ title: "Could not join", description: "You may have already joined", variant: "destructive" });
    },
  });

  if (isLoading) return <NetworkSkeleton />;

  const SERVICE_CATEGORIES = ["Cleaning", "Landscaping", "Pool Service", "Pest Control", "HVAC", "Handyman", "Window Cleaning", "Other"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Group Deals</h2>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <ShoppingCart className="h-4 w-4 mr-1" />
          New Deal
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Pool demand with connected households for better pricing on services.
      </p>

      {groupBuys && groupBuys.length > 0 ? (
        <div className="space-y-3">
          {groupBuys.map((offer: any) => (
            <Card key={offer.id} className={offer.status === "MATCHED" ? "border-green-200 dark:border-green-800" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{offer.vendorName}</span>
                      <Badge variant="secondary" className="text-xs">{offer.serviceCategory}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{offer.description}</p>
                    <div className="flex items-center gap-4 mt-2 text-sm">
                      <span className="flex items-center gap-1 text-green-600 font-medium">
                        <Percent className="h-3 w-3" />
                        {offer.discountPercent}% off
                      </span>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Users className="h-3 w-3" />
                        {offer.currentHouseholds}/{offer.minHouseholds} households
                      </span>
                      {offer.location && (
                        <span className="text-muted-foreground">{offer.location}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Created by {offer.creatorHouseholdName}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {offer.status === "MATCHED" ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                        Matched
                      </Badge>
                    ) : offer.hasJoined ? (
                      <Badge variant="secondary">Joined</Badge>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => joinMutation.mutate(offer.id)}
                        disabled={joinMutation.isPending}
                      >
                        Join
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <ShoppingCart className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-medium text-lg mb-1">No group deals yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Create a group deal to get better pricing with connected households
          </p>
          <Button onClick={() => setShowCreate(true)}>
            <ShoppingCart className="h-4 w-4 mr-1" />
            Create First Deal
          </Button>
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Group Deal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Vendor / provider name"
              value={newOffer.vendorName}
              onChange={(e) => setNewOffer({ ...newOffer, vendorName: e.target.value })}
            />
            <div>
              <label className="text-sm font-medium mb-2 block">Service Category</label>
              <div className="flex flex-wrap gap-2">
                {SERVICE_CATEGORIES.map((cat) => (
                  <Button
                    key={cat}
                    variant={newOffer.serviceCategory === cat ? "default" : "outline"}
                    size="sm"
                    onClick={() => setNewOffer({ ...newOffer, serviceCategory: cat })}
                  >
                    {cat}
                  </Button>
                ))}
              </div>
            </div>
            <Textarea
              placeholder="What's the deal? e.g., 'Group rate for bi-weekly window cleaning'"
              value={newOffer.description}
              onChange={(e) => setNewOffer({ ...newOffer, description: e.target.value })}
              rows={2}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="number"
                placeholder="Discount %"
                value={newOffer.discountPercent}
                onChange={(e) => setNewOffer({ ...newOffer, discountPercent: e.target.value })}
              />
              <Input
                type="number"
                placeholder="Min. households"
                value={newOffer.minHouseholds}
                onChange={(e) => setNewOffer({ ...newOffer, minHouseholds: e.target.value })}
              />
            </div>
            <Input
              placeholder="Location / area (optional)"
              value={newOffer.location}
              onChange={(e) => setNewOffer({ ...newOffer, location: e.target.value })}
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!newOffer.vendorName || !newOffer.serviceCategory || !newOffer.description || !newOffer.discountPercent || createMutation.isPending}
              className="w-full"
            >
              Create Deal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmergencyCoverageTab() {
  const { toast } = useToast();
  const [showRequest, setShowRequest] = useState(false);
  const [newRequest, setNewRequest] = useState({
    serviceCategory: "",
    reason: "",
    neededBy: "",
  });

  const { data: backupProvidersList, isLoading: loadingProviders } = useQuery<any[]>({
    queryKey: ["/api/v1/network/backup-providers"],
  });

  const { data: emergencyRequests, isLoading: loadingRequests } = useQuery<any[]>({
    queryKey: ["/api/v1/network/emergency-requests"],
  });

  const createRequest = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/v1/network/emergency-requests", newRequest);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/network/emergency-requests"] });
      setShowRequest(false);
      setNewRequest({ serviceCategory: "", reason: "", neededBy: "" });
      toast({ title: "Request sent", description: "Connected households have been notified" });
    },
  });

  const fulfillMutation = useMutation({
    mutationFn: async ({ requestId, backupProviderId }: { requestId: string; backupProviderId: string }) => {
      return apiRequest("POST", `/api/v1/network/emergency-requests/${requestId}/fulfill`, { backupProviderId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/network/emergency-requests"] });
      toast({ title: "Fulfilled", description: "Emergency coverage has been arranged" });
    },
  });

  if (loadingProviders || loadingRequests) return <NetworkSkeleton />;

  const openRequests = emergencyRequests?.filter((r) => r.status === "OPEN") || [];
  const fulfilledRequests = emergencyRequests?.filter((r) => r.status === "FULFILLED") || [];
  const SERVICE_CATEGORIES = ["Cleaning", "Landscaping", "Pool Service", "Pest Control", "HVAC", "Handyman", "Childcare", "Other"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Emergency Coverage</h2>
        <Button size="sm" variant="destructive" onClick={() => setShowRequest(true)}>
          <AlertTriangle className="h-4 w-4 mr-1" />
          Need Help
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        When your regular provider is unavailable, tap into your trusted network for backup coverage.
      </p>

      {openRequests.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Open Requests
          </h3>
          {openRequests.map((req: any) => (
            <Card key={req.id} className="border-red-200 dark:border-red-800">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                      <span className="font-medium">{req.serviceCategory}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {req.householdName} needs coverage
                    </p>
                    {req.reason && <p className="text-sm mt-1">{req.reason}</p>}
                    {req.neededBy && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Needed by {new Date(req.neededBy).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  {!req.isOwn && backupProvidersList && backupProvidersList.filter((p) => p.isOwn && p.serviceCategory === req.serviceCategory).length > 0 && (
                    <Button
                      size="sm"
                      onClick={() => {
                        const matchingProvider = backupProvidersList.find(
                          (p) => p.isOwn && p.serviceCategory === req.serviceCategory
                        );
                        if (matchingProvider) {
                          fulfillMutation.mutate({ requestId: req.id, backupProviderId: matchingProvider.id });
                        }
                      }}
                    >
                      Help
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {backupProvidersList && backupProvidersList.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Available Backup Providers
          </h3>
          {backupProvidersList.map((prov: any) => (
            <Card key={prov.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                      <Shield className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <div className="font-medium">{prov.vendorName || prov.contactName}</div>
                      <div className="text-xs text-muted-foreground">
                        {prov.serviceCategory} · {prov.householdName}
                      </div>
                      {prov.contactPhone && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Phone className="h-3 w-3" /> {prov.contactPhone}
                        </div>
                      )}
                    </div>
                  </div>
                  {prov.isOwn && <Badge variant="outline">Your provider</Badge>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {fulfilledRequests.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Past Coverage
          </h3>
          {fulfilledRequests.map((req: any) => (
            <Card key={req.id} className="opacity-60">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{req.serviceCategory}</div>
                    <div className="text-xs text-muted-foreground">{req.householdName}</div>
                  </div>
                  <Badge className="bg-green-100 text-green-800">Fulfilled</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(!openRequests.length && !backupProvidersList?.length && !fulfilledRequests.length) && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Shield className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-medium text-lg mb-1">No emergency coverage set up</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Add your vendors as backup providers to help connected households in emergencies
          </p>
        </div>
      )}

      <Dialog open={showRequest} onOpenChange={setShowRequest}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request Emergency Coverage</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Service Needed</label>
              <div className="flex flex-wrap gap-2">
                {SERVICE_CATEGORIES.map((cat) => (
                  <Button
                    key={cat}
                    variant={newRequest.serviceCategory === cat ? "default" : "outline"}
                    size="sm"
                    onClick={() => setNewRequest({ ...newRequest, serviceCategory: cat })}
                  >
                    {cat}
                  </Button>
                ))}
              </div>
            </div>
            <Textarea
              placeholder="What happened? e.g., 'Regular cleaner is sick this week'"
              value={newRequest.reason}
              onChange={(e) => setNewRequest({ ...newRequest, reason: e.target.value })}
              rows={2}
            />
            <Input
              type="date"
              value={newRequest.neededBy}
              onChange={(e) => setNewRequest({ ...newRequest, neededBy: e.target.value })}
            />
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => createRequest.mutate()}
              disabled={!newRequest.serviceCategory || createRequest.isPending}
              className="w-full"
            >
              Send Emergency Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Network() {
  const [activeTab, setActiveTab] = useState<Tab>("connections");

  return (
    <PageTransition>
      <div className="px-4 py-6 space-y-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold animate-fade-in-up">Trusted Network</h1>

        <div className="flex gap-1 bg-muted/50 rounded-xl p-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                activeTab === tab.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {activeTab === "connections" && <ConnectionsTab />}
        {activeTab === "referrals" && <ReferralsTab />}
        {activeTab === "group-buys" && <GroupBuysTab />}
        {activeTab === "emergency" && <EmergencyCoverageTab />}
      </div>
    </PageTransition>
  );
}
