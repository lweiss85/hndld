import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Lock, Unlock, Plus, Key, Activity, Trash2, Settings,
  Wifi, WifiOff, Battery, ChevronRight, Clock, User, Shield
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format } from "date-fns";

interface SmartLockItem {
  id: string;
  householdId: string;
  provider: string;
  name: string;
  externalId: string | null;
  isConnected: boolean;
  lastSyncAt: string | null;
  createdAt: string;
  status?: { locked: boolean; battery?: number };
}

interface AccessCode {
  id: string;
  lockId: string;
  name: string;
  code: string | null;
  vendorId: string | null;
  vendorName: string | null;
  personId: string | null;
  personName: string | null;
  guestAccessId: string | null;
  scheduleType: string;
  startsAt: string | null;
  expiresAt: string | null;
  scheduleDays: number[] | null;
  scheduleStartTime: string | null;
  scheduleEndTime: string | null;
  isActive: boolean;
  createdAt: string;
}

interface ActivityEntry {
  id: string;
  lockId: string;
  action: string;
  codeName: string | null;
  method: string | null;
  timestamp: string;
  metadata: any;
}

const PROVIDERS = [
  { value: "AUGUST", label: "August" },
  { value: "SCHLAGE", label: "Schlage Encode" },
  { value: "YALE", label: "Yale" },
  { value: "LEVEL", label: "Level" },
  { value: "OTHER", label: "Other" },
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getActionIcon(action: string) {
  switch (action) {
    case "LOCK": return <Lock className="w-4 h-4 text-green-600 dark:text-green-400" />;
    case "UNLOCK": return <Unlock className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
    case "CODE_USED": return <Key className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
    case "CODE_CREATED": return <Plus className="w-4 h-4 text-emerald-600" />;
    case "CODE_DELETED": return <Trash2 className="w-4 h-4 text-red-600" />;
    case "CODE_DISABLED": return <Shield className="w-4 h-4 text-gray-500" />;
    default: return <Activity className="w-4 h-4 text-gray-500" />;
  }
}

function getActionLabel(action: string) {
  const labels: Record<string, string> = {
    LOCK: "Locked",
    UNLOCK: "Unlocked",
    CODE_USED: "Code used",
    CODE_CREATED: "Code created",
    CODE_DELETED: "Code deleted",
    CODE_UPDATED: "Code updated",
    CODE_DISABLED: "Code disabled",
    ADDED: "Lock added",
  };
  return labels[action] || action;
}

export default function SmartLocksPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedLock, setSelectedLock] = useState<string | null>(null);
  const [tab, setTab] = useState<"codes" | "activity">("codes");
  const [showAddLock, setShowAddLock] = useState(false);
  const [showAddCode, setShowAddCode] = useState(false);

  const { data: locks = [], isLoading } = useQuery<SmartLockItem[]>({
    queryKey: ["/api/v1/smart-locks"],
  });

  const activeLock = locks.find(l => l.id === selectedLock);

  const { data: lockDetail } = useQuery<SmartLockItem>({
    queryKey: [`/api/v1/smart-locks/${selectedLock}`],
    enabled: !!selectedLock,
  });

  const { data: codes = [] } = useQuery<AccessCode[]>({
    queryKey: [`/api/v1/smart-locks/${selectedLock}/codes`],
    enabled: !!selectedLock,
  });

  const { data: activity = [] } = useQuery<ActivityEntry[]>({
    queryKey: [`/api/v1/smart-locks/${selectedLock}/activity`],
    enabled: !!selectedLock && tab === "activity",
  });

  const lockMutation = useMutation({
    mutationFn: (lockId: string) => apiRequest("POST", `/api/v1/smart-locks/${lockId}/lock`),
    onSuccess: () => {
      toast({ title: "Lock secured" });
      queryClient.invalidateQueries({ queryKey: [`/api/v1/smart-locks/${selectedLock}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/v1/smart-locks/${selectedLock}/activity`] });
    },
  });

  const unlockMutation = useMutation({
    mutationFn: (lockId: string) => apiRequest("POST", `/api/v1/smart-locks/${lockId}/unlock`),
    onSuccess: () => {
      toast({ title: "Lock unlocked" });
      queryClient.invalidateQueries({ queryKey: [`/api/v1/smart-locks/${selectedLock}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/v1/smart-locks/${selectedLock}/activity`] });
    },
  });

  const deleteLockMutation = useMutation({
    mutationFn: (lockId: string) => apiRequest("DELETE", `/api/v1/smart-locks/${lockId}`),
    onSuccess: () => {
      toast({ title: "Lock removed" });
      setSelectedLock(null);
      queryClient.invalidateQueries({ queryKey: ["/api/v1/smart-locks"] });
    },
  });

  const toggleCodeMutation = useMutation({
    mutationFn: ({ lockId, codeId, isActive }: { lockId: string; codeId: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/v1/smart-locks/${lockId}/codes/${codeId}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/v1/smart-locks/${selectedLock}/codes`] });
    },
  });

  const deleteCodeMutation = useMutation({
    mutationFn: ({ lockId, codeId }: { lockId: string; codeId: string }) =>
      apiRequest("DELETE", `/api/v1/smart-locks/${lockId}/codes/${codeId}`),
    onSuccess: () => {
      toast({ title: "Access code removed" });
      queryClient.invalidateQueries({ queryKey: [`/api/v1/smart-locks/${selectedLock}/codes`] });
      queryClient.invalidateQueries({ queryKey: [`/api/v1/smart-locks/${selectedLock}/activity`] });
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="space-y-3">
          {[1, 2].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-2xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 pb-24 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Smart Locks</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage access codes and lock activity</p>
        </div>
        <Dialog open={showAddLock} onOpenChange={setShowAddLock}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="w-4 h-4" /> Add Lock
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Smart Lock</DialogTitle>
            </DialogHeader>
            <AddLockForm onSuccess={() => {
              setShowAddLock(false);
              queryClient.invalidateQueries({ queryKey: ["/api/v1/smart-locks"] });
            }} />
          </DialogContent>
        </Dialog>
      </div>

      {locks.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Lock className="w-12 h-12 text-muted-foreground/40 mb-3" />
            <h3 className="font-medium text-foreground mb-1">No locks connected</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-xs">
              Add your smart locks to manage access codes and monitor who comes and goes.
            </p>
            <Button size="sm" onClick={() => setShowAddLock(true)}>
              <Plus className="w-4 h-4 mr-1.5" /> Add Your First Lock
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {locks.map(lock => (
            <Card
              key={lock.id}
              className={cn(
                "cursor-pointer transition-all",
                selectedLock === lock.id && "ring-2 ring-primary"
              )}
              onClick={() => setSelectedLock(selectedLock === lock.id ? null : lock.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    lock.isConnected
                      ? "bg-emerald-100 dark:bg-emerald-900/30"
                      : "bg-gray-100 dark:bg-gray-800"
                  )}>
                    <Lock className={cn(
                      "w-5 h-5",
                      lock.isConnected
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-gray-500"
                    )} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground truncate">{lock.name}</span>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {PROVIDERS.find(p => p.value === lock.provider)?.label || lock.provider}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {lock.isConnected ? (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <Wifi className="w-3 h-3" /> Connected
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <WifiOff className="w-3 h-3" /> Manual tracking
                        </span>
                      )}
                      {lock.lastSyncAt && (
                        <span className="text-xs text-muted-foreground">
                          Synced {formatDistanceToNow(new Date(lock.lastSyncAt), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className={cn(
                    "w-5 h-5 text-muted-foreground transition-transform",
                    selectedLock === lock.id && "rotate-90"
                  )} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedLock && activeLock && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => lockMutation.mutate(selectedLock)}
                disabled={lockMutation.isPending}
              >
                <Lock className="w-4 h-4" /> Lock
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => unlockMutation.mutate(selectedLock)}
                disabled={unlockMutation.isPending}
              >
                <Unlock className="w-4 h-4" /> Unlock
              </Button>
            </div>
            <div className="flex-1" />
            {lockDetail?.status?.battery !== undefined && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Battery className="w-3.5 h-3.5" /> {lockDetail.status.battery}%
              </span>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-destructive"
              onClick={() => {
                if (confirm("Remove this lock and all its access codes?")) {
                  deleteLockMutation.mutate(selectedLock);
                }
              }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
            <button
              className={cn(
                "flex-1 py-2 text-sm font-medium rounded-md transition-colors",
                tab === "codes" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
              )}
              onClick={() => setTab("codes")}
            >
              <Key className="w-4 h-4 inline mr-1.5" />
              Access Codes ({codes.length})
            </button>
            <button
              className={cn(
                "flex-1 py-2 text-sm font-medium rounded-md transition-colors",
                tab === "activity" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
              )}
              onClick={() => setTab("activity")}
            >
              <Activity className="w-4 h-4 inline mr-1.5" />
              Activity
            </button>
          </div>

          {tab === "codes" && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Dialog open={showAddCode} onOpenChange={setShowAddCode}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="gap-1.5">
                      <Plus className="w-4 h-4" /> New Code
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Access Code</DialogTitle>
                    </DialogHeader>
                    <AddCodeForm
                      lockId={selectedLock}
                      onSuccess={() => {
                        setShowAddCode(false);
                        queryClient.invalidateQueries({ queryKey: [`/api/v1/smart-locks/${selectedLock}/codes`] });
                        queryClient.invalidateQueries({ queryKey: [`/api/v1/smart-locks/${selectedLock}/activity`] });
                      }}
                    />
                  </DialogContent>
                </Dialog>
              </div>

              {codes.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-8 text-center">
                    <Key className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No access codes yet</p>
                  </CardContent>
                </Card>
              ) : (
                codes.map(code => (
                  <Card key={code.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "w-9 h-9 rounded-lg flex items-center justify-center mt-0.5",
                          code.isActive
                            ? "bg-blue-100 dark:bg-blue-900/30"
                            : "bg-gray-100 dark:bg-gray-800"
                        )}>
                          <Key className={cn(
                            "w-4 h-4",
                            code.isActive ? "text-blue-600 dark:text-blue-400" : "text-gray-400"
                          )} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "font-medium text-sm",
                              !code.isActive && "text-muted-foreground line-through"
                            )}>
                              {code.name}
                            </span>
                            <Badge variant="outline" className="text-[10px]">
                              {code.scheduleType === "ALWAYS" ? "Always" :
                               code.scheduleType === "TEMPORARY" ? "Temporary" : "Scheduled"}
                            </Badge>
                          </div>
                          {code.code && (
                            <span className="text-xs font-mono text-muted-foreground mt-0.5 block">
                              {code.code.replace(/./g, "•")}
                            </span>
                          )}
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {code.vendorName && (
                              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                <User className="w-3 h-3" /> {code.vendorName}
                              </span>
                            )}
                            {code.personName && (
                              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                <User className="w-3 h-3" /> {code.personName}
                              </span>
                            )}
                            {code.expiresAt && (
                              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                <Clock className="w-3 h-3" />
                                Expires {format(new Date(code.expiresAt), "MMM d")}
                              </span>
                            )}
                            {code.scheduleDays && code.scheduleDays.length > 0 && (
                              <span className="text-xs text-muted-foreground">
                                {code.scheduleDays.map(d => DAY_NAMES[d]).join(", ")}
                                {code.scheduleStartTime && code.scheduleEndTime &&
                                  ` ${code.scheduleStartTime}-${code.scheduleEndTime}`}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Switch
                            checked={code.isActive}
                            onCheckedChange={(checked) =>
                              toggleCodeMutation.mutate({
                                lockId: selectedLock,
                                codeId: code.id,
                                isActive: checked,
                              })
                            }
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              if (confirm("Delete this access code?")) {
                                deleteCodeMutation.mutate({ lockId: selectedLock, codeId: code.id });
                              }
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}

          {tab === "activity" && (
            <div className="space-y-1">
              {activity.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-8 text-center">
                    <Activity className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No activity recorded yet</p>
                  </CardContent>
                </Card>
              ) : (
                activity.map((entry, idx) => (
                  <div
                    key={entry.id}
                    className={cn(
                      "flex items-center gap-3 py-3 px-1",
                      idx < activity.length - 1 && "border-b border-border/50"
                    )}
                  >
                    {getActionIcon(entry.action)}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-foreground">
                        {getActionLabel(entry.action)}
                      </span>
                      {entry.codeName && (
                        <span className="text-sm text-muted-foreground"> — {entry.codeName}</span>
                      )}
                      {entry.metadata?.user && (
                        <span className="text-xs text-muted-foreground block mt-0.5">
                          by {entry.metadata.user}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true })}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AddLockForm({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("");
  const [externalId, setExternalId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !provider) return;
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/v1/smart-locks", {
        name,
        provider,
        externalId: externalId || undefined,
      });
      toast({ title: "Lock added" });
      onSuccess();
    } catch {
      toast({ title: "Failed to add lock", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Lock Name</Label>
        <Input
          placeholder="e.g. Front Door, Garage"
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Provider</Label>
        <Select value={provider} onValueChange={setProvider}>
          <SelectTrigger>
            <SelectValue placeholder="Select provider" />
          </SelectTrigger>
          <SelectContent>
            {PROVIDERS.map(p => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Device ID (optional)</Label>
        <Input
          placeholder="Provider's device identifier"
          value={externalId}
          onChange={e => setExternalId(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Connect to your lock's API for remote control. Leave blank for manual tracking.
        </p>
      </div>
      <Button type="submit" className="w-full" disabled={!name || !provider || submitting}>
        {submitting ? "Adding..." : "Add Lock"}
      </Button>
    </form>
  );
}

function AddCodeForm({ lockId, onSuccess }: { lockId: string; onSuccess: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [scheduleType, setScheduleType] = useState("ALWAYS");
  const [expiresAt, setExpiresAt] = useState("");
  const [scheduleDays, setScheduleDays] = useState<number[]>([]);
  const [scheduleStartTime, setScheduleStartTime] = useState("");
  const [scheduleEndTime, setScheduleEndTime] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const toggleDay = (day: number) => {
    setScheduleDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    setSubmitting(true);
    try {
      await apiRequest("POST", `/api/v1/smart-locks/${lockId}/codes`, {
        name,
        code: code || undefined,
        scheduleType,
        expiresAt: expiresAt || undefined,
        scheduleDays: scheduleDays.length > 0 ? scheduleDays : undefined,
        scheduleStartTime: scheduleStartTime || undefined,
        scheduleEndTime: scheduleEndTime || undefined,
      });
      toast({ title: "Access code created" });
      onSuccess();
    } catch {
      toast({ title: "Failed to create code", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Name</Label>
        <Input
          placeholder="e.g. Cleaner, House Sitter"
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Code (optional)</Label>
        <Input
          placeholder="e.g. 1234"
          value={code}
          onChange={e => setCode(e.target.value)}
          maxLength={20}
        />
      </div>
      <div className="space-y-2">
        <Label>Schedule</Label>
        <Select value={scheduleType} onValueChange={setScheduleType}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALWAYS">Always active</SelectItem>
            <SelectItem value="TEMPORARY">Temporary (with expiry)</SelectItem>
            <SelectItem value="SCHEDULED">Recurring schedule</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {scheduleType === "TEMPORARY" && (
        <div className="space-y-2">
          <Label>Expires</Label>
          <Input
            type="datetime-local"
            value={expiresAt}
            onChange={e => setExpiresAt(e.target.value)}
          />
        </div>
      )}

      {scheduleType === "SCHEDULED" && (
        <>
          <div className="space-y-2">
            <Label>Days</Label>
            <div className="flex gap-1.5">
              {DAY_NAMES.map((day, i) => (
                <button
                  key={i}
                  type="button"
                  className={cn(
                    "w-9 h-9 rounded-lg text-xs font-medium transition-colors",
                    scheduleDays.includes(i)
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                  onClick={() => toggleDay(i)}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Start Time</Label>
              <Input
                type="time"
                value={scheduleStartTime}
                onChange={e => setScheduleStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>End Time</Label>
              <Input
                type="time"
                value={scheduleEndTime}
                onChange={e => setScheduleEndTime(e.target.value)}
              />
            </div>
          </div>
        </>
      )}

      <Button type="submit" className="w-full" disabled={!name || submitting}>
        {submitting ? "Creating..." : "Create Code"}
      </Button>
    </form>
  );
}
