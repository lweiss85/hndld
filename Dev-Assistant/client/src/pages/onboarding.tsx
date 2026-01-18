import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Plus, 
  Trash2, 
  Check,
  Home,
  MapPin,
  Clock,
  Users,
  DollarSign,
  ChevronRight,
  ChevronLeft,
  Heart,
  Key,
  Building2,
  ExternalLink,
  Shield
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useLocation, Link } from "wouter";
import { OnboardingSteps } from "@/components/onboarding-steps";

const TOTAL_STEPS = 5;

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time" },
  { value: "America/Chicago", label: "Central Time" },
  { value: "America/Denver", label: "Mountain Time" },
  { value: "America/Los_Angeles", label: "Pacific Time" },
  { value: "America/Phoenix", label: "Arizona Time" },
  { value: "America/Anchorage", label: "Alaska Time" },
  { value: "Pacific/Honolulu", label: "Hawaii Time" },
];

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

const CELEBRATION_STYLES = [
  "low-key",
  "party",
  "dinner out",
  "gifts",
  "experiences",
];

const ALLERGY_OPTIONS = [
  "peanuts",
  "tree nuts",
  "dairy",
  "eggs",
  "shellfish",
  "gluten",
];

const DIETARY_OPTIONS = [
  "none",
  "vegetarian",
  "pescatarian",
  "gluten-free",
  "dairy-free",
  "nut-free",
];

const WHEN_IN_DOUBT_OPTIONS = [
  "choose earlier appointment",
  "buy organic produce",
  "text before entering home",
  "substitute brand ok",
  "substitute brand not ok",
];

const PREFERENCE_CATEGORIES = [
  { value: "FOOD_DRINK", label: "Food & Drink" },
  { value: "PANTRY", label: "Pantry" },
  { value: "GIFTS_FLOWERS", label: "Gifts & Flowers" },
  { value: "HOME", label: "Home" },
];

const ACCESS_ITEM_TYPES = [
  { value: "WIFI", label: "WiFi Password" },
  { value: "ALARM", label: "Alarm Code" },
  { value: "ENTRY", label: "Gate Code" },
  { value: "LOCKS", label: "Key Location" },
  { value: "OTHER", label: "Other" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => {
  const hour = i;
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return {
    value: `${hour.toString().padStart(2, "0")}:00`,
    label: `${displayHour}:00 ${period}`,
  };
});

interface HouseholdBasics {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  timezone: string;
}

interface Location {
  id: string;
  name: string;
  type: string;
  address: string;
}

interface QuietHoursEntry {
  quietHoursStart: string;
  quietHoursEnd: string;
  entryInstructions: string;
}

interface Person {
  id: string;
  fullName: string;
  preferredName: string;
  role: string;
  birthday: string;
  celebrationStyle: string[];
  allergies: string[];
  allergyOther: string;
  dietaryRules: string[];
  dietaryOther: string;
}

interface RulesOfEngagement {
  approvalThreshold: number;
  whenInDoubtRules: string[];
}

interface Preference {
  id: string;
  category: string;
  key: string;
  value: string;
  isNoGo: boolean;
}

interface AccessItem {
  id: string;
  category: string;
  title: string;
  value: string;
  notes: string;
}

function getPhaseInfo(step: number): { phase: number; label: string } {
  if (step <= 2) return { phase: 1, label: "Getting Started" };
  if (step <= 4) return { phase: 2, label: "Preferences" };
  return { phase: 3, label: "Ready to Go" };
}

function ChipSelect({
  options,
  selected,
  onToggle,
  allowOther = false,
  otherValue = "",
  onOtherChange,
}: {
  options: string[];
  selected: string[];
  onToggle: (option: string) => void;
  allowOther?: boolean;
  otherValue?: string;
  onOtherChange?: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Badge
          key={option}
          variant={selected.includes(option) ? "default" : "outline"}
          className={cn(
            "cursor-pointer",
            selected.includes(option) && "toggle-elevate toggle-elevated"
          )}
          onClick={() => onToggle(option)}
          data-testid={`chip-${option.replace(/\s+/g, "-").toLowerCase()}`}
        >
          {option}
        </Badge>
      ))}
      {allowOther && (
        <Input
          placeholder="Other..."
          value={otherValue}
          onChange={(e) => onOtherChange?.(e.target.value)}
          className="w-32"
          data-testid="input-other"
        />
      )}
    </div>
  );
}

function OnboardingSkeleton() {
  return (
    <div className="min-h-screen px-4 py-6 space-y-6 max-w-lg mx-auto">
      <Skeleton className="h-2 w-full" />
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export default function Onboarding() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(1);
  
  const [basics, setBasics] = useState<HouseholdBasics>({
    name: "",
    street: "",
    city: "",
    state: "",
    zip: "",
    timezone: "America/Chicago",
  });

  const [locations, setLocations] = useState<Location[]>([]);
  const [newLocation, setNewLocation] = useState<Partial<Location>>({
    name: "",
    type: "OTHER",
    address: "",
  });

  const [quietHoursEntry, setQuietHoursEntry] = useState<QuietHoursEntry>({
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
    entryInstructions: "",
  });

  const [people, setPeople] = useState<Person[]>([]);
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [newPerson, setNewPerson] = useState<Partial<Person>>({
    fullName: "",
    preferredName: "",
    role: "OTHER",
    birthday: "",
    celebrationStyle: [],
    allergies: [],
    allergyOther: "",
    dietaryRules: [],
    dietaryOther: "",
  });

  const [rules, setRules] = useState<RulesOfEngagement>({
    approvalThreshold: 100,
    whenInDoubtRules: [],
  });

  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [selectedPreferenceCategory, setSelectedPreferenceCategory] = useState("FOOD_DRINK");
  const [newPreference, setNewPreference] = useState<Partial<Preference>>({
    key: "",
    value: "",
    isNoGo: false,
  });

  const [accessItems, setAccessItems] = useState<AccessItem[]>([]);
  const [newAccessItem, setNewAccessItem] = useState<Partial<AccessItem>>({
    category: "WIFI",
    title: "",
    value: "",
    notes: "",
  });

  const { data: existingSettings, isLoading } = useQuery({
    queryKey: ["/api/onboarding/settings"],
  });

  const saveStepMutation = useMutation({
    mutationFn: async (data: { step: number; data: any }) => {
      return apiRequest("POST", "/api/onboarding/save-step", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/settings"] });
    },
    onError: (error) => {
      toast({
        title: "Error saving",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const savePreferenceMutation = useMutation({
    mutationFn: async (pref: { category: string; key: string; value: string; isNoGo: boolean }) => {
      return apiRequest("POST", "/api/preferences", pref);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preferences"] });
    },
    onError: (error) => {
      toast({
        title: "Error saving preference",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const saveAccessItemMutation = useMutation({
    mutationFn: async (item: { category: string; title: string; value: string; notes?: string; isSensitive: boolean }) => {
      return apiRequest("POST", "/api/access-items", item);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/access-items"] });
    },
    onError: (error) => {
      toast({
        title: "Error saving access item",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const completePhase1Mutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/onboarding/complete-phase", { phase: 1 });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-profile"] });
      toast({
        title: "Phase 1 complete!",
        description: "Household basics have been saved",
      });
    },
    onError: (error) => {
      toast({
        title: "Error completing phase",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const completePhase2Mutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/onboarding/complete-phase", { phase: 2 });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-profile"] });
      toast({
        title: "Phase 2 complete!",
        description: "Preferences have been saved",
      });
    },
    onError: (error) => {
      toast({
        title: "Error completing phase",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const completePhase3Mutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/onboarding/complete-phase", { phase: 3 });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-profile"] });
      toast({
        title: "Setup complete!",
        description: "Your household profile is fully configured",
      });
      setLocation("/");
    },
    onError: (error) => {
      toast({
        title: "Error completing setup",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleNext = async () => {
    const stepData = getStepData();
    if (stepData && Object.keys(stepData).length > 0) {
      await saveStepMutation.mutateAsync({ step, data: stepData });
    }
    setStep((prev) => Math.min(prev + 1, TOTAL_STEPS));
  };

  const handleBack = () => {
    setStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSkip = () => {
    setStep((prev) => Math.min(prev + 1, TOTAL_STEPS));
  };

  const getStepData = () => {
    switch (step) {
      case 1:
        return { type: "basics", ...basics };
      case 2:
        return { type: "people", people };
      case 3:
        return { type: "rules", ...rules };
      case 4:
        return { type: "accessItems", accessItems };
      default:
        return {};
    }
  };

  const addLocation = () => {
    if (newLocation.name) {
      setLocations([
        ...locations,
        {
          id: Date.now().toString(),
          name: newLocation.name || "",
          type: newLocation.type || "OTHER",
          address: newLocation.address || "",
        },
      ]);
      setNewLocation({ name: "", type: "OTHER", address: "" });
    }
  };

  const removeLocation = (id: string) => {
    setLocations(locations.filter((l) => l.id !== id));
  };

  const togglePersonChip = (field: "celebrationStyle" | "allergies" | "dietaryRules", option: string) => {
    const current = newPerson[field] || [];
    if (current.includes(option)) {
      setNewPerson({
        ...newPerson,
        [field]: current.filter((o) => o !== option),
      });
    } else {
      setNewPerson({
        ...newPerson,
        [field]: [...current, option],
      });
    }
  };

  const addPerson = () => {
    if (newPerson.fullName) {
      setPeople([
        ...people,
        {
          id: Date.now().toString(),
          fullName: newPerson.fullName || "",
          preferredName: newPerson.preferredName || "",
          role: newPerson.role || "OTHER",
          birthday: newPerson.birthday || "",
          celebrationStyle: newPerson.celebrationStyle || [],
          allergies: newPerson.allergies || [],
          allergyOther: newPerson.allergyOther || "",
          dietaryRules: newPerson.dietaryRules || [],
          dietaryOther: newPerson.dietaryOther || "",
        },
      ]);
      setNewPerson({
        fullName: "",
        preferredName: "",
        role: "OTHER",
        birthday: "",
        celebrationStyle: [],
        allergies: [],
        allergyOther: "",
        dietaryRules: [],
        dietaryOther: "",
      });
      setShowAddPerson(false);
    }
  };

  const removePerson = (id: string) => {
    setPeople(people.filter((p) => p.id !== id));
  };

  const toggleWhenInDoubtRule = (rule: string) => {
    if (rules.whenInDoubtRules.includes(rule)) {
      setRules({
        ...rules,
        whenInDoubtRules: rules.whenInDoubtRules.filter((r) => r !== rule),
      });
    } else {
      setRules({
        ...rules,
        whenInDoubtRules: [...rules.whenInDoubtRules, rule],
      });
    }
  };

  const addPreference = async () => {
    if (newPreference.key && newPreference.value) {
      const pref: Preference = {
        id: Date.now().toString(),
        category: selectedPreferenceCategory,
        key: newPreference.key || "",
        value: newPreference.value || "",
        isNoGo: newPreference.isNoGo || false,
      };
      setPreferences([...preferences, pref]);
      
      try {
        await savePreferenceMutation.mutateAsync({
          category: selectedPreferenceCategory,
          key: pref.key,
          value: pref.value,
          isNoGo: pref.isNoGo,
        });
      } catch (e) {
        // Already handled by mutation error handler
      }
      
      setNewPreference({ key: "", value: "", isNoGo: false });
    }
  };

  const removePreference = (id: string) => {
    setPreferences(preferences.filter((p) => p.id !== id));
  };

  const addAccessItem = async () => {
    if (newAccessItem.title && newAccessItem.value) {
      const item: AccessItem = {
        id: Date.now().toString(),
        category: newAccessItem.category || "OTHER",
        title: newAccessItem.title || "",
        value: newAccessItem.value || "",
        notes: newAccessItem.notes || "",
      };
      setAccessItems([...accessItems, item]);
      
      try {
        await saveAccessItemMutation.mutateAsync({
          category: item.category,
          title: item.title,
          value: item.value,
          notes: item.notes,
          isSensitive: true,
        });
      } catch (e) {
        // Already handled by mutation error handler
      }
      
      setNewAccessItem({ category: "WIFI", title: "", value: "", notes: "" });
    }
  };

  const removeAccessItem = (id: string) => {
    setAccessItems(accessItems.filter((a) => a.id !== id));
  };

  const getPreferencesByCategory = (category: string) => {
    return preferences.filter((p) => p.category === category);
  };

  if (isLoading) return <OnboardingSkeleton />;

  const phaseInfo = getPhaseInfo(step);
  const progressPercent = ((step - 1) / (TOTAL_STEPS - 1)) * 100;
  const isPhaseCompletionStep = step === 5;

  return (
    <div className="min-h-screen bg-background">
      <div className="px-4 py-6 space-y-6 max-w-lg mx-auto">
        <div className="space-y-4">
          <OnboardingSteps currentStep={step} />
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-xs" data-testid="badge-phase">
              {phaseInfo.label}
            </Badge>
            {!isPhaseCompletionStep && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkip}
                data-testid="button-skip"
              >
                Skip for now
              </Button>
            )}
          </div>
        </div>

        {step === 1 && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Home className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold" data-testid="text-step-title">Household Basics</h1>
                <p className="text-sm text-muted-foreground">Let's set up your home</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Household Name</label>
                <Input
                  placeholder="e.g., The Smith Family"
                  value={basics.name}
                  onChange={(e) => setBasics({ ...basics, name: e.target.value })}
                  data-testid="input-household-name"
                />
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium block">Primary Address</label>
                <Input
                  placeholder="Street Address"
                  value={basics.street}
                  onChange={(e) => setBasics({ ...basics, street: e.target.value })}
                  data-testid="input-street"
                />
                <div className="grid grid-cols-6 gap-3">
                  <Input
                    placeholder="City"
                    value={basics.city}
                    onChange={(e) => setBasics({ ...basics, city: e.target.value })}
                    className="col-span-3"
                    data-testid="input-city"
                  />
                  <Input
                    placeholder="State"
                    value={basics.state}
                    onChange={(e) => setBasics({ ...basics, state: e.target.value })}
                    className="col-span-1"
                    data-testid="input-state"
                  />
                  <Input
                    placeholder="ZIP"
                    value={basics.zip}
                    onChange={(e) => setBasics({ ...basics, zip: e.target.value })}
                    className="col-span-2"
                    data-testid="input-zip"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Timezone</label>
                <Select
                  value={basics.timezone}
                  onValueChange={(value) => setBasics({ ...basics, timezone: value })}
                >
                  <SelectTrigger data-testid="select-timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold" data-testid="text-step-title">Who's in the Household?</h1>
                <p className="text-sm text-muted-foreground">Add family members and pets</p>
              </div>
            </div>

            {people.length > 0 && (
              <div className="space-y-2">
                {people.map((person) => (
                  <Card key={person.id} data-testid={`card-person-${person.id}`}>
                    <CardContent className="p-3 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{person.fullName}</span>
                          <Badge variant="outline" className="text-xs">
                            {person.role}
                          </Badge>
                        </div>
                        {person.preferredName && (
                          <p className="text-sm text-muted-foreground">
                            Goes by: {person.preferredName}
                          </p>
                        )}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removePerson(person.id)}
                        data-testid={`button-remove-person-${person.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    placeholder="Full Name"
                    value={newPerson.fullName || ""}
                    onChange={(e) => setNewPerson({ ...newPerson, fullName: e.target.value })}
                    data-testid="input-person-fullname"
                  />
                  <Input
                    placeholder="Nickname (optional)"
                    value={newPerson.preferredName || ""}
                    onChange={(e) => setNewPerson({ ...newPerson, preferredName: e.target.value })}
                    data-testid="input-person-preferredname"
                  />
                </div>
                <Select
                  value={newPerson.role || "OTHER"}
                  onValueChange={(value) => setNewPerson({ ...newPerson, role: value })}
                >
                  <SelectTrigger data-testid="select-person-role">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {PERSON_ROLES.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={addPerson}
                  disabled={!newPerson.fullName}
                  className="w-full"
                  data-testid="button-add-person"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Person or Pet
                </Button>
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground text-center">
              You can add more details like birthdays and allergies later in House settings.
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold" data-testid="text-step-title">Quick Preferences</h1>
                <p className="text-sm text-muted-foreground">Set key decision rules</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Purchase Approval Threshold
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                  Purchases above this amount require your approval
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-medium">$</span>
                  <Input
                    type="number"
                    value={rules.approvalThreshold}
                    onChange={(e) =>
                      setRules({ ...rules, approvalThreshold: parseInt(e.target.value) || 0 })
                    }
                    className="w-32"
                    data-testid="input-approval-threshold"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  "When in Doubt" Rules
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                  Default behavior when a decision needs to be made
                </p>
                <div className="flex flex-wrap gap-2">
                  {WHEN_IN_DOUBT_OPTIONS.map((rule) => (
                    <Badge
                      key={rule}
                      variant={rules.whenInDoubtRules.includes(rule) ? "default" : "outline"}
                      className={cn(
                        "cursor-pointer",
                        rules.whenInDoubtRules.includes(rule) && "toggle-elevate toggle-elevated"
                      )}
                      onClick={() => toggleWhenInDoubtRule(rule)}
                      data-testid={`chip-rule-${rule.replace(/\s+/g, "-").toLowerCase()}`}
                    >
                      {rule}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              You can customize more preferences and add key locations from the House page.
            </p>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Key className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold" data-testid="text-step-title">Access Codes</h1>
                <p className="text-sm text-muted-foreground">WiFi, gate codes, and entry info</p>
              </div>
            </div>

            {accessItems.length > 0 && (
              <div className="space-y-2">
                {accessItems.map((item) => (
                  <Card key={item.id} data-testid={`card-access-${item.id}`}>
                    <CardContent className="p-3 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{item.title}</span>
                          <Badge variant="outline" className="text-xs">
                            {ACCESS_ITEM_TYPES.find((t) => t.value === item.category)?.label || item.category}
                          </Badge>
                        </div>
                        {item.notes && (
                          <p className="text-sm text-muted-foreground truncate">{item.notes}</p>
                        )}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeAccessItem(item.id)}
                        data-testid={`button-remove-access-${item.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            <Card>
              <CardContent className="p-4 space-y-3">
                <Select
                  value={newAccessItem.category || "WIFI"}
                  onValueChange={(value) => setNewAccessItem({ ...newAccessItem, category: value })}
                >
                  <SelectTrigger data-testid="select-access-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCESS_ITEM_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Label (e.g., Home WiFi)"
                  value={newAccessItem.title || ""}
                  onChange={(e) => setNewAccessItem({ ...newAccessItem, title: e.target.value })}
                  data-testid="input-access-title"
                />
                <Input
                  placeholder="Code or password"
                  value={newAccessItem.value || ""}
                  onChange={(e) => setNewAccessItem({ ...newAccessItem, value: e.target.value })}
                  type="password"
                  data-testid="input-access-value"
                />
                <Button
                  onClick={addAccessItem}
                  disabled={!newAccessItem.title || !newAccessItem.value || saveAccessItemMutation.isPending}
                  className="w-full"
                  data-testid="button-add-access"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {saveAccessItemMutation.isPending ? "Saving..." : "Add Access Item"}
                </Button>
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground text-center">
              These are stored securely. You can add more access items later from the Vault.
            </p>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <Check className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold" data-testid="text-step-title">You're All Set!</h1>
                <p className="text-sm text-muted-foreground">Your household is ready to go</p>
              </div>
            </div>

            <div className="space-y-3">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Home className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{basics.name || "My Household"}</p>
                      {basics.city && (
                        <p className="text-sm text-muted-foreground">{basics.city}, {basics.state}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {people.length > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <Users className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{people.length} household member{people.length !== 1 ? 's' : ''}</p>
                        <p className="text-sm text-muted-foreground">{people.map(p => p.preferredName || p.fullName).join(', ')}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {accessItems.length > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <Shield className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{accessItems.length} access code{accessItems.length !== 1 ? 's' : ''} saved</p>
                        <p className="text-sm text-muted-foreground">Stored securely in your vault</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <Card className="border-green-500/20 bg-green-500/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="font-medium">Ready to start!</p>
                    <p className="text-sm text-muted-foreground">
                      You can add more details anytime from the House page.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Button
              onClick={async () => {
                await completePhase1Mutation.mutateAsync();
                await completePhase2Mutation.mutateAsync();
                await completePhase3Mutation.mutateAsync();
              }}
              disabled={completePhase1Mutation.isPending || completePhase2Mutation.isPending || completePhase3Mutation.isPending}
              className="w-full"
              size="lg"
              data-testid="button-complete-setup"
            >
              {(completePhase1Mutation.isPending || completePhase2Mutation.isPending || completePhase3Mutation.isPending) 
                ? "Completing..." 
                : "Start Using hndld"}
            </Button>
          </div>
        )}

        {/* Navigation buttons for steps 1-4 */}
        {step < 5 && (
          <div className="flex gap-3 pt-4">
            {step > 1 && (
              <Button
                variant="outline"
                onClick={handleBack}
                className="flex-1"
                data-testid="button-back"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}
            <Button
              onClick={handleNext}
              disabled={saveStepMutation.isPending}
              className={cn("flex-1", step === 1 && "w-full")}
              data-testid="button-next"
            >
              {saveStepMutation.isPending ? "Saving..." : "Continue"}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

