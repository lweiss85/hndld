import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Home, Plus, MapPin, Star, Building2, Palmtree, Key as KeyIcon,
  Wifi, Lock, ClipboardList, Users, ChevronRight, Trash2,
  Eye, EyeOff, Bed, Bath, Ruler, CalendarDays, ArrowLeft
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PropertyItem {
  id: string;
  householdId: string;
  name: string;
  type: string;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  timezone: string | null;
  squareFootage: number | null;
  bedrooms: number | null;
  bathrooms: string | null;
  yearBuilt: number | null;
  photoUrls: string[] | null;
  isActive: boolean;
  isPrimary: boolean;
  settings: any;
  accessInstructions: string | null;
  alarmCode: string | null;
  wifiPassword: string | null;
  createdAt: string;
  counts?: {
    tasks: number;
    vendors: number;
    locks: number;
  };
}

const PROPERTY_TYPES = [
  { value: "PRIMARY", label: "Primary Residence", icon: Home },
  { value: "VACATION", label: "Vacation Home", icon: Palmtree },
  { value: "RENTAL", label: "Rental Property", icon: Building2 },
  { value: "INVESTMENT", label: "Investment", icon: Building2 },
  { value: "FAMILY", label: "Family Property", icon: Users },
  { value: "OTHER", label: "Other", icon: Home },
];

function getTypeInfo(type: string) {
  return PROPERTY_TYPES.find(t => t.value === type) || PROPERTY_TYPES[5];
}

export default function PropertiesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ properties: PropertyItem[] }>({
    queryKey: ["/api/v1/properties"],
  });

  const properties = data?.properties || [];

  const setPrimaryMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/v1/properties/${id}/set-primary`),
    onSuccess: () => {
      toast({ title: "Primary property updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/properties"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/v1/properties/${id}`),
    onSuccess: () => {
      toast({ title: "Property removed" });
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/v1/properties"] });
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="space-y-3">
          {[1, 2].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (selectedId) {
    return (
      <PropertyDetail
        propertyId={selectedId}
        onBack={() => setSelectedId(null)}
        onDelete={() => deleteMutation.mutate(selectedId)}
      />
    );
  }

  return (
    <div className="p-4 pb-24 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Properties</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {properties.length} {properties.length === 1 ? "property" : "properties"}
          </p>
        </div>
        <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="w-4 h-4" /> Add Property
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Property</DialogTitle>
            </DialogHeader>
            <AddPropertyForm onSuccess={() => {
              setShowAddForm(false);
              queryClient.invalidateQueries({ queryKey: ["/api/v1/properties"] });
            }} />
          </DialogContent>
        </Dialog>
      </div>

      {properties.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Home className="w-12 h-12 text-muted-foreground/40 mb-3" />
            <h3 className="font-medium text-foreground mb-1">No properties yet</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-xs">
              Add your homes to manage tasks, vendors, and access across multiple properties.
            </p>
            <Button size="sm" onClick={() => setShowAddForm(true)}>
              <Plus className="w-4 h-4 mr-1.5" /> Add Your First Property
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {properties.map(property => {
            const typeInfo = getTypeInfo(property.type);
            const Icon = typeInfo.icon;
            return (
              <Card
                key={property.id}
                className="cursor-pointer transition-all hover:shadow-md"
                onClick={() => setSelectedId(property.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "w-11 h-11 rounded-xl flex items-center justify-center shrink-0",
                      property.isPrimary
                        ? "bg-amber-100 dark:bg-amber-900/30"
                        : "bg-blue-50 dark:bg-blue-900/20"
                    )}>
                      <Icon className={cn(
                        "w-5 h-5",
                        property.isPrimary
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-blue-600 dark:text-blue-400"
                      )} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground truncate">{property.name}</span>
                        {property.isPrimary && (
                          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px]">
                            <Star className="w-3 h-3 mr-0.5" /> Primary
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {typeInfo.label}
                        </Badge>
                      </div>
                      {(property.city || property.state) && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3" />
                          {[property.city, property.state].filter(Boolean).join(", ")}
                        </p>
                      )}
                      {property.counts && (
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <ClipboardList className="w-3 h-3" /> {property.counts.tasks} tasks
                          </span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Users className="w-3 h-3" /> {property.counts.vendors} vendors
                          </span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Lock className="w-3 h-3" /> {property.counts.locks} locks
                          </span>
                        </div>
                      )}
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 mt-1" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PropertyDetail({ propertyId, onBack, onDelete }: { propertyId: string; onBack: () => void; onDelete: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showSensitive, setShowSensitive] = useState(false);

  const { data } = useQuery<{ property: PropertyItem }>({
    queryKey: [`/api/v1/properties/${propertyId}`, showSensitive ? "sensitive" : "masked"],
    queryFn: () => fetch(`/api/v1/properties/${propertyId}${showSensitive ? "?sensitive=true" : ""}`, { credentials: "include" }).then(r => r.json()),
  });

  const setPrimaryMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/properties/${propertyId}/set-primary`),
    onSuccess: () => {
      toast({ title: "Set as primary property" });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/properties"] });
    },
  });

  const property = data?.property;
  if (!property) {
    return (
      <div className="p-4 space-y-4">
        <div className="h-8 w-32 bg-muted animate-pulse rounded" />
        <div className="h-48 bg-muted animate-pulse rounded-2xl" />
      </div>
    );
  }

  const typeInfo = getTypeInfo(property.type);

  return (
    <div className="p-4 pb-24 space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-foreground">{property.name}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="outline" className="text-xs">{typeInfo.label}</Badge>
            {property.isPrimary && (
              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px]">
                Primary
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          {!property.isPrimary && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1 text-xs"
              onClick={() => setPrimaryMutation.mutate()}
            >
              <Star className="w-3.5 h-3.5" /> Set Primary
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-destructive"
            onClick={() => {
              if (confirm("Remove this property?")) onDelete();
            }}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {(property.address || property.city) && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-foreground mb-2 flex items-center gap-1.5">
              <MapPin className="w-4 h-4" /> Location
            </h3>
            <p className="text-sm text-muted-foreground">{property.address}</p>
            <p className="text-sm text-muted-foreground">
              {[property.city, property.state, property.postalCode].filter(Boolean).join(", ")}
            </p>
            {property.timezone && (
              <p className="text-xs text-muted-foreground mt-1">Timezone: {property.timezone}</p>
            )}
          </CardContent>
        </Card>
      )}

      {(property.bedrooms || property.bathrooms || property.squareFootage || property.yearBuilt) && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-foreground mb-3">Property Details</h3>
            <div className="grid grid-cols-2 gap-3">
              {property.bedrooms && (
                <div className="flex items-center gap-2">
                  <Bed className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">{property.bedrooms} bedrooms</span>
                </div>
              )}
              {property.bathrooms && (
                <div className="flex items-center gap-2">
                  <Bath className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">{property.bathrooms} bathrooms</span>
                </div>
              )}
              {property.squareFootage && (
                <div className="flex items-center gap-2">
                  <Ruler className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">{property.squareFootage.toLocaleString()} sq ft</span>
                </div>
              )}
              {property.yearBuilt && (
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">Built {property.yearBuilt}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <KeyIcon className="w-4 h-4" /> Access Information
            </h3>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1 text-xs h-7"
              onClick={() => setShowSensitive(!showSensitive)}
            >
              {showSensitive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showSensitive ? "Hide" : "Reveal"}
            </Button>
          </div>
          <div className="space-y-3">
            {property.accessInstructions && (
              <div>
                <span className="text-xs text-muted-foreground">Access Instructions</span>
                <p className="text-sm">{property.accessInstructions}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Alarm Code
                </span>
                <p className="text-sm font-mono mt-0.5">
                  {property.alarmCode || "Not set"}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Wifi className="w-3 h-3" /> WiFi Password
                </span>
                <p className="text-sm font-mono mt-0.5">
                  {property.wifiPassword || "Not set"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AddPropertyForm({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "PRIMARY" as string,
    address: "",
    city: "",
    state: "",
    postalCode: "",
    timezone: "America/New_York",
    bedrooms: "",
    bathrooms: "",
    squareFootage: "",
    yearBuilt: "",
    isPrimary: false,
    accessInstructions: "",
    alarmCode: "",
    wifiPassword: "",
  });

  const update = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.type) return;
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/v1/properties", {
        name: form.name,
        type: form.type,
        address: form.address || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
        postalCode: form.postalCode || undefined,
        timezone: form.timezone,
        bedrooms: form.bedrooms ? parseInt(form.bedrooms) : undefined,
        bathrooms: form.bathrooms || undefined,
        squareFootage: form.squareFootage ? parseInt(form.squareFootage) : undefined,
        yearBuilt: form.yearBuilt ? parseInt(form.yearBuilt) : undefined,
        isPrimary: form.isPrimary,
        accessInstructions: form.accessInstructions || undefined,
        alarmCode: form.alarmCode || undefined,
        wifiPassword: form.wifiPassword || undefined,
      });
      toast({ title: "Property added" });
      onSuccess();
    } catch {
      toast({ title: "Failed to add property", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Property Name</Label>
        <Input
          placeholder="e.g. Main Residence, Lake House"
          value={form.name}
          onChange={e => update("name", e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>Type</Label>
        <Select value={form.type} onValueChange={v => update("type", v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROPERTY_TYPES.map(t => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <Label>Set as Primary Property</Label>
        <Switch checked={form.isPrimary} onCheckedChange={v => update("isPrimary", v)} />
      </div>

      <div className="space-y-2">
        <Label>Address</Label>
        <Input placeholder="Street address" value={form.address} onChange={e => update("address", e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>City</Label>
          <Input value={form.city} onChange={e => update("city", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>State</Label>
          <Input value={form.state} onChange={e => update("state", e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Zip Code</Label>
          <Input value={form.postalCode} onChange={e => update("postalCode", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Timezone</Label>
          <Select value={form.timezone} onValueChange={v => update("timezone", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="America/New_York">Eastern</SelectItem>
              <SelectItem value="America/Chicago">Central</SelectItem>
              <SelectItem value="America/Denver">Mountain</SelectItem>
              <SelectItem value="America/Los_Angeles">Pacific</SelectItem>
              <SelectItem value="America/Anchorage">Alaska</SelectItem>
              <SelectItem value="Pacific/Honolulu">Hawaii</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Bedrooms</Label>
          <Input type="number" value={form.bedrooms} onChange={e => update("bedrooms", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Bathrooms</Label>
          <Input type="number" step="0.5" value={form.bathrooms} onChange={e => update("bathrooms", e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Square Footage</Label>
          <Input type="number" value={form.squareFootage} onChange={e => update("squareFootage", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Year Built</Label>
          <Input type="number" value={form.yearBuilt} onChange={e => update("yearBuilt", e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Access Instructions</Label>
        <Textarea
          placeholder="Entry instructions for staff and vendors"
          value={form.accessInstructions}
          onChange={e => update("accessInstructions", e.target.value)}
          rows={2}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Alarm Code</Label>
          <Input type="password" placeholder="Encrypted at rest" value={form.alarmCode} onChange={e => update("alarmCode", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>WiFi Password</Label>
          <Input type="password" placeholder="Encrypted at rest" value={form.wifiPassword} onChange={e => update("wifiPassword", e.target.value)} />
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={!form.name || submitting}>
        {submitting ? "Adding..." : "Add Property"}
      </Button>
    </form>
  );
}
