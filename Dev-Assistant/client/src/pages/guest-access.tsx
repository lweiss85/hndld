import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Plus, UserPlus, Clock, Shield, ShieldOff, Mail, Copy, Check, UserX, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format, isPast, isFuture } from "date-fns";

interface GuestAccessItem {
  id: string;
  householdId: string;
  invitedBy: string;
  guestEmail: string;
  guestName: string | null;
  guestUserId: string | null;
  accessLevel: string;
  permissions: {
    canViewTasks: boolean;
    canViewCalendar: boolean;
    canViewVendors: boolean;
    canViewFiles: boolean;
    canSendMessages: boolean;
    canCreateTasks: boolean;
  } | null;
  startsAt: string;
  expiresAt: string;
  status: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  purpose: string | null;
  inviteToken: string | null;
  createdAt: string;
}

function getStatusBadge(status: string, expiresAt: string) {
  const expired = isPast(new Date(expiresAt));
  if (status === "ACTIVE" && expired) status = "EXPIRED";

  switch (status) {
    case "ACTIVE":
      return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Active</Badge>;
    case "PENDING":
      return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Pending</Badge>;
    case "EXPIRED":
      return <Badge variant="secondary">Expired</Badge>;
    case "REVOKED":
      return <Badge variant="destructive">Revoked</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function getAccessLevelLabel(level: string) {
  switch (level) {
    case "VIEW_ONLY": return "View Only";
    case "LIMITED": return "Limited";
    case "STANDARD": return "Standard";
    case "FULL": return "Full Access";
    default: return level;
  }
}

function getAccessIcon(level: string) {
  switch (level) {
    case "VIEW_ONLY": return <Shield className="h-4 w-4 text-blue-500" />;
    case "LIMITED": return <Shield className="h-4 w-4 text-amber-500" />;
    case "STANDARD": return <Shield className="h-4 w-4 text-emerald-500" />;
    case "FULL": return <ShieldOff className="h-4 w-4 text-red-500" />;
    default: return <Shield className="h-4 w-4" />;
  }
}

export default function GuestAccessPage() {
  const [showInvite, setShowInvite] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: guests = [], isLoading } = useQuery<GuestAccessItem[]>({
    queryKey: ["/api/v1/guest-access"],
  });

  const inviteMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/v1/guest-access/invite", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/guest-access"] });
      setShowInvite(false);
      toast({ title: "Invitation sent" });
    },
    onError: () => toast({ title: "Failed to send invitation", variant: "destructive" }),
  });

  const revokeMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest("POST", `/api/v1/guest-access/${id}/revoke`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/guest-access"] });
      setRevokeId(null);
      setRevokeReason("");
      toast({ title: "Access revoked" });
    },
    onError: () => toast({ title: "Failed to revoke access", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/v1/guest-access/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/guest-access"] });
      toast({ title: "Record removed" });
    },
  });

  const activeGuests = guests.filter(g => g.status === "ACTIVE" && isFuture(new Date(g.expiresAt)));
  const pendingGuests = guests.filter(g => g.status === "PENDING" && isFuture(new Date(g.expiresAt)));
  const pastGuests = guests.filter(g => g.status === "EXPIRED" || g.status === "REVOKED" || (g.status !== "ACTIVE" && isPast(new Date(g.expiresAt))));

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Guest Access</h1>
            <p className="text-xs text-muted-foreground">Temporary access for guests & helpers</p>
          </div>
          <Dialog open={showInvite} onOpenChange={setShowInvite}>
            <DialogTrigger asChild>
              <Button size="sm"><UserPlus className="h-4 w-4 mr-1" /> Invite</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Invite Guest</DialogTitle>
              </DialogHeader>
              <InviteForm
                onSubmit={(data) => inviteMutation.mutate(data)}
                isLoading={inviteMutation.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {guests.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-3 text-center">
                <Users className="h-4 w-4 mx-auto mb-1 text-emerald-500" />
                <div className="text-sm font-semibold">{activeGuests.length}</div>
                <div className="text-[10px] text-muted-foreground">Active</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <Clock className="h-4 w-4 mx-auto mb-1 text-amber-500" />
                <div className="text-sm font-semibold">{pendingGuests.length}</div>
                <div className="text-[10px] text-muted-foreground">Pending</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <UserX className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <div className="text-sm font-semibold">{pastGuests.length}</div>
                <div className="text-[10px] text-muted-foreground">Past</div>
              </CardContent>
            </Card>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : guests.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <UserPlus className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground mb-4">No guest access set up yet</p>
              <p className="text-sm text-muted-foreground mb-4">
                Invite house sitters, contractors, or temporary help with time-limited access
              </p>
              <Button onClick={() => setShowInvite(true)}>
                <Plus className="h-4 w-4 mr-1" /> Invite Your First Guest
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {activeGuests.length > 0 && (
              <GuestSection title="Active Access" guests={activeGuests} onRevoke={setRevokeId} />
            )}
            {pendingGuests.length > 0 && (
              <GuestSection title="Pending Invitations" guests={pendingGuests} onRevoke={setRevokeId} />
            )}
            {pastGuests.length > 0 && (
              <GuestSection
                title="Past Access"
                guests={pastGuests}
                onDelete={(id) => { if (confirm("Remove this record?")) deleteMutation.mutate(id); }}
              />
            )}
          </>
        )}
      </div>

      <Dialog open={!!revokeId} onOpenChange={(open) => { if (!open) { setRevokeId(null); setRevokeReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke Access</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">This will immediately end guest access. This cannot be undone.</p>
            <div>
              <Label>Reason (optional)</Label>
              <Input
                placeholder="e.g. No longer needed"
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
              />
            </div>
            <Button
              variant="destructive"
              className="w-full"
              disabled={revokeMutation.isPending}
              onClick={() => revokeId && revokeMutation.mutate({ id: revokeId, reason: revokeReason })}
            >
              {revokeMutation.isPending ? "Revoking..." : "Revoke Access"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GuestSection({
  title,
  guests,
  onRevoke,
  onDelete,
}: {
  title: string;
  guests: GuestAccessItem[];
  onRevoke?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground mb-2">{title}</h2>
      <div className="space-y-3">
        {guests.map((guest) => (
          <GuestCard key={guest.id} guest={guest} onRevoke={onRevoke} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

function GuestCard({
  guest,
  onRevoke,
  onDelete,
}: {
  guest: GuestAccessItem;
  onRevoke?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const isActive = guest.status === "ACTIVE" && isFuture(new Date(guest.expiresAt));
  const isPending = guest.status === "PENDING" && isFuture(new Date(guest.expiresAt));

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            {getAccessIcon(guest.accessLevel)}
            <div>
              <div className="font-medium text-sm">
                {guest.guestName || guest.guestEmail}
              </div>
              {guest.guestName && (
                <div className="text-xs text-muted-foreground">{guest.guestEmail}</div>
              )}
            </div>
          </div>
          {getStatusBadge(guest.status, guest.expiresAt)}
        </div>

        {guest.purpose && (
          <p className="text-xs text-muted-foreground mb-2">{guest.purpose}</p>
        )}

        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
          <span>{format(new Date(guest.startsAt), "MMM d")} — {format(new Date(guest.expiresAt), "MMM d, yyyy")}</span>
          <span>{getAccessLevelLabel(guest.accessLevel)}</span>
        </div>

        {isActive && (
          <div className="text-xs text-emerald-600 dark:text-emerald-400 mb-2">
            Expires {formatDistanceToNow(new Date(guest.expiresAt), { addSuffix: true })}
          </div>
        )}

        {isPending && (
          <div className="text-xs text-amber-600 dark:text-amber-400 mb-2">
            Awaiting acceptance
          </div>
        )}

        {guest.revokeReason && (
          <div className="text-xs text-red-500 mb-2">
            Revoked: {guest.revokeReason}
          </div>
        )}

        {guest.permissions && (
          <div className="flex flex-wrap gap-1 mb-3">
            {guest.permissions.canViewTasks && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Tasks</Badge>}
            {guest.permissions.canViewCalendar && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Calendar</Badge>}
            {guest.permissions.canViewVendors && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Vendors</Badge>}
            {guest.permissions.canViewFiles && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Files</Badge>}
            {guest.permissions.canSendMessages && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Messages</Badge>}
            {guest.permissions.canCreateTasks && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Create Tasks</Badge>}
          </div>
        )}

        <div className="flex gap-2">
          {(isActive || isPending) && onRevoke && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive"
              onClick={() => onRevoke(guest.id)}
            >
              Revoke
            </Button>
          )}
          {(guest.status === "EXPIRED" || guest.status === "REVOKED") && onDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => onDelete(guest.id)}
            >
              Remove
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function InviteForm({
  onSubmit,
  isLoading,
}: {
  onSubmit: (data: any) => void;
  isLoading: boolean;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [accessLevel, setAccessLevel] = useState("VIEW_ONLY");
  const [startsAt, setStartsAt] = useState(new Date().toISOString().split("T")[0]);
  const [expiresAt, setExpiresAt] = useState("");
  const [customPermissions, setCustomPermissions] = useState(false);
  const [permissions, setPermissions] = useState({
    canViewTasks: true,
    canViewCalendar: true,
    canViewVendors: false,
    canViewFiles: false,
    canSendMessages: false,
    canCreateTasks: false,
  });

  const handleAccessLevelChange = (level: string) => {
    setAccessLevel(level);
    if (!customPermissions) {
      const presets: Record<string, typeof permissions> = {
        VIEW_ONLY: { canViewTasks: true, canViewCalendar: true, canViewVendors: false, canViewFiles: false, canSendMessages: false, canCreateTasks: false },
        LIMITED: { canViewTasks: true, canViewCalendar: true, canViewVendors: true, canViewFiles: false, canSendMessages: true, canCreateTasks: false },
        STANDARD: { canViewTasks: true, canViewCalendar: true, canViewVendors: true, canViewFiles: true, canSendMessages: true, canCreateTasks: true },
        FULL: { canViewTasks: true, canViewCalendar: true, canViewVendors: true, canViewFiles: true, canSendMessages: true, canCreateTasks: true },
      };
      setPermissions(presets[level] || presets.VIEW_ONLY);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !expiresAt) return;

    onSubmit({
      guestEmail: email,
      guestName: name || null,
      accessLevel,
      permissions,
      startsAt: new Date(startsAt).toISOString(),
      expiresAt: new Date(expiresAt + "T23:59:59").toISOString(),
      purpose: purpose || null,
    });
  };

  const permissionLabels: { key: keyof typeof permissions; label: string }[] = [
    { key: "canViewTasks", label: "View Tasks" },
    { key: "canViewCalendar", label: "View Calendar" },
    { key: "canViewVendors", label: "View Vendors" },
    { key: "canViewFiles", label: "View Files" },
    { key: "canSendMessages", label: "Send Messages" },
    { key: "canCreateTasks", label: "Create Tasks" },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Email Address</Label>
        <Input
          type="email"
          placeholder="guest@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div>
        <Label>Name (optional)</Label>
        <Input
          placeholder="Jane Smith"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div>
        <Label>Purpose (optional)</Label>
        <Input
          placeholder="e.g. House sitting Dec 15-22"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Start Date</Label>
          <Input
            type="date"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            required
          />
        </div>
        <div>
          <Label>End Date</Label>
          <Input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            min={startsAt}
            required
          />
        </div>
      </div>

      <div>
        <Label>Access Level</Label>
        <Select value={accessLevel} onValueChange={handleAccessLevelChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="VIEW_ONLY">View Only — Can see tasks & calendar</SelectItem>
            <SelectItem value="LIMITED">Limited — View + vendors + messaging</SelectItem>
            <SelectItem value="STANDARD">Standard — All views + create tasks</SelectItem>
            <SelectItem value="FULL">Full — Complete household access</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <Checkbox
            id="custom-perms"
            checked={customPermissions}
            onCheckedChange={(v) => setCustomPermissions(!!v)}
          />
          <Label htmlFor="custom-perms" className="text-sm cursor-pointer">Customize permissions</Label>
        </div>

        {customPermissions && (
          <div className="space-y-2 pl-6">
            {permissionLabels.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <Checkbox
                  id={key}
                  checked={permissions[key]}
                  onCheckedChange={(v) => setPermissions(prev => ({ ...prev, [key]: !!v }))}
                />
                <Label htmlFor={key} className="text-sm cursor-pointer">{label}</Label>
              </div>
            ))}
          </div>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Sending..." : "Send Invitation"}
      </Button>
    </form>
  );
}
