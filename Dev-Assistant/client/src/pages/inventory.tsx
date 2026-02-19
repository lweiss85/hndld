import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowLeft,
  Plus,
  Search,
  Package,
  Wrench,
  Shield,
  AlertTriangle,
  Clock,
  X,
  Loader2,
  ChevronRight,
  Calendar,
  DollarSign,
  MapPin,
  Tag,
  FileText,
  LayoutGrid,
  List,
  Filter,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

const CATEGORIES: Record<string, { label: string; icon: typeof Package; color: string }> = {
  APPLIANCE: { label: "Appliance", icon: Package, color: "text-blue-500" },
  ELECTRONICS: { label: "Electronics", icon: Package, color: "text-purple-500" },
  FURNITURE: { label: "Furniture", icon: Package, color: "text-amber-600" },
  HVAC: { label: "HVAC", icon: Package, color: "text-cyan-500" },
  PLUMBING: { label: "Plumbing", icon: Wrench, color: "text-teal-500" },
  ELECTRICAL: { label: "Electrical", icon: Package, color: "text-yellow-500" },
  OUTDOOR: { label: "Outdoor", icon: Package, color: "text-green-500" },
  VEHICLE: { label: "Vehicle", icon: Package, color: "text-red-500" },
  OTHER: { label: "Other", icon: Package, color: "text-gray-500" },
};

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  location?: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  color?: string;
  purchaseDate?: string;
  purchasePrice?: number;
  purchaseLocation?: string;
  warrantyExpires?: string;
  warrantyType?: string;
  warrantyProvider?: string;
  warrantyNotes?: string;
  lastServiceDate?: string;
  nextServiceDue?: string;
  serviceIntervalDays?: number;
  manualUrl?: string;
  notes?: string;
  photoUrls?: string[];
  insuredValue?: number;
  insuranceCategory?: string;
  isActive: boolean;
  disposedAt?: string;
  disposalReason?: string;
  createdAt: string;
  updatedAt: string;
}

interface ServiceRecord {
  service: {
    id: string;
    serviceDate: string;
    serviceType: string;
    description?: string;
    cost?: number;
    notes?: string;
    performedBy?: string;
  };
  vendor?: {
    id: string;
    name: string;
  } | null;
}

function getWarrantyInfo(warrantyExpires?: string) {
  if (!warrantyExpires) return null;
  const now = new Date();
  const expiry = new Date(warrantyExpires);
  const diffMs = expiry.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0)
    return {
      label: `Expired ${Math.abs(diffDays)}d ago`,
      color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
      urgent: true,
    };
  if (diffDays <= 30)
    return {
      label: `${diffDays}d left`,
      color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
      urgent: true,
    };
  if (diffDays <= 90)
    return {
      label: `${diffDays}d left`,
      color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
      urgent: false,
    };
  return {
    label: `${diffDays}d left`,
    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    urgent: false,
  };
}

function formatCurrency(cents?: number) {
  if (!cents && cents !== 0) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function AddItemDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    category: "APPLIANCE",
    location: "",
    brand: "",
    model: "",
    serialNumber: "",
    color: "",
    purchaseDate: "",
    purchasePrice: "",
    purchaseLocation: "",
    warrantyExpires: "",
    warrantyType: "",
    warrantyProvider: "",
    warrantyNotes: "",
    serviceIntervalDays: "",
    manualUrl: "",
    notes: "",
    insuredValue: "",
    insuranceCategory: "",
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/v1/inventory", data);
      return res.json();
    },
    onSuccess: () => {
      onSuccess();
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: Record<string, unknown> = {
      name: form.name,
      category: form.category,
    };
    if (form.location) data.location = form.location;
    if (form.brand) data.brand = form.brand;
    if (form.model) data.model = form.model;
    if (form.serialNumber) data.serialNumber = form.serialNumber;
    if (form.color) data.color = form.color;
    if (form.purchaseDate) data.purchaseDate = form.purchaseDate;
    if (form.purchasePrice)
      data.purchasePrice = Math.round(parseFloat(form.purchasePrice) * 100);
    if (form.purchaseLocation) data.purchaseLocation = form.purchaseLocation;
    if (form.warrantyExpires) data.warrantyExpires = form.warrantyExpires;
    if (form.warrantyType) data.warrantyType = form.warrantyType;
    if (form.warrantyProvider) data.warrantyProvider = form.warrantyProvider;
    if (form.warrantyNotes) data.warrantyNotes = form.warrantyNotes;
    if (form.serviceIntervalDays)
      data.serviceIntervalDays = parseInt(form.serviceIntervalDays);
    if (form.manualUrl) data.manualUrl = form.manualUrl;
    if (form.notes) data.notes = form.notes;
    if (form.insuredValue)
      data.insuredValue = Math.round(parseFloat(form.insuredValue) * 100);
    if (form.insuranceCategory) data.insuranceCategory = form.insuranceCategory;
    createMutation.mutate(data);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 p-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-ink dark:text-white">
            Add Item
          </h2>
          <button onClick={onClose}>
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Name *
            </label>
            <input
              className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-ink dark:text-white"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Category *
            </label>
            <select
              className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-ink dark:text-white"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {Object.entries(CATEGORIES).map(([key, { label }]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Location
              </label>
              <input
                className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-ink dark:text-white"
                placeholder="Kitchen, Garage..."
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Brand
              </label>
              <input
                className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-ink dark:text-white"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Model
              </label>
              <input
                className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-ink dark:text-white"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Serial Number
              </label>
              <input
                className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-ink dark:text-white"
                value={form.serialNumber}
                onChange={(e) =>
                  setForm({ ...form, serialNumber: e.target.value })
                }
              />
            </div>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              Purchase Info
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Purchase Date
                </label>
                <input
                  type="date"
                  className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-ink dark:text-white"
                  value={form.purchaseDate}
                  onChange={(e) =>
                    setForm({ ...form, purchaseDate: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Price ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-ink dark:text-white"
                  value={form.purchasePrice}
                  onChange={(e) =>
                    setForm({ ...form, purchasePrice: e.target.value })
                  }
                />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              Warranty
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Warranty Expires
                </label>
                <input
                  type="date"
                  className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-ink dark:text-white"
                  value={form.warrantyExpires}
                  onChange={(e) =>
                    setForm({ ...form, warrantyExpires: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Warranty Type
                </label>
                <select
                  className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-ink dark:text-white"
                  value={form.warrantyType}
                  onChange={(e) =>
                    setForm({ ...form, warrantyType: e.target.value })
                  }
                >
                  <option value="">Select...</option>
                  <option value="Manufacturer">Manufacturer</option>
                  <option value="Extended">Extended</option>
                  <option value="Store">Store</option>
                </select>
              </div>
            </div>
            <div className="mt-3">
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Warranty Provider
              </label>
              <input
                className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-ink dark:text-white"
                value={form.warrantyProvider}
                onChange={(e) =>
                  setForm({ ...form, warrantyProvider: e.target.value })
                }
              />
            </div>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              Maintenance
            </h3>
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Service Interval (days)
              </label>
              <input
                type="number"
                className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-ink dark:text-white"
                placeholder="e.g. 90 for quarterly"
                value={form.serviceIntervalDays}
                onChange={(e) =>
                  setForm({ ...form, serviceIntervalDays: e.target.value })
                }
              />
            </div>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              Insurance
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Insured Value ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-ink dark:text-white"
                  value={form.insuredValue}
                  onChange={(e) =>
                    setForm({ ...form, insuredValue: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Insurance Category
                </label>
                <input
                  className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-ink dark:text-white"
                  value={form.insuranceCategory}
                  onChange={(e) =>
                    setForm({ ...form, insuranceCategory: e.target.value })
                  }
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Notes
            </label>
            <textarea
              className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-ink dark:text-white"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-ink hover:bg-ink/90 text-white"
              disabled={createMutation.isPending || !form.name}
            >
              {createMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Add Item
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddServiceDialog({
  itemId,
  onClose,
  onSuccess,
}: {
  itemId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    serviceDate: new Date().toISOString().split("T")[0],
    serviceType: "Maintenance",
    description: "",
    cost: "",
    performedBy: "",
    notes: "",
  });

  const addServiceMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest(
        "POST",
        `/api/v1/inventory/${itemId}/service`,
        data
      );
      return res.json();
    },
    onSuccess: () => {
      onSuccess();
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: Record<string, unknown> = {
      serviceDate: form.serviceDate,
      serviceType: form.serviceType,
    };
    if (form.description) data.description = form.description;
    if (form.cost) data.cost = Math.round(parseFloat(form.cost) * 100);
    if (form.performedBy) data.performedBy = form.performedBy;
    if (form.notes) data.notes = form.notes;
    addServiceMutation.mutate(data);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 p-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink dark:text-white">
            Add Service Record
          </h2>
          <button onClick={onClose}>
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Date *
              </label>
              <input
                type="date"
                className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-ink dark:text-white"
                value={form.serviceDate}
                onChange={(e) =>
                  setForm({ ...form, serviceDate: e.target.value })
                }
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Type *
              </label>
              <select
                className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-ink dark:text-white"
                value={form.serviceType}
                onChange={(e) =>
                  setForm({ ...form, serviceType: e.target.value })
                }
              >
                <option value="Maintenance">Maintenance</option>
                <option value="Repair">Repair</option>
                <option value="Inspection">Inspection</option>
                <option value="Cleaning">Cleaning</option>
                <option value="Replacement">Replacement</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Description
            </label>
            <textarea
              className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-ink dark:text-white"
              rows={2}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Cost ($)
              </label>
              <input
                type="number"
                step="0.01"
                className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-ink dark:text-white"
                value={form.cost}
                onChange={(e) => setForm({ ...form, cost: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Performed By
              </label>
              <input
                className="w-full mt-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-ink dark:text-white"
                value={form.performedBy}
                onChange={(e) =>
                  setForm({ ...form, performedBy: e.target.value })
                }
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-ink hover:bg-ink/90 text-white"
              disabled={addServiceMutation.isPending}
            >
              {addServiceMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Save
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ItemDetail({
  itemId,
  onBack,
}: {
  itemId: string;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const [showServiceDialog, setShowServiceDialog] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/v1/inventory", itemId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/v1/inventory/${itemId}`);
      return res.json();
    },
  });

  const disposeMutation = useMutation({
    mutationFn: async (reason: string) => {
      const res = await apiRequest("PATCH", `/api/v1/inventory/${itemId}`, {
        isActive: false,
        disposedAt: new Date().toISOString(),
        disposalReason: reason,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/inventory"] });
      onBack();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const item: InventoryItem = data?.item;
  const serviceHistory: ServiceRecord[] = data?.serviceHistory || [];

  if (!item) {
    return (
      <div className="text-center py-20 text-gray-500">Item not found</div>
    );
  }

  const warranty = getWarrantyInfo(item.warrantyExpires);
  const cat = CATEGORIES[item.category] || CATEGORIES.OTHER;

  return (
    <div className="min-h-screen bg-porcelain dark:bg-gray-950">
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={onBack}>
            <ArrowLeft className="w-5 h-5 text-ink dark:text-white" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-ink dark:text-white">
              {item.name}
            </h1>
            <p className="text-sm text-gray-500">
              {cat.label}
              {item.location ? ` · ${item.location}` : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Details
          </h3>
          {item.brand && (
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Brand</span>
              <span className="text-sm font-medium text-ink dark:text-white">
                {item.brand}
              </span>
            </div>
          )}
          {item.model && (
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Model</span>
              <span className="text-sm font-medium text-ink dark:text-white">
                {item.model}
              </span>
            </div>
          )}
          {item.serialNumber && (
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Serial Number</span>
              <span className="text-sm font-medium text-ink dark:text-white font-mono text-xs">
                {item.serialNumber}
              </span>
            </div>
          )}
          {item.color && (
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Color</span>
              <span className="text-sm font-medium text-ink dark:text-white">
                {item.color}
              </span>
            </div>
          )}
        </div>

        {(item.purchaseDate || item.purchasePrice) && (
          <div className="bg-white dark:bg-gray-900 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Purchase
            </h3>
            {item.purchaseDate && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Date</span>
                <span className="text-sm font-medium text-ink dark:text-white">
                  {new Date(item.purchaseDate).toLocaleDateString()}
                </span>
              </div>
            )}
            {item.purchasePrice && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Price</span>
                <span className="text-sm font-medium text-ink dark:text-white">
                  {formatCurrency(item.purchasePrice)}
                </span>
              </div>
            )}
            {item.purchaseLocation && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Location</span>
                <span className="text-sm font-medium text-ink dark:text-white">
                  {item.purchaseLocation}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Warranty
          </h3>
          {warranty ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Status</span>
                <Badge className={warranty.color}>{warranty.label}</Badge>
              </div>
              {item.warrantyType && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Type</span>
                  <span className="text-sm font-medium text-ink dark:text-white">
                    {item.warrantyType}
                  </span>
                </div>
              )}
              {item.warrantyProvider && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Provider</span>
                  <span className="text-sm font-medium text-ink dark:text-white">
                    {item.warrantyProvider}
                  </span>
                </div>
              )}
              {item.warrantyExpires && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Expires</span>
                  <span className="text-sm font-medium text-ink dark:text-white">
                    {new Date(item.warrantyExpires).toLocaleDateString()}
                  </span>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400">No warranty information</p>
          )}
        </div>

        {(item.insuredValue || item.insuranceCategory) && (
          <div className="bg-white dark:bg-gray-900 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Insurance
            </h3>
            {item.insuredValue && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Insured Value</span>
                <span className="text-sm font-medium text-ink dark:text-white">
                  {formatCurrency(item.insuredValue)}
                </span>
              </div>
            )}
            {item.insuranceCategory && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Category</span>
                <span className="text-sm font-medium text-ink dark:text-white">
                  {item.insuranceCategory}
                </span>
              </div>
            )}
          </div>
        )}

        {item.manualUrl && (
          <a
            href={item.manualUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-white dark:bg-gray-900 rounded-xl p-4"
          >
            <FileText className="w-5 h-5 text-blue-500" />
            <span className="text-sm font-medium text-ink dark:text-white flex-1">
              View Manual
            </span>
            <ExternalLink className="w-4 h-4 text-gray-400" />
          </a>
        )}

        {item.notes && (
          <div className="bg-white dark:bg-gray-900 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Notes
            </h3>
            <p className="text-sm text-ink dark:text-white whitespace-pre-wrap">
              {item.notes}
            </p>
          </div>
        )}

        <div className="bg-white dark:bg-gray-900 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Service History
            </h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowServiceDialog(true)}
            >
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>

          {serviceHistory.length === 0 ? (
            <p className="text-sm text-gray-400">No service records yet</p>
          ) : (
            <div className="space-y-3">
              {serviceHistory.map((record) => (
                <div
                  key={record.service.id}
                  className="border-l-2 border-gray-200 dark:border-gray-700 pl-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink dark:text-white">
                      {record.service.serviceType}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(record.service.serviceDate).toLocaleDateString()}
                    </span>
                  </div>
                  {record.service.description && (
                    <p className="text-sm text-gray-500 mt-0.5">
                      {record.service.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    {record.service.cost && (
                      <span>{formatCurrency(record.service.cost)}</span>
                    )}
                    {record.vendor?.name && <span>{record.vendor.name}</span>}
                    {record.service.performedBy && (
                      <span>{record.service.performedBy}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {item.isActive && (
          <Button
            variant="outline"
            className="w-full text-red-500 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
            onClick={() => {
              const reason = prompt("Reason for disposal (optional):");
              if (reason !== null) {
                disposeMutation.mutate(reason || "Disposed");
              }
            }}
          >
            Mark as Disposed
          </Button>
        )}
      </div>

      {showServiceDialog && (
        <AddServiceDialog
          itemId={item.id}
          onClose={() => setShowServiceDialog(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({
              queryKey: ["/api/v1/inventory", itemId],
            });
          }}
        />
      )}
    </div>
  );
}

type ViewTab = "items" | "alerts" | "insurance";

export default function InventoryPage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [viewTab, setViewTab] = useState<ViewTab>("items");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");

  const { data: inventoryData, isLoading } = useQuery({
    queryKey: [
      "/api/v1/inventory",
      { search: searchQuery, category: categoryFilter },
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.set("search", searchQuery);
      if (categoryFilter) params.set("category", categoryFilter);
      const res = await apiRequest(
        "GET",
        `/api/v1/inventory?${params.toString()}`
      );
      return res.json();
    },
  });

  const { data: warrantyAlerts } = useQuery({
    queryKey: ["/api/v1/inventory/alerts/warranties"],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        "/api/v1/inventory/alerts/warranties"
      );
      return res.json();
    },
    enabled: viewTab === "alerts",
  });

  const { data: maintenanceAlerts } = useQuery({
    queryKey: ["/api/v1/inventory/alerts/maintenance"],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        "/api/v1/inventory/alerts/maintenance"
      );
      return res.json();
    },
    enabled: viewTab === "alerts",
  });

  const { data: insuranceSummary } = useQuery({
    queryKey: ["/api/v1/inventory/insurance-summary"],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        "/api/v1/inventory/insurance-summary"
      );
      return res.json();
    },
    enabled: viewTab === "insurance",
  });

  if (selectedItemId) {
    return (
      <ItemDetail
        itemId={selectedItemId}
        onBack={() => {
          setSelectedItemId(null);
          queryClient.invalidateQueries({
            queryKey: ["/api/v1/inventory"],
          });
        }}
      />
    );
  }

  const items: InventoryItem[] = inventoryData?.items || [];

  return (
    <div className="min-h-screen bg-porcelain dark:bg-gray-950 pb-24">
      <div className="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate("/")}>
            <ArrowLeft className="w-5 h-5 text-ink dark:text-white" />
          </button>
          <h1 className="text-lg font-semibold text-ink dark:text-white flex-1">
            Inventory
          </h1>
          <button onClick={() => setShowAddDialog(true)}>
            <Plus className="w-5 h-5 text-ink dark:text-white" />
          </button>
        </div>

        <div className="flex gap-1 px-4 pb-2">
          {(
            [
              { key: "items", label: "Items", icon: Package },
              { key: "alerts", label: "Alerts", icon: AlertTriangle },
              { key: "insurance", label: "Insurance", icon: Shield },
            ] as const
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setViewTab(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                viewTab === key
                  ? "bg-ink text-white dark:bg-white dark:text-gray-900"
                  : "text-gray-500 hover:text-ink dark:hover:text-white"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {viewTab === "items" && (
        <>
          <div className="px-4 py-3 flex items-center gap-2">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search items..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-ink dark:text-white"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2 rounded-lg border ${
                categoryFilter
                  ? "border-ink bg-ink/5 dark:border-white dark:bg-white/5"
                  : "border-gray-200 dark:border-gray-700"
              }`}
            >
              <Filter className="w-4 h-4 text-ink dark:text-white" />
            </button>
            <button
              onClick={() =>
                setViewMode(viewMode === "grid" ? "list" : "grid")
              }
              className="p-2 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              {viewMode === "grid" ? (
                <List className="w-4 h-4 text-ink dark:text-white" />
              ) : (
                <LayoutGrid className="w-4 h-4 text-ink dark:text-white" />
              )}
            </button>
          </div>

          {showFilters && (
            <div className="px-4 pb-3 flex flex-wrap gap-2">
              <button
                onClick={() => setCategoryFilter("")}
                className={`px-3 py-1 rounded-full text-xs font-medium ${
                  !categoryFilter
                    ? "bg-ink text-white dark:bg-white dark:text-gray-900"
                    : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                }`}
              >
                All
              </button>
              {Object.entries(CATEGORIES).map(([key, { label }]) => (
                <button
                  key={key}
                  onClick={() =>
                    setCategoryFilter(categoryFilter === key ? "" : key)
                  }
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    categoryFilter === key
                      ? "bg-ink text-white dark:bg-white dark:text-gray-900"
                      : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-20 px-4">
              <Package className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 mb-1">
                No items yet
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500">
                Add your first inventory item to start tracking
              </p>
            </div>
          ) : viewMode === "list" ? (
            <div className="px-4 space-y-2">
              {items.map((item) => {
                const cat = CATEGORIES[item.category] || CATEGORIES.OTHER;
                const warranty = getWarrantyInfo(item.warrantyExpires);
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedItemId(item.id)}
                    className="w-full text-left bg-white dark:bg-gray-900 rounded-xl p-3 flex items-center gap-3"
                  >
                    <div
                      className={`w-10 h-10 rounded-lg bg-gray-50 dark:bg-gray-800 flex items-center justify-center ${cat.color}`}
                    >
                      <cat.icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-ink dark:text-white truncate">
                          {item.name}
                        </span>
                        {warranty && warranty.urgent && (
                          <AlertTriangle className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                        {item.brand && <span>{item.brand}</span>}
                        {item.location && (
                          <>
                            <span>·</span>
                            <span>{item.location}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {warranty && (
                      <Badge className={`text-xs ${warranty.color}`}>
                        {warranty.label}
                      </Badge>
                    )}
                    <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="px-4 grid grid-cols-2 gap-3">
              {items.map((item) => {
                const cat = CATEGORIES[item.category] || CATEGORIES.OTHER;
                const warranty = getWarrantyInfo(item.warrantyExpires);
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedItemId(item.id)}
                    className="text-left bg-white dark:bg-gray-900 rounded-xl p-3"
                  >
                    <div
                      className={`w-8 h-8 rounded-lg bg-gray-50 dark:bg-gray-800 flex items-center justify-center ${cat.color} mb-2`}
                    >
                      <cat.icon className="w-4 h-4" />
                    </div>
                    <p className="text-sm font-medium text-ink dark:text-white truncate">
                      {item.name}
                    </p>
                    <p className="text-xs text-gray-400 truncate mt-0.5">
                      {item.brand || cat.label}
                    </p>
                    {warranty && (
                      <Badge className={`text-xs mt-2 ${warranty.color}`}>
                        {warranty.label}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {viewTab === "alerts" && (
        <div className="px-4 py-3 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Warranty Alerts
            </h3>
            {warrantyAlerts?.expiringSoon?.length > 0 ? (
              <div className="space-y-2">
                {warrantyAlerts.expiringSoon.map(
                  (item: InventoryItem & { daysUntilExpiry: number }) => (
                    <button
                      key={item.id}
                      onClick={() => setSelectedItemId(item.id)}
                      className="w-full text-left bg-white dark:bg-gray-900 rounded-xl p-3 flex items-center gap-3"
                    >
                      <AlertTriangle
                        className={`w-5 h-5 flex-shrink-0 ${
                          item.daysUntilExpiry <= 30
                            ? "text-orange-500"
                            : "text-amber-500"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink dark:text-white truncate">
                          {item.name}
                        </p>
                        <p className="text-xs text-gray-400">
                          Warranty expires in {item.daysUntilExpiry} days
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                    </button>
                  )
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400 bg-white dark:bg-gray-900 rounded-xl p-4">
                No upcoming warranty expirations
              </p>
            )}

            {warrantyAlerts?.expiredRecently?.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-red-500 mb-2">
                  Recently Expired
                </p>
                <div className="space-y-2">
                  {warrantyAlerts.expiredRecently.map(
                    (item: InventoryItem) => (
                      <button
                        key={item.id}
                        onClick={() => setSelectedItemId(item.id)}
                        className="w-full text-left bg-white dark:bg-gray-900 rounded-xl p-3 flex items-center gap-3 opacity-75"
                      >
                        <Clock className="w-5 h-5 text-red-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-ink dark:text-white truncate">
                            {item.name}
                          </p>
                          <p className="text-xs text-gray-400">
                            Warranty expired
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300" />
                      </button>
                    )
                  )}
                </div>
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Wrench className="w-4 h-4" />
              Maintenance Due
            </h3>
            {maintenanceAlerts?.dueSoon?.length > 0 ? (
              <div className="space-y-2">
                {maintenanceAlerts.dueSoon.map(
                  (
                    item: InventoryItem & {
                      daysUntilDue: number;
                      isOverdue: boolean;
                    }
                  ) => (
                    <button
                      key={item.id}
                      onClick={() => setSelectedItemId(item.id)}
                      className="w-full text-left bg-white dark:bg-gray-900 rounded-xl p-3 flex items-center gap-3"
                    >
                      <Wrench
                        className={`w-5 h-5 flex-shrink-0 ${
                          item.isOverdue ? "text-red-500" : "text-amber-500"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink dark:text-white truncate">
                          {item.name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {item.isOverdue
                            ? `Overdue by ${Math.abs(item.daysUntilDue)} days`
                            : `Due in ${item.daysUntilDue} days`}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                    </button>
                  )
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400 bg-white dark:bg-gray-900 rounded-xl p-4">
                No upcoming maintenance
              </p>
            )}
          </div>
        </div>
      )}

      {viewTab === "insurance" && (
        <div className="px-4 py-3 space-y-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
              Total Insured Value
            </h3>
            <p className="text-2xl font-bold text-ink dark:text-white">
              {formatCurrency(insuranceSummary?.totalInsuredValue || 0)}
            </p>
          </div>

          {insuranceSummary?.byCategory?.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                By Category
              </h3>
              <div className="space-y-3">
                {insuranceSummary.byCategory.map(
                  (cat: {
                    category: string;
                    totalValue: number;
                    count: number;
                  }) => {
                    const catInfo =
                      CATEGORIES[cat.category] || CATEGORIES.OTHER;
                    return (
                      <div
                        key={cat.category}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <catInfo.icon
                            className={`w-4 h-4 ${catInfo.color}`}
                          />
                          <span className="text-sm text-ink dark:text-white">
                            {catInfo.label}
                          </span>
                          <span className="text-xs text-gray-400">
                            ({cat.count})
                          </span>
                        </div>
                        <span className="text-sm font-medium text-ink dark:text-white">
                          {formatCurrency(cat.totalValue)}
                        </span>
                      </div>
                    );
                  }
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {showAddDialog && (
        <AddItemDialog
          onClose={() => setShowAddDialog(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({
              queryKey: ["/api/v1/inventory"],
            });
          }}
        />
      )}
    </div>
  );
}
