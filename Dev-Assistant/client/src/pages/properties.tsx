import { useState } from "react";
import { HandledIllustration } from "@/components/illustrations";
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
  Eye, EyeOff, Bed, Bath, Ruler, CalendarDays, ArrowLeft,
  DoorOpen, Clock, AlertTriangle, Pencil, GripVertical
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

interface RoomItem {
  id: string;
  propertyId: string;
  householdId: string;
  name: string;
  roomType: string;
  floor: number | null;
  approximateSqFt: number | null;
  flooringType: string | null;
  surfaceNotes: string | null;
  cleaningPriority: number | null;
  specialInstructions: string | null;
  skipDays: string[] | null;
  estimatedCleanMinutes: number | null;
  photoUrls: string[] | null;
  isActive: boolean;
  sortOrder: number | null;
  createdAt: string;
  updatedAt: string;
}

const ROOM_TYPES = [
  { value: "KITCHEN", label: "Kitchen" },
  { value: "BATHROOM", label: "Bathroom" },
  { value: "BEDROOM", label: "Bedroom" },
  { value: "LIVING_ROOM", label: "Living Room" },
  { value: "DINING_ROOM", label: "Dining Room" },
  { value: "OFFICE", label: "Office" },
  { value: "GARAGE", label: "Garage" },
  { value: "LAUNDRY", label: "Laundry" },
  { value: "CLOSET", label: "Closet" },
  { value: "HALLWAY", label: "Hallway" },
  { value: "BASEMENT", label: "Basement" },
  { value: "ATTIC", label: "Attic" },
  { value: "PATIO", label: "Patio" },
  { value: "DECK", label: "Deck" },
  { value: "MUDROOM", label: "Mudroom" },
  { value: "PLAYROOM", label: "Playroom" },
  { value: "GUEST_ROOM", label: "Guest Room" },
  { value: "MASTER_SUITE", label: "Master Suite" },
  { value: "OUTDOOR", label: "Outdoor" },
  { value: "OTHER", label: "Other" },
];

const FLOORING_TYPES = [
  { value: "HARDWOOD", label: "Hardwood" },
  { value: "TILE", label: "Tile" },
  { value: "CARPET", label: "Carpet" },
  { value: "LAMINATE", label: "Laminate" },
  { value: "VINYL", label: "Vinyl" },
  { value: "CONCRETE", label: "Concrete" },
  { value: "STONE", label: "Stone" },
  { value: "MARBLE", label: "Marble" },
  { value: "MIXED", label: "Mixed" },
  { value: "OTHER", label: "Other" },
];

function getRoomTypeLabel(type: string) {
  return ROOM_TYPES.find(t => t.value === type)?.label || type;
}

function getFlooringLabel(type: string) {
  return FLOORING_TYPES.find(t => t.value === type)?.label || type;
}

function getPriorityLabel(priority: number | null) {
  if (!priority) return null;
  if (priority <= 1) return { label: "Critical", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" };
  if (priority <= 2) return { label: "High", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" };
  if (priority <= 3) return { label: "Normal", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" };
  if (priority <= 4) return { label: "Low", color: "bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-400" };
  return { label: "Minimal", color: "bg-gray-50 text-gray-500 dark:bg-gray-800/30 dark:text-gray-500" };
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
          <h1 className="font-display text-3xl font-light tracking-tight text-foreground">Properties</h1>
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
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <HandledIllustration size={56} className="mb-5 opacity-40" />
          <h3 className="font-display text-xl font-light tracking-tight text-foreground mb-1.5">No properties added</h3>
          <p className="text-sm text-muted-foreground max-w-[300px] leading-relaxed mb-5">
            Your homes and properties will be managed here.
          </p>
          <Button size="sm" onClick={() => setShowAddForm(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Add property
          </Button>
        </div>
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
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [editingRoom, setEditingRoom] = useState<RoomItem | null>(null);

  const { data } = useQuery<{ property: PropertyItem }>({
    queryKey: [`/api/v1/properties/${propertyId}`, showSensitive ? "sensitive" : "masked"],
    queryFn: () => fetch(`/api/v1/properties/${propertyId}${showSensitive ? "?sensitive=true" : ""}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: roomsData, isLoading: roomsLoading } = useQuery<{ rooms: RoomItem[] }>({
    queryKey: [`/api/v1/properties/${propertyId}/rooms`],
  });

  const rooms = roomsData?.rooms || [];

  const setPrimaryMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/v1/properties/${propertyId}/set-primary`),
    onSuccess: () => {
      toast({ title: "Set as primary property" });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/properties"] });
    },
  });

  const deleteRoomMutation = useMutation({
    mutationFn: (roomId: string) => apiRequest("DELETE", `/api/v1/properties/${propertyId}/rooms/${roomId}`),
    onSuccess: () => {
      toast({ title: "Room removed" });
      queryClient.invalidateQueries({ queryKey: [`/api/v1/properties/${propertyId}/rooms`] });
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
              <DoorOpen className="w-4 h-4" /> Rooms
            </h3>
            <Dialog open={showAddRoom} onOpenChange={setShowAddRoom}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1 text-xs h-7">
                  <Plus className="w-3.5 h-3.5" /> Add Room
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add Room</DialogTitle>
                </DialogHeader>
                <RoomForm
                  propertyId={propertyId}
                  onSuccess={() => {
                    setShowAddRoom(false);
                    queryClient.invalidateQueries({ queryKey: [`/api/v1/properties/${propertyId}/rooms`] });
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>
          {roomsLoading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}
            </div>
          ) : rooms.length === 0 ? (
            <div className="text-center py-6">
              <DoorOpen className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No rooms added yet</p>
              <p className="text-xs text-muted-foreground mt-0.5">Add rooms to track cleaning details per area</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rooms.map(room => {
                const priorityInfo = getPriorityLabel(room.cleaningPriority);
                return (
                  <div
                    key={room.id}
                    className="border rounded-xl p-3 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="w-4 h-4 text-muted-foreground/40 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-foreground">{room.name}</span>
                          <Badge variant="secondary" className="text-[10px]">
                            {getRoomTypeLabel(room.roomType)}
                          </Badge>
                          {priorityInfo && (
                            <Badge className={cn("text-[10px]", priorityInfo.color)}>
                              {priorityInfo.label}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {room.floor !== null && (
                            <span className="text-xs text-muted-foreground">
                              Floor {room.floor}
                            </span>
                          )}
                          {room.flooringType && (
                            <span className="text-xs text-muted-foreground">
                              {getFlooringLabel(room.flooringType)}
                            </span>
                          )}
                          {room.estimatedCleanMinutes && (
                            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                              <Clock className="w-3 h-3" /> {room.estimatedCleanMinutes} min
                            </span>
                          )}
                          {room.approximateSqFt && (
                            <span className="text-xs text-muted-foreground">
                              {room.approximateSqFt} sq ft
                            </span>
                          )}
                        </div>
                        {room.specialInstructions && (
                          <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
                            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-amber-500" />
                            <span className="line-clamp-2">{room.specialInstructions}</span>
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => setEditingRoom(room)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => {
                            if (confirm(`Remove "${room.name}"?`)) {
                              deleteRoomMutation.mutate(room.id);
                            }
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingRoom} onOpenChange={(open) => { if (!open) setEditingRoom(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Room</DialogTitle>
          </DialogHeader>
          {editingRoom && (
            <RoomForm
              propertyId={propertyId}
              room={editingRoom}
              onSuccess={() => {
                setEditingRoom(null);
                queryClient.invalidateQueries({ queryKey: [`/api/v1/properties/${propertyId}/rooms`] });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

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

function RoomForm({ propertyId, room, onSuccess }: { propertyId: string; room?: RoomItem; onSuccess: () => void }) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: room?.name || "",
    roomType: room?.roomType || "",
    floor: room?.floor?.toString() || "1",
    approximateSqFt: room?.approximateSqFt?.toString() || "",
    flooringType: room?.flooringType || "",
    cleaningPriority: room?.cleaningPriority?.toString() || "3",
    specialInstructions: room?.specialInstructions || "",
    estimatedCleanMinutes: room?.estimatedCleanMinutes?.toString() || "",
    surfaceNotes: room?.surfaceNotes || "",
  });

  const update = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));
  const isEditing = !!room;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.roomType) return;
    setSubmitting(true);
    try {
      const payload = {
        name: form.name,
        roomType: form.roomType,
        floor: form.floor ? parseInt(form.floor) : 1,
        approximateSqFt: form.approximateSqFt ? parseInt(form.approximateSqFt) : undefined,
        flooringType: form.flooringType || undefined,
        cleaningPriority: form.cleaningPriority ? parseInt(form.cleaningPriority) : 3,
        specialInstructions: form.specialInstructions || undefined,
        estimatedCleanMinutes: form.estimatedCleanMinutes ? parseInt(form.estimatedCleanMinutes) : undefined,
        surfaceNotes: form.surfaceNotes || undefined,
      };

      if (isEditing) {
        await apiRequest("PATCH", `/api/v1/properties/${propertyId}/rooms/${room.id}`, payload);
        toast({ title: "Room updated" });
      } else {
        await apiRequest("POST", `/api/v1/properties/${propertyId}/rooms`, payload);
        toast({ title: "Room added" });
      }
      onSuccess();
    } catch {
      toast({ title: `Failed to ${isEditing ? "update" : "add"} room`, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Room Name</Label>
        <Input
          placeholder="e.g. Master Bedroom, Kitchen"
          value={form.name}
          onChange={e => update("name", e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>Room Type</Label>
        <Select value={form.roomType} onValueChange={v => update("roomType", v)}>
          <SelectTrigger>
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            {ROOM_TYPES.map(t => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Floor</Label>
          <Input type="number" value={form.floor} onChange={e => update("floor", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Approx. Sq Ft</Label>
          <Input type="number" value={form.approximateSqFt} onChange={e => update("approximateSqFt", e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Flooring Type</Label>
        <Select value={form.flooringType} onValueChange={v => update("flooringType", v)}>
          <SelectTrigger>
            <SelectValue placeholder="Select flooring" />
          </SelectTrigger>
          <SelectContent>
            {FLOORING_TYPES.map(t => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Cleaning Priority (1-5)</Label>
          <Select value={form.cleaningPriority} onValueChange={v => update("cleaningPriority", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 - Critical</SelectItem>
              <SelectItem value="2">2 - High</SelectItem>
              <SelectItem value="3">3 - Normal</SelectItem>
              <SelectItem value="4">4 - Low</SelectItem>
              <SelectItem value="5">5 - Minimal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Est. Clean Time (min)</Label>
          <Input type="number" placeholder="e.g. 30" value={form.estimatedCleanMinutes} onChange={e => update("estimatedCleanMinutes", e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Special Instructions</Label>
        <Textarea
          placeholder="Any special notes for cleaning this room"
          value={form.specialInstructions}
          onChange={e => update("specialInstructions", e.target.value)}
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label>Surface Notes</Label>
        <Textarea
          placeholder="Details about surfaces, materials, or care requirements"
          value={form.surfaceNotes}
          onChange={e => update("surfaceNotes", e.target.value)}
          rows={2}
        />
      </div>

      <Button type="submit" className="w-full" disabled={!form.name || !form.roomType || submitting}>
        {submitting ? (isEditing ? "Updating..." : "Adding...") : (isEditing ? "Update Room" : "Add Room")}
      </Button>
    </form>
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
