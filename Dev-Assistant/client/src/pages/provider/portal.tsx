import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Building2, Users, Calendar, DollarSign, TrendingUp,
  Plus, ArrowLeft, Clock, CheckCircle2, AlertCircle,
  MapPin, Star, Briefcase, UserPlus, CalendarPlus,
  Settings, BarChart3, FileText, ChevronRight, XCircle,
  Play, Pause, Eye
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

type Tab = "dashboard" | "clients" | "staff" | "schedule" | "invoices" | "settings" | "register";

const PROVIDER_TYPES = [
  { value: "CLEANING_COMPANY", label: "Cleaning Company" },
  { value: "PERSONAL_ASSISTANT", label: "Personal Assistant" },
  { value: "HANDYMAN", label: "Handyman" },
  { value: "LANDSCAPER", label: "Landscaper" },
  { value: "POOL_SERVICE", label: "Pool Service" },
  { value: "PET_CARE", label: "Pet Care" },
  { value: "MEAL_PREP", label: "Meal Prep" },
  { value: "ORGANIZING", label: "Organizing" },
  { value: "OTHER", label: "Other" },
];

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  CONFIRMED: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  IN_PROGRESS: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  COMPLETED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  CANCELLED: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  NO_SHOW: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  ACTIVE: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  PAUSED: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  ENDED: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function ProviderPortal() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: provider, isLoading: providerLoading, error: providerError } = useQuery({
    queryKey: ["/api/v1/provider/me"],
    retry: false,
  });

  const needsRegistration = providerError && (providerError as any)?.status === 403;

  const [activeTab, setActiveTab] = useState<Tab>(needsRegistration ? "register" : "dashboard");

  if (providerLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading provider portal...</div>
      </div>
    );
  }

  if (needsRegistration || !provider) {
    return <RegistrationView onSuccess={() => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/provider/me"] });
      setActiveTab("dashboard");
    }} />;
  }

  const tabs = [
    { id: "dashboard" as Tab, label: "Dashboard", icon: BarChart3 },
    { id: "clients" as Tab, label: "Clients", icon: Users },
    { id: "staff" as Tab, label: "Staff", icon: Briefcase },
    { id: "schedule" as Tab, label: "Schedule", icon: Calendar },
    { id: "invoices" as Tab, label: "Invoices", icon: FileText },
    { id: "settings" as Tab, label: "Settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen pb-24">
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-3 mb-1">
          <Building2 className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{(provider as any).businessName}</h1>
            <p className="text-xs text-muted-foreground capitalize">
              {(provider as any).type?.replace(/_/g, " ").toLowerCase()} &middot;{" "}
              <Badge variant="outline" className="text-[10px] py-0">
                {(provider as any).subscriptionTier}
              </Badge>
            </p>
          </div>
        </div>
      </div>

      <div className="flex overflow-x-auto gap-1 px-4 mb-4 scrollbar-hide">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors",
              activeTab === tab.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="px-4">
        {activeTab === "dashboard" && <DashboardView />}
        {activeTab === "clients" && <ClientsView />}
        {activeTab === "staff" && <StaffView />}
        {activeTab === "schedule" && <ScheduleView />}
        {activeTab === "invoices" && <InvoicesView />}
        {activeTab === "settings" && <SettingsView provider={provider as any} />}
      </div>
    </div>
  );
}

function RegistrationView({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    businessName: "",
    type: "",
    email: "",
    phone: "",
    description: "",
    city: "",
    state: "",
    postalCode: "",
    serviceRadius: "",
  });

  const registerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/v1/provider/register", {
        ...form,
        serviceRadius: form.serviceRadius ? parseInt(form.serviceRadius) : undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Welcome!", description: "Your provider account has been created." });
      onSuccess();
    },
    onError: (err: any) => {
      toast({ title: "Registration failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <Building2 className="h-10 w-10 mx-auto text-primary mb-2" />
          <CardTitle className="text-2xl">Join as a Service Provider</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your clients, staff, and schedule all in one place. 14-day free trial.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Business Name *</Label>
            <Input value={form.businessName} onChange={e => setForm(f => ({ ...f, businessName: e.target.value }))} placeholder="Your Company Name" />
          </div>
          <div className="space-y-2">
            <Label>Service Type *</Label>
            <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {PROVIDER_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Business Email *</Label>
            <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="hello@yourcompany.com" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(555) 123-4567" />
            </div>
            <div className="space-y-2">
              <Label>Service Radius (mi)</Label>
              <Input type="number" value={form.serviceRadius} onChange={e => setForm(f => ({ ...f, serviceRadius: e.target.value }))} placeholder="25" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>City</Label>
              <Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>State</Label>
              <Input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>ZIP</Label>
              <Input value={form.postalCode} onChange={e => setForm(f => ({ ...f, postalCode: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Tell households about your services..." rows={3} />
          </div>
          <Button
            className="w-full"
            onClick={() => registerMutation.mutate()}
            disabled={!form.businessName || !form.type || !form.email || registerMutation.isPending}
          >
            {registerMutation.isPending ? "Creating Account..." : "Create Provider Account"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function DashboardView() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/v1/provider/dashboard"],
  });

  if (isLoading) return <div className="animate-pulse text-muted-foreground">Loading dashboard...</div>;
  if (!data) return null;

  const stats = [
    { label: "Active Clients", value: data.clients?.active || 0, icon: Users, color: "text-blue-600" },
    { label: "Active Staff", value: data.staff?.active || 0, icon: Briefcase, color: "text-indigo-600" },
    { label: "Jobs Today", value: data.schedule?.todayCount || 0, icon: Calendar, color: "text-amber-600" },
    { label: "This Week", value: data.schedule?.weekCount || 0, icon: TrendingUp, color: "text-green-600" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        {stats.map(stat => (
          <Card key={stat.label} className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <stat.icon className={cn("h-5 w-5", stat.color)} />
                <span className="text-2xl font-bold">{stat.value}</span>
              </div>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {data.schedule?.completedThisMonth > 0 && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">Completed This Month</span>
            </div>
            <p className="text-2xl font-bold">{data.schedule.completedThisMonth}</p>
          </CardContent>
        </Card>
      )}

      {data.upcoming && data.upcoming.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Upcoming Schedule</h3>
          <div className="space-y-2">
            {data.upcoming.map((item: any) => (
              <Card key={item.id} className="border-0 shadow-sm">
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{item.scheduledDate}</p>
                      {item.scheduledTime && (
                        <p className="text-xs text-muted-foreground">{item.scheduledTime}</p>
                      )}
                    </div>
                  </div>
                  <Badge className={cn("text-[10px]", STATUS_COLORS[item.status] || "")}>
                    {item.status}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {(!data.upcoming || data.upcoming.length === 0) && (
        <Card className="border-0 shadow-sm border-dashed">
          <CardContent className="p-8 text-center">
            <Calendar className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No upcoming appointments</p>
            <p className="text-xs text-muted-foreground mt-1">Add clients and schedule visits to get started</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ClientsView() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any>(null);

  const { data: clients = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/v1/provider/clients"],
  });

  const [form, setForm] = useState({
    householdId: "",
    startDate: new Date().toISOString().split("T")[0],
    serviceFrequency: "",
    preferredDay: "",
    baseRateCents: "",
    estimatedHours: "",
    clientNotes: "",
    accessInstructions: "",
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/v1/provider/clients", {
        ...form,
        baseRateCents: form.baseRateCents ? parseInt(form.baseRateCents) : undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Client added" });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/provider/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/provider/dashboard"] });
      setShowAdd(false);
      setForm({ householdId: "", startDate: new Date().toISOString().split("T")[0], serviceFrequency: "", preferredDay: "", baseRateCents: "", estimatedHours: "", clientNotes: "", accessInstructions: "" });
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) return <div className="animate-pulse text-muted-foreground">Loading clients...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Clients</h2>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Client
        </Button>
      </div>

      {clients.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No clients yet</p>
            <p className="text-xs text-muted-foreground mt-1">Link a household to start managing their services</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {clients.map((client: any) => (
            <Card key={client.id} className="border-0 shadow-sm cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => setSelectedClient(client)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Household #{client.householdId?.slice(0, 8)}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {client.serviceFrequency && (
                        <span className="text-xs text-muted-foreground">{client.serviceFrequency}</span>
                      )}
                      {client.preferredDay && (
                        <span className="text-xs text-muted-foreground">&middot; {client.preferredDay}</span>
                      )}
                      {client.baseRateCents && (
                        <span className="text-xs text-muted-foreground">&middot; {formatCents(client.baseRateCents)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={cn("text-[10px]", STATUS_COLORS[client.status] || "")}>
                      {client.status}
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Client</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Household ID *</Label>
              <Input value={form.householdId} onChange={e => setForm(f => ({ ...f, householdId: e.target.value }))}
                placeholder="Paste household ID" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select value={form.serviceFrequency} onValueChange={v => setForm(f => ({ ...f, serviceFrequency: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WEEKLY">Weekly</SelectItem>
                    <SelectItem value="BIWEEKLY">Biweekly</SelectItem>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                    <SelectItem value="ON_DEMAND">On Demand</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Preferred Day</Label>
                <Select value={form.preferredDay} onValueChange={v => setForm(f => ({ ...f, preferredDay: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(d => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Rate (cents)</Label>
                <Input type="number" value={form.baseRateCents} onChange={e => setForm(f => ({ ...f, baseRateCents: e.target.value }))}
                  placeholder="15000" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.clientNotes} onChange={e => setForm(f => ({ ...f, clientNotes: e.target.value }))}
                placeholder="Service notes, preferences..." rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Access Instructions</Label>
              <Textarea value={form.accessInstructions} onChange={e => setForm(f => ({ ...f, accessInstructions: e.target.value }))}
                placeholder="Key location, gate code, etc." rows={2} />
            </div>
            <Button className="w-full" onClick={() => addMutation.mutate()}
              disabled={!form.householdId || addMutation.isPending}>
              {addMutation.isPending ? "Adding..." : "Add Client"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedClient} onOpenChange={() => setSelectedClient(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Client Details</DialogTitle>
          </DialogHeader>
          {selectedClient && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Status:</span> <Badge className={cn("text-[10px] ml-1", STATUS_COLORS[selectedClient.status])}>{selectedClient.status}</Badge></div>
                <div><span className="text-muted-foreground">Frequency:</span> {selectedClient.serviceFrequency || "—"}</div>
                <div><span className="text-muted-foreground">Day:</span> {selectedClient.preferredDay || "—"}</div>
                <div><span className="text-muted-foreground">Rate:</span> {selectedClient.baseRateCents ? formatCents(selectedClient.baseRateCents) : "—"}</div>
                <div><span className="text-muted-foreground">Started:</span> {selectedClient.startDate || "—"}</div>
                <div><span className="text-muted-foreground">Hours:</span> {selectedClient.estimatedHours || "—"}</div>
              </div>
              {selectedClient.clientNotes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm bg-muted p-2 rounded">{selectedClient.clientNotes}</p>
                </div>
              )}
              {selectedClient.accessInstructions && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Access Instructions</p>
                  <p className="text-sm bg-muted p-2 rounded">{selectedClient.accessInstructions}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StaffView() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);

  const { data: staff = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/v1/provider/staff"],
  });

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    role: "STAFF",
    hourlyRate: "",
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/v1/provider/staff", {
        ...form,
        hourlyRate: form.hourlyRate ? parseInt(form.hourlyRate) : undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Staff member added" });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/provider/staff"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/provider/dashboard"] });
      setShowAdd(false);
      setForm({ firstName: "", lastName: "", email: "", phone: "", role: "STAFF", hourlyRate: "" });
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await apiRequest("PATCH", `/api/v1/provider/staff/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/provider/staff"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/provider/dashboard"] });
    },
  });

  if (isLoading) return <div className="animate-pulse text-muted-foreground">Loading staff...</div>;

  const ROLE_BADGES: Record<string, string> = {
    OWNER: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    MANAGER: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    STAFF: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Staff</h2>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <UserPlus className="h-4 w-4 mr-1" /> Add Staff
        </Button>
      </div>

      {staff.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <Briefcase className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No staff members yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {staff.map((member: any) => (
            <Card key={member.id} className={cn("border-0 shadow-sm", !member.isActive && "opacity-60")}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{member.firstName} {member.lastName}</p>
                      <Badge className={cn("text-[10px]", ROLE_BADGES[member.role] || ROLE_BADGES.STAFF)}>
                        {member.role}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      {member.email && <span>{member.email}</span>}
                      {member.hourlyRate && <span>&middot; {formatCents(member.hourlyRate)}/hr</span>}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm"
                    onClick={() => toggleMutation.mutate({ id: member.id, isActive: !member.isActive })}>
                    {member.isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Staff Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>First Name *</Label>
                <Input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Last Name *</Label>
                <Input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STAFF">Staff</SelectItem>
                    <SelectItem value="MANAGER">Manager</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Hourly Rate (cents)</Label>
                <Input type="number" value={form.hourlyRate} onChange={e => setForm(f => ({ ...f, hourlyRate: e.target.value }))}
                  placeholder="2500" />
              </div>
            </div>
            <Button className="w-full" onClick={() => addMutation.mutate()}
              disabled={!form.firstName || !form.lastName || addMutation.isPending}>
              {addMutation.isPending ? "Adding..." : "Add Staff Member"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ScheduleView() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 14);

  const { data: schedule = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/v1/provider/schedule", { startDate: today, endDate: weekEnd.toISOString().split("T")[0] }],
    queryFn: async () => {
      const res = await fetch(`/api/v1/provider/schedule?startDate=${today}&endDate=${weekEnd.toISOString().split("T")[0]}`);
      return res.json();
    },
  });

  const { data: clients = [] } = useQuery<any[]>({ queryKey: ["/api/v1/provider/clients"] });
  const { data: staff = [] } = useQuery<any[]>({ queryKey: ["/api/v1/provider/staff"] });

  const [form, setForm] = useState({
    providerClientId: "",
    staffId: "",
    scheduledDate: today,
    scheduledTime: "09:00",
    estimatedDuration: "120",
    providerNotes: "",
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/v1/provider/schedule", {
        ...form,
        estimatedDuration: form.estimatedDuration ? parseInt(form.estimatedDuration) : undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Visit scheduled" });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/provider/schedule"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/provider/dashboard"] });
      setShowAdd(false);
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: any = { status };
      if (status === "IN_PROGRESS") updates.arrivedAt = new Date().toISOString();
      if (status === "COMPLETED") updates.completedAt = new Date().toISOString();
      await apiRequest("PATCH", `/api/v1/provider/schedule/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/provider/schedule"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/provider/dashboard"] });
    },
  });

  if (isLoading) return <div className="animate-pulse text-muted-foreground">Loading schedule...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Schedule</h2>
        <Button size="sm" onClick={() => setShowAdd(true)} disabled={clients.length === 0}>
          <CalendarPlus className="h-4 w-4 mr-1" /> Add Visit
        </Button>
      </div>

      {schedule.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <Calendar className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No scheduled visits</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {schedule.map((item: any) => (
            <Card key={item.id} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{item.scheduledDate}</span>
                    {item.scheduledTime && <span className="text-xs text-muted-foreground">{item.scheduledTime}</span>}
                  </div>
                  <Badge className={cn("text-[10px]", STATUS_COLORS[item.status] || "")}>
                    {item.status?.replace(/_/g, " ")}
                  </Badge>
                </div>
                {item.estimatedDuration && (
                  <p className="text-xs text-muted-foreground mb-2">
                    <Clock className="h-3 w-3 inline mr-1" />{item.estimatedDuration} min
                  </p>
                )}
                {item.providerNotes && (
                  <p className="text-xs text-muted-foreground">{item.providerNotes}</p>
                )}
                {item.status === "SCHEDULED" && (
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" onClick={() => statusMutation.mutate({ id: item.id, status: "CONFIRMED" })}>
                      Confirm
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => statusMutation.mutate({ id: item.id, status: "CANCELLED" })}>
                      Cancel
                    </Button>
                  </div>
                )}
                {item.status === "CONFIRMED" && (
                  <Button size="sm" className="mt-3" onClick={() => statusMutation.mutate({ id: item.id, status: "IN_PROGRESS" })}>
                    <Play className="h-3 w-3 mr-1" /> Start
                  </Button>
                )}
                {item.status === "IN_PROGRESS" && (
                  <Button size="sm" className="mt-3" onClick={() => statusMutation.mutate({ id: item.id, status: "COMPLETED" })}>
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Complete
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Visit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Client *</Label>
              <Select value={form.providerClientId} onValueChange={v => setForm(f => ({ ...f, providerClientId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      Household #{c.householdId?.slice(0, 8)} {c.preferredDay ? `(${c.preferredDay})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {staff.length > 0 && (
              <div className="space-y-2">
                <Label>Assign Staff</Label>
                <Select value={form.staffId} onValueChange={v => setForm(f => ({ ...f, staffId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    {staff.filter((s: any) => s.isActive).map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input type="date" value={form.scheduledDate} onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input type="time" value={form.scheduledTime} onChange={e => setForm(f => ({ ...f, scheduledTime: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Duration (minutes)</Label>
              <Input type="number" value={form.estimatedDuration} onChange={e => setForm(f => ({ ...f, estimatedDuration: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.providerNotes} onChange={e => setForm(f => ({ ...f, providerNotes: e.target.value }))}
                placeholder="Special instructions..." rows={2} />
            </div>
            <Button className="w-full" onClick={() => addMutation.mutate()}
              disabled={!form.providerClientId || !form.scheduledDate || addMutation.isPending}>
              {addMutation.isPending ? "Scheduling..." : "Schedule Visit"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InvoicesView() {
  const { data: invoiceData = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/v1/provider/invoices"],
  });

  if (isLoading) return <div className="animate-pulse text-muted-foreground">Loading invoices...</div>;

  const totalRevenue = invoiceData.reduce((sum: number, inv: any) => sum + (inv.clientRate || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Invoices</h2>
      </div>

      {totalRevenue > 0 && (
        <Card className="border-0 shadow-sm bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Completed Revenue</p>
            <p className="text-2xl font-bold text-green-700 dark:text-green-400">{formatCents(totalRevenue)}</p>
            <p className="text-xs text-muted-foreground mt-1">{invoiceData.length} completed visits</p>
          </CardContent>
        </Card>
      )}

      {invoiceData.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <DollarSign className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No completed visits to invoice</p>
            <p className="text-xs text-muted-foreground mt-1">Complete scheduled visits to generate invoice data</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {invoiceData.map((inv: any) => (
            <Card key={inv.id} className="border-0 shadow-sm">
              <CardContent className="p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{inv.scheduledDate}</p>
                  <p className="text-xs text-muted-foreground">
                    {inv.estimatedHours}hrs &middot; Client #{inv.clientId?.slice(0, 8)}
                  </p>
                </div>
                <span className="text-sm font-semibold text-green-700 dark:text-green-400">
                  {formatCents(inv.clientRate)}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsView({ provider }: { provider: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    businessName: provider.businessName || "",
    description: provider.description || "",
    phone: provider.phone || "",
    website: provider.website || "",
    address: provider.address || "",
    city: provider.city || "",
    state: provider.state || "",
    postalCode: provider.postalCode || "",
    serviceRadius: provider.serviceRadius?.toString() || "",
    businessLicense: provider.businessLicense || "",
    insuranceProvider: provider.insuranceProvider || "",
    insurancePolicyNumber: provider.insurancePolicyNumber || "",
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/v1/provider/me", {
        ...form,
        serviceRadius: form.serviceRadius ? parseInt(form.serviceRadius) : undefined,
      });
    },
    onSuccess: () => {
      toast({ title: "Settings saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/provider/me"] });
    },
    onError: () => {
      toast({ title: "Failed to save", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Business Settings</h2>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">Business Info</h3>
          <div className="space-y-2">
            <Label>Business Name</Label>
            <Input value={form.businessName} onChange={e => setForm(f => ({ ...f, businessName: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Website</Label>
              <Input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">Location</h3>
          <div className="space-y-2">
            <Label>Address</Label>
            <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>City</Label>
              <Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>State</Label>
              <Input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>ZIP</Label>
              <Input value={form.postalCode} onChange={e => setForm(f => ({ ...f, postalCode: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Service Radius (miles)</Label>
            <Input type="number" value={form.serviceRadius} onChange={e => setForm(f => ({ ...f, serviceRadius: e.target.value }))} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">Insurance & Licensing</h3>
          <div className="space-y-2">
            <Label>Business License</Label>
            <Input value={form.businessLicense} onChange={e => setForm(f => ({ ...f, businessLicense: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Insurance Provider</Label>
              <Input value={form.insuranceProvider} onChange={e => setForm(f => ({ ...f, insuranceProvider: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Policy Number</Label>
              <Input value={form.insurancePolicyNumber} onChange={e => setForm(f => ({ ...f, insurancePolicyNumber: e.target.value }))} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">Verification Status: {provider.isVerified ? "Verified" : "Pending"}</p>
          <p className="text-xs mt-0.5">Complete your profile and submit documentation to get verified</p>
        </div>
      </div>

      <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}
