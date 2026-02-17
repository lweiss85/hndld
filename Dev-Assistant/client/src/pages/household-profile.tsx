import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  Plus, 
  Pencil,
  Trash2,
  MapPin,
  Calendar,
  User,
  Heart,
  Home,
  Shield,
  Clock,
  Wifi,
  Key,
  Gift,
  UtensilsCrossed,
  Package,
  Eye,
  EyeOff,
  Bell
} from "lucide-react";
import { PushNotificationToggle } from "@/components/push-notification-toggle";
import { ReplayTourButton } from "@/components/onboarding/replay-tour-button";
import { useTheme } from "@/lib/theme-provider";
import { format } from "date-fns";
import type { 
  HouseholdSettings, 
  Person, 
  Preference, 
  ImportantDate, 
  HouseholdLocation,
  AccessItem,
  InsertPerson,
  InsertPreference,
  InsertImportantDate,
  InsertHouseholdLocation,
  InsertAccessItem
} from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/lib/user-context";
import { cn } from "@/lib/utils";

const LOCATION_TYPES = [
  { value: "SCHOOL", label: "School" },
  { value: "CLINIC", label: "Clinic" },
  { value: "STORE", label: "Store" },
  { value: "FAMILY", label: "Family" },
  { value: "STUDIO", label: "Studio" },
  { value: "OTHER", label: "Other" },
];

const PERSON_ROLES = [
  { value: "PARENT", label: "Parent" },
  { value: "CHILD", label: "Child" },
  { value: "PET", label: "Pet" },
  { value: "OTHER", label: "Other" },
];

const PREFERENCE_CATEGORIES = [
  { value: "FOOD_DRINK", label: "Food & Drink", icon: UtensilsCrossed },
  { value: "PANTRY", label: "Pantry", icon: Package },
  { value: "GIFTS_FLOWERS", label: "Gifts & Flowers", icon: Gift },
  { value: "HOME", label: "Home", icon: Home },
];

const DATE_TYPES = [
  { value: "BIRTHDAY", label: "Birthday" },
  { value: "ANNIVERSARY", label: "Anniversary" },
  { value: "MEMORIAL", label: "Memorial" },
  { value: "HOLIDAY", label: "Holiday" },
  { value: "OTHER", label: "Other" },
];

const ACCESS_CATEGORIES = [
  { value: "ENTRY", label: "Entry" },
  { value: "WIFI", label: "WiFi" },
  { value: "ALARM", label: "Alarm" },
  { value: "LOCKS", label: "Locks" },
  { value: "GARAGE", label: "Garage" },
  { value: "OTHER", label: "Other" },
];

function ProfileSkeleton() {
  return (
    <div className="px-4 py-6 space-y-4 max-w-4xl mx-auto">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-full" />
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    </div>
  );
}

export default function HouseholdProfile() {
  const { toast } = useToast();
  const { activeRole } = useUser();
  const isAssistant = activeRole === "ASSISTANT";
  const [activeTab, setActiveTab] = useState("overview");

  const { data: settings, isLoading: settingsLoading } = useQuery<HouseholdSettings>({
    queryKey: ["/api/household/settings"],
  });

  const { data: people, isLoading: peopleLoading } = useQuery<Person[]>({
    queryKey: ["/api/people"],
  });

  const { data: preferences, isLoading: preferencesLoading } = useQuery<Preference[]>({
    queryKey: ["/api/preferences"],
  });

  const { data: importantDates, isLoading: datesLoading } = useQuery<ImportantDate[]>({
    queryKey: ["/api/important-dates"],
  });

  const { data: locations, isLoading: locationsLoading } = useQuery<HouseholdLocation[]>({
    queryKey: ["/api/household/locations"],
  });

  const { data: accessItems, isLoading: accessLoading } = useQuery<AccessItem[]>({
    queryKey: ["/api/access-items"],
  });

  const isLoading = settingsLoading || peopleLoading || preferencesLoading || datesLoading || locationsLoading || accessLoading;

  if (isLoading) return <ProfileSkeleton />;

  return (
    <div className="px-4 py-6 space-y-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold" data-testid="text-page-title">Household Profile</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="overflow-x-auto -mx-4 px-4">
          <TabsList className="w-max">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="people" data-testid="tab-people">People</TabsTrigger>
            <TabsTrigger value="preferences" data-testid="tab-preferences">Preferences</TabsTrigger>
            <TabsTrigger value="dates" data-testid="tab-dates">Dates</TabsTrigger>
            <TabsTrigger value="locations" data-testid="tab-locations">Locations</TabsTrigger>
            <TabsTrigger value="access" data-testid="tab-access">Access</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab settings={settings} isAssistant={isAssistant} />
        </TabsContent>

        <TabsContent value="people" className="mt-4">
          <PeopleTab people={people || []} isAssistant={isAssistant} />
        </TabsContent>

        <TabsContent value="preferences" className="mt-4">
          <PreferencesTab preferences={preferences || []} isAssistant={isAssistant} />
        </TabsContent>

        <TabsContent value="dates" className="mt-4">
          <ImportantDatesTab dates={importantDates || []} people={people || []} isAssistant={isAssistant} />
        </TabsContent>

        <TabsContent value="locations" className="mt-4">
          <LocationsTab locations={locations || []} isAssistant={isAssistant} />
        </TabsContent>

        <TabsContent value="access" className="mt-4">
          <AccessTab items={accessItems || []} isAssistant={isAssistant} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OverviewTab({ settings, isAssistant }: { settings?: HouseholdSettings; isAssistant: boolean }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Home className="h-5 w-5" />
            Addresses
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Primary Address</Label>
            <p className="text-sm" data-testid="text-primary-address">
              {settings?.primaryAddress || "Not set"}
            </p>
          </div>
          {settings?.secondaryAddress && (
            <div>
              <Label className="text-xs text-muted-foreground">Secondary Address</Label>
              <p className="text-sm" data-testid="text-secondary-address">{settings.secondaryAddress}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5" />
            Quiet Hours
          </CardTitle>
        </CardHeader>
        <CardContent>
          {settings?.quietHoursStart && settings?.quietHoursEnd ? (
            <p className="text-sm" data-testid="text-quiet-hours">
              {settings.quietHoursStart} - {settings.quietHoursEnd}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Not set</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5" />
            Approval Threshold
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm" data-testid="text-approval-threshold">
            {settings?.approvalThreshold 
              ? `$${(settings.approvalThreshold / 100).toFixed(2)}` 
              : "$100.00 (default)"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Purchases above this amount require approval
          </p>
        </CardContent>
      </Card>

      {settings?.entryInstructions && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Key className="h-5 w-5" />
              Entry Instructions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap" data-testid="text-entry-instructions">
              {settings.entryInstructions}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bell className="h-5 w-5" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PushNotificationToggle />
          <p className="text-xs text-muted-foreground mt-3">
            Enable to receive instant alerts about approvals, tasks, and updates
          </p>
        </CardContent>
      </Card>

      <AppearanceCard />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Home className="h-5 w-5" />
            App Tour
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ReplayTourButton />
          <p className="text-xs text-muted-foreground mt-3">
            Replay the guided walkthrough of the app's main features
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function AppearanceCard() {
  const { theme, setTheme, oled, setOled } = useTheme();
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const isDark = theme === "dark" || (theme === "system" && systemDark);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Eye className="h-5 w-5" />
          Appearance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="dark-mode-toggle">Dark mode</Label>
          <Switch
            id="dark-mode-toggle"
            checked={isDark}
            onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
          />
        </div>
        {isDark && (
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="oled-toggle">True black (OLED)</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Pure black background for OLED screens</p>
            </div>
            <Switch
              id="oled-toggle"
              checked={oled}
              onCheckedChange={setOled}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PeopleTab({ people, isAssistant }: { people: Person[]; isAssistant: boolean }) {
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [formData, setFormData] = useState<Partial<InsertPerson>>({
    fullName: "",
    preferredName: "",
    role: "OTHER",
    allergies: [],
    dietaryRules: [],
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<InsertPerson>) => apiRequest("POST", "/api/people", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/people"] });
      setShowDialog(false);
      resetForm();
      toast({ title: "Person added", description: "The person has been added to the household" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<InsertPerson>) => 
      apiRequest("PUT", `/api/people/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/people"] });
      setShowDialog(false);
      resetForm();
      toast({ title: "Person updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/people/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/people"] });
      toast({ title: "Person removed" });
    },
  });

  const resetForm = () => {
    setEditingPerson(null);
    setFormData({ fullName: "", preferredName: "", role: "OTHER", allergies: [], dietaryRules: [] });
  };

  const openEdit = (person: Person) => {
    setEditingPerson(person);
    setFormData({
      fullName: person.fullName,
      preferredName: person.preferredName || "",
      role: person.role,
      allergies: person.allergies || [],
      dietaryRules: person.dietaryRules || [],
      clothingSize: person.clothingSize || "",
      shoeSize: person.shoeSize || "",
    });
    setShowDialog(true);
  };

  const handleSubmit = () => {
    if (!formData.fullName) return;
    if (editingPerson) {
      updateMutation.mutate({ id: editingPerson.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const members = people.filter(p => p.role !== "PET");
  const pets = people.filter(p => p.role === "PET");

  return (
    <div className="space-y-4">
      {isAssistant && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { resetForm(); setShowDialog(true); }} data-testid="button-add-person">
            <Plus className="h-4 w-4 mr-1" />
            Add Person
          </Button>
        </div>
      )}

      {members.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Household Members</h3>
          {members.map((person) => (
            <Card key={person.id} data-testid={`card-person-${person.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{person.fullName}</span>
                      {person.preferredName && (
                        <span className="text-sm text-muted-foreground">({person.preferredName})</span>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {PERSON_ROLES.find(r => r.value === person.role)?.label || person.role}
                      </Badge>
                    </div>
                    {person.allergies && person.allergies.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Allergies: {(person.allergies as string[]).join(", ")}
                      </p>
                    )}
                  </div>
                  {isAssistant && (
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(person)} data-testid={`button-edit-person-${person.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(person.id)} data-testid={`button-delete-person-${person.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {pets.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Pets</h3>
          {pets.map((pet) => (
            <Card key={pet.id} data-testid={`card-pet-${pet.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <span className="font-medium">{pet.fullName}</span>
                    {pet.dietaryRules && (pet.dietaryRules as string[]).length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Diet: {(pet.dietaryRules as string[]).join(", ")}
                      </p>
                    )}
                  </div>
                  {isAssistant && (
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(pet)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(pet.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {people.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <User className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-medium text-lg mb-1">No people added</h3>
          <p className="text-sm text-muted-foreground">
            {isAssistant ? "Add household members and pets" : "No household members have been added yet"}
          </p>
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPerson ? "Edit Person" : "Add Person"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Full Name</Label>
              <Input
                value={formData.fullName || ""}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                placeholder="John Smith"
                data-testid="input-person-name"
              />
            </div>
            <div>
              <Label>Preferred Name</Label>
              <Input
                value={formData.preferredName || ""}
                onChange={(e) => setFormData({ ...formData, preferredName: e.target.value })}
                placeholder="Johnny"
                data-testid="input-person-preferred-name"
              />
            </div>
            <div>
              <Label>Role</Label>
              <Select
                value={formData.role || "OTHER"}
                onValueChange={(value) => setFormData({ ...formData, role: value as any })}
              >
                <SelectTrigger data-testid="select-person-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERSON_ROLES.map((role) => (
                    <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Allergies (comma-separated)</Label>
              <Input
                value={(formData.allergies as string[])?.join(", ") || ""}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  allergies: e.target.value.split(",").map(s => s.trim()).filter(Boolean) 
                })}
                placeholder="Peanuts, Shellfish"
                data-testid="input-person-allergies"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleSubmit} 
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-person"
            >
              {editingPerson ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PreferencesTab({ preferences, isAssistant }: { preferences: Preference[]; isAssistant: boolean }) {
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [editingPreference, setEditingPreference] = useState<Preference | null>(null);
  const [formData, setFormData] = useState<Partial<InsertPreference>>({
    category: "FOOD_DRINK",
    key: "",
    value: "",
    isNoGo: false,
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<InsertPreference>) => apiRequest("POST", "/api/preferences", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preferences"] });
      setShowDialog(false);
      resetForm();
      toast({ title: "Preference added" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<InsertPreference>) => 
      apiRequest("PUT", `/api/preferences/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preferences"] });
      setShowDialog(false);
      resetForm();
      toast({ title: "Preference updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/preferences/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preferences"] });
      toast({ title: "Preference removed" });
    },
  });

  const resetForm = () => {
    setEditingPreference(null);
    setFormData({ category: "FOOD_DRINK", key: "", value: "", isNoGo: false });
  };

  const openEdit = (pref: Preference) => {
    setEditingPreference(pref);
    setFormData({
      category: pref.category,
      key: pref.key,
      value: pref.value,
      isNoGo: pref.isNoGo,
    });
    setShowDialog(true);
  };

  const handleSubmit = () => {
    if (!formData.key || !formData.value) return;
    if (editingPreference) {
      updateMutation.mutate({ id: editingPreference.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const groupedPreferences = PREFERENCE_CATEGORIES.reduce((acc, cat) => {
    acc[cat.value] = preferences.filter(p => p.category === cat.value);
    return acc;
  }, {} as Record<string, Preference[]>);

  return (
    <div className="space-y-4">
      {isAssistant && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { resetForm(); setShowDialog(true); }} data-testid="button-add-preference">
            <Plus className="h-4 w-4 mr-1" />
            Add Preference
          </Button>
        </div>
      )}

      {PREFERENCE_CATEGORIES.map(({ value, label, icon: Icon }) => {
        const items = groupedPreferences[value] || [];
        if (items.length === 0) return null;
        
        return (
          <div key={value} className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Icon className="h-4 w-4" />
              {label}
            </h3>
            {items.map((pref) => (
              <Card key={pref.id} data-testid={`card-preference-${pref.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{pref.key}</span>
                        {pref.isNoGo && (
                          <Badge variant="destructive" className="text-xs">No-Go</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{pref.value}</p>
                    </div>
                    {isAssistant && (
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(pref)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(pref.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        );
      })}

      {preferences.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Heart className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-medium text-lg mb-1">No preferences added</h3>
          <p className="text-sm text-muted-foreground">
            {isAssistant ? "Add household preferences" : "No preferences have been added yet"}
          </p>
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPreference ? "Edit Preference" : "Add Preference"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Category</Label>
              <Select
                value={formData.category || "FOOD_DRINK"}
                onValueChange={(value) => setFormData({ ...formData, category: value as any })}
              >
                <SelectTrigger data-testid="select-preference-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PREFERENCE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Name</Label>
              <Input
                value={formData.key || ""}
                onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                placeholder="Coffee brand"
                data-testid="input-preference-key"
              />
            </div>
            <div>
              <Label>Details</Label>
              <Textarea
                value={formData.value || ""}
                onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                placeholder="Only buy organic, fair-trade"
                rows={2}
                data-testid="input-preference-value"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.isNoGo || false}
                onCheckedChange={(checked) => setFormData({ ...formData, isNoGo: checked })}
                data-testid="switch-preference-nogo"
              />
              <Label>Mark as No-Go (never buy/do)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-preference"
            >
              {editingPreference ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface DateFormData {
  type: "BIRTHDAY" | "ANNIVERSARY" | "MEMORIAL" | "HOLIDAY" | "OTHER";
  title: string;
  dateString: string;
  notes: string;
  personId?: string;
}

function ImportantDatesTab({ dates, people, isAssistant }: { dates: ImportantDate[]; people: Person[]; isAssistant: boolean }) {
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [editingDate, setEditingDate] = useState<ImportantDate | null>(null);
  const [formData, setFormData] = useState<DateFormData>({
    type: "BIRTHDAY",
    title: "",
    dateString: new Date().toISOString().split('T')[0],
    notes: "",
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<InsertImportantDate>) => apiRequest("POST", "/api/important-dates", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/important-dates"] });
      setShowDialog(false);
      resetForm();
      toast({ title: "Date added" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<InsertImportantDate>) => 
      apiRequest("PUT", `/api/important-dates/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/important-dates"] });
      setShowDialog(false);
      resetForm();
      toast({ title: "Date updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/important-dates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/important-dates"] });
      toast({ title: "Date removed" });
    },
  });

  const resetForm = () => {
    setEditingDate(null);
    setFormData({ type: "BIRTHDAY", title: "", dateString: new Date().toISOString().split('T')[0], notes: "" });
  };

  const openEdit = (date: ImportantDate) => {
    setEditingDate(date);
    setFormData({
      type: date.type || "BIRTHDAY",
      title: date.title,
      dateString: date.date ? new Date(date.date).toISOString().split('T')[0] : "",
      notes: date.notes || "",
      personId: date.personId || undefined,
    });
    setShowDialog(true);
  };

  const handleSubmit = () => {
    if (!formData.title || !formData.dateString) return;
    const submitData: Partial<InsertImportantDate> = {
      type: formData.type,
      title: formData.title,
      date: new Date(formData.dateString),
      notes: formData.notes,
      personId: formData.personId,
    };
    if (editingDate) {
      updateMutation.mutate({ id: editingDate.id, ...submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const sortedDates = [...dates].sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    dateA.setFullYear(2000);
    dateB.setFullYear(2000);
    return dateA.getTime() - dateB.getTime();
  });

  return (
    <div className="space-y-4">
      {isAssistant && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { resetForm(); setShowDialog(true); }} data-testid="button-add-date">
            <Plus className="h-4 w-4 mr-1" />
            Add Date
          </Button>
        </div>
      )}

      {sortedDates.length > 0 ? (
        <div className="space-y-2">
          {sortedDates.map((date) => (
            <Card key={date.id} data-testid={`card-date-${date.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{date.title}</span>
                      <Badge variant="outline" className="text-xs">
                        {DATE_TYPES.find(t => t.value === date.type)?.label || date.type}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(date.date), "MMMM d")}
                    </p>
                    {date.notes && (
                      <p className="text-xs text-muted-foreground mt-1">{date.notes}</p>
                    )}
                  </div>
                  {isAssistant && (
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(date)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(date.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Calendar className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-medium text-lg mb-1">No important dates</h3>
          <p className="text-sm text-muted-foreground">
            {isAssistant ? "Add birthdays, anniversaries, and more" : "No dates have been added yet"}
          </p>
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingDate ? "Edit Date" : "Add Important Date"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Type</Label>
              <Select
                value={formData.type || "BIRTHDAY"}
                onValueChange={(value) => setFormData({ ...formData, type: value as any })}
              >
                <SelectTrigger data-testid="select-date-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATE_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Title</Label>
              <Input
                value={formData.title || ""}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Mom's Birthday"
                data-testid="input-date-title"
              />
            </div>
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={formData.dateString || ""}
                onChange={(e) => setFormData({ ...formData, dateString: e.target.value })}
                data-testid="input-date-value"
              />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                value={formData.notes || ""}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Gift ideas, party plans..."
                rows={2}
                data-testid="input-date-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-date"
            >
              {editingDate ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LocationsTab({ locations, isAssistant }: { locations: HouseholdLocation[]; isAssistant: boolean }) {
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [editingLocation, setEditingLocation] = useState<HouseholdLocation | null>(null);
  const [formData, setFormData] = useState<Partial<InsertHouseholdLocation>>({
    name: "",
    type: "OTHER",
    address: "",
    notes: "",
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<InsertHouseholdLocation>) => apiRequest("POST", "/api/household/locations", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/household/locations"] });
      setShowDialog(false);
      resetForm();
      toast({ title: "Location added" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<InsertHouseholdLocation>) => 
      apiRequest("PUT", `/api/household/locations/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/household/locations"] });
      setShowDialog(false);
      resetForm();
      toast({ title: "Location updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/household/locations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/household/locations"] });
      toast({ title: "Location removed" });
    },
  });

  const resetForm = () => {
    setEditingLocation(null);
    setFormData({ name: "", type: "OTHER", address: "", notes: "" });
  };

  const openEdit = (location: HouseholdLocation) => {
    setEditingLocation(location);
    setFormData({
      name: location.name,
      type: location.type,
      address: location.address || "",
      notes: location.notes || "",
    });
    setShowDialog(true);
  };

  const handleSubmit = () => {
    if (!formData.name) return;
    if (editingLocation) {
      updateMutation.mutate({ id: editingLocation.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const groupedLocations = LOCATION_TYPES.reduce((acc, type) => {
    acc[type.value] = locations.filter(l => l.type === type.value);
    return acc;
  }, {} as Record<string, HouseholdLocation[]>);

  return (
    <div className="space-y-4">
      {isAssistant && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { resetForm(); setShowDialog(true); }} data-testid="button-add-location">
            <Plus className="h-4 w-4 mr-1" />
            Add Location
          </Button>
        </div>
      )}

      {LOCATION_TYPES.map(({ value, label }) => {
        const items = groupedLocations[value] || [];
        if (items.length === 0) return null;
        
        return (
          <div key={value} className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">{label}s</h3>
            {items.map((location) => (
              <Card key={location.id} data-testid={`card-location-${location.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{location.name}</span>
                      {location.address && (
                        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {location.address}
                        </p>
                      )}
                      {location.notes && (
                        <p className="text-xs text-muted-foreground mt-1">{location.notes}</p>
                      )}
                    </div>
                    {isAssistant && (
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(location)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(location.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        );
      })}

      {locations.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <MapPin className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-medium text-lg mb-1">No locations added</h3>
          <p className="text-sm text-muted-foreground">
            {isAssistant ? "Add schools, clinics, and other places" : "No locations have been added yet"}
          </p>
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingLocation ? "Edit Location" : "Add Location"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Type</Label>
              <Select
                value={formData.type || "OTHER"}
                onValueChange={(value) => setFormData({ ...formData, type: value as any })}
              >
                <SelectTrigger data-testid="select-location-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCATION_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Name</Label>
              <Input
                value={formData.name || ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Lincoln Elementary"
                data-testid="input-location-name"
              />
            </div>
            <div>
              <Label>Address</Label>
              <Input
                value={formData.address || ""}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="123 Main St"
                data-testid="input-location-address"
              />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                value={formData.notes || ""}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Pick-up line, parking info..."
                rows={2}
                data-testid="input-location-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-location"
            >
              {editingLocation ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AccessTab({ items, isAssistant }: { items: AccessItem[]; isAssistant: boolean }) {
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<AccessItem | null>(null);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState<Partial<InsertAccessItem>>({
    category: "WIFI",
    title: "",
    value: "",
    notes: "",
    isSensitive: true,
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<InsertAccessItem>) => apiRequest("POST", "/api/access-items", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/access-items"] });
      setShowDialog(false);
      resetForm();
      toast({ title: "Access item added" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<InsertAccessItem>) => 
      apiRequest("PUT", `/api/access-items/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/access-items"] });
      setShowDialog(false);
      resetForm();
      toast({ title: "Access item updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/access-items/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/access-items"] });
      toast({ title: "Access item removed" });
    },
  });

  const resetForm = () => {
    setEditingItem(null);
    setFormData({ category: "WIFI", title: "", value: "", notes: "", isSensitive: true });
  };

  const openEdit = (item: AccessItem) => {
    setEditingItem(item);
    setFormData({
      category: item.category,
      title: item.title,
      value: item.value,
      notes: item.notes || "",
      isSensitive: item.isSensitive,
    });
    setShowDialog(true);
  };

  const handleSubmit = () => {
    if (!formData.title || !formData.value) return;
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const toggleReveal = (id: string) => {
    setRevealedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getAccessIcon = (category: string) => {
    switch (category) {
      case "WIFI": return <Wifi className="h-4 w-4" />;
      case "ALARM": return <Shield className="h-4 w-4" />;
      case "ENTRY": return <Key className="h-4 w-4" />;
      default: return <Key className="h-4 w-4" />;
    }
  };

  const groupedItems = ACCESS_CATEGORIES.reduce((acc, cat) => {
    acc[cat.value] = items.filter(i => i.category === cat.value);
    return acc;
  }, {} as Record<string, AccessItem[]>);

  return (
    <div className="space-y-4">
      {isAssistant && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { resetForm(); setShowDialog(true); }} data-testid="button-add-access">
            <Plus className="h-4 w-4 mr-1" />
            Add Access Item
          </Button>
        </div>
      )}

      {ACCESS_CATEGORIES.map(({ value, label }) => {
        const categoryItems = groupedItems[value] || [];
        if (categoryItems.length === 0) return null;
        
        return (
          <div key={value} className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
            {categoryItems.map((item) => {
              const isRevealed = revealedIds.has(item.id);
              const displayValue = item.value === "********" ? item.value : 
                (item.isSensitive && !isRevealed ? "********" : item.value);
              
              return (
                <Card key={item.id} data-testid={`card-access-${item.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {getAccessIcon(item.category)}
                          <span className="font-medium">{item.title}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <code className="text-sm bg-muted px-2 py-0.5 rounded" data-testid={`text-access-value-${item.id}`}>
                            {displayValue}
                          </code>
                          {item.isSensitive && item.value !== "********" && (
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-6 w-6" 
                              onClick={() => toggleReveal(item.id)}
                              data-testid={`button-toggle-reveal-${item.id}`}
                            >
                              {isRevealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            </Button>
                          )}
                        </div>
                        {item.notes && (
                          <p className="text-xs text-muted-foreground mt-1">{item.notes}</p>
                        )}
                      </div>
                      {isAssistant && (
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(item)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(item.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        );
      })}

      {items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Shield className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-medium text-lg mb-1">No access items</h3>
          <p className="text-sm text-muted-foreground">
            {isAssistant ? "Add WiFi passwords, alarm codes, etc." : "No access items have been added yet"}
          </p>
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Access Item" : "Add Access Item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Category</Label>
              <Select
                value={formData.category || "WIFI"}
                onValueChange={(value) => setFormData({ ...formData, category: value as any })}
              >
                <SelectTrigger data-testid="select-access-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCESS_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Title</Label>
              <Input
                value={formData.title || ""}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Home WiFi"
                data-testid="input-access-title"
              />
            </div>
            <div>
              <Label>Value</Label>
              <Input
                value={formData.value || ""}
                onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                placeholder="Password or code"
                data-testid="input-access-value"
              />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                value={formData.notes || ""}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional instructions"
                rows={2}
                data-testid="input-access-notes"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.isSensitive ?? true}
                onCheckedChange={(checked) => setFormData({ ...formData, isSensitive: checked })}
                data-testid="switch-access-sensitive"
              />
              <Label>Mark as sensitive (mask value for clients)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-access"
            >
              {editingItem ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
