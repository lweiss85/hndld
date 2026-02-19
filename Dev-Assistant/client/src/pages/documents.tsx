import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowLeft,
  Plus,
  FileText,
  Shield,
  Car,
  Umbrella,
  FileCheck,
  ScrollText,
  BadgeCheck,
  ClipboardList,
  AlertTriangle,
  Clock,
  X,
  Loader2,
  ChevronRight,
  Calendar,
  DollarSign,
  Phone,
  Mail,
  User,
  RefreshCw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

const DOC_TYPES: Record<string, { label: string; icon: typeof FileText; color: string }> = {
  INSURANCE_HOME: { label: "Home Insurance", icon: Shield, color: "text-blue-500" },
  INSURANCE_AUTO: { label: "Auto Insurance", icon: Car, color: "text-blue-600" },
  INSURANCE_UMBRELLA: { label: "Umbrella Insurance", icon: Umbrella, color: "text-indigo-500" },
  INSURANCE_OTHER: { label: "Other Insurance", icon: Shield, color: "text-blue-400" },
  WARRANTY: { label: "Warranty", icon: BadgeCheck, color: "text-emerald-500" },
  CONTRACT: { label: "Contract", icon: ScrollText, color: "text-purple-500" },
  LICENSE: { label: "License", icon: FileCheck, color: "text-amber-500" },
  REGISTRATION: { label: "Registration", icon: ClipboardList, color: "text-orange-500" },
  CERTIFICATE: { label: "Certificate", icon: FileText, color: "text-teal-500" },
  OTHER: { label: "Other", icon: FileText, color: "text-gray-500" },
};

interface TrackedDocument {
  id: string;
  name: string;
  type: string;
  description?: string;
  provider?: string;
  policyNumber?: string;
  effectiveDate?: string;
  expirationDate?: string;
  renewalDate?: string;
  annualCost?: number;
  paymentFrequency?: string;
  coverageAmount?: number;
  deductible?: number;
  alertDaysBefore?: number;
  autoRenews?: boolean;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
}

function getExpiryInfo(expirationDate?: string) {
  if (!expirationDate) return null;
  const now = new Date();
  const expiry = new Date(expirationDate);
  const diffMs = expiry.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { label: `Expired ${Math.abs(diffDays)}d ago`, color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300", urgent: true };
  if (diffDays <= 30) return { label: `${diffDays}d left`, color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300", urgent: true };
  if (diffDays <= 90) return { label: `${diffDays}d left`, color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300", urgent: false };
  return { label: `${diffDays}d left`, color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300", urgent: false };
}

function formatCurrency(cents?: number) {
  if (!cents) return null;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function DocumentsPage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editDoc, setEditDoc] = useState<TrackedDocument | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<TrackedDocument | null>(null);
  const [filterType, setFilterType] = useState<string>("");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<{ documents: TrackedDocument[] }>({
    queryKey: ["/api/v1/documents"],
  });

  const { data: summary } = useQuery<{
    total: number;
    byType: Record<string, number>;
    totalAnnualCost: number;
    expiringSoon: number;
    expired: number;
  }>({
    queryKey: ["/api/v1/documents/summary"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/v1/documents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/documents/summary"] });
      setSelectedDoc(null);
    },
  });

  const docs = data?.documents || [];
  const filtered = docs.filter((d) => {
    if (filterType && d.type !== filterType) return false;
    if (search && !d.name.toLowerCase().includes(search.toLowerCase()) && !d.provider?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const grouped = filtered.reduce<Record<string, TrackedDocument[]>>((acc, doc) => {
    const group = DOC_TYPES[doc.type]?.label || "Other";
    if (!acc[group]) acc[group] = [];
    acc[group].push(doc);
    return acc;
  }, {});

  if (isLoading) {
    return (
      <div className="min-h-screen p-4 space-y-4 pb-24">
        <div className="h-8 w-48 bg-muted animate-pulse rounded-lg" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-muted animate-pulse rounded-2xl" />
        ))}
      </div>
    );
  }

  if (showForm || editDoc) {
    return (
      <DocumentForm
        doc={editDoc}
        onClose={() => { setShowForm(false); setEditDoc(null); }}
        onSaved={() => {
          setShowForm(false);
          setEditDoc(null);
          queryClient.invalidateQueries({ queryKey: ["/api/v1/documents"] });
          queryClient.invalidateQueries({ queryKey: ["/api/v1/documents/summary"] });
        }}
      />
    );
  }

  if (selectedDoc) {
    const typeMeta = DOC_TYPES[selectedDoc.type] || DOC_TYPES.OTHER;
    const Icon = typeMeta.icon;
    const expiry = getExpiryInfo(selectedDoc.expirationDate);

    return (
      <div className="min-h-screen pb-24">
        <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50 px-4 pt-4 pb-3"
          style={{ paddingTop: "max(env(safe-area-inset-top), 16px)" }}>
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedDoc(null)} className="p-1.5 -ml-1.5 rounded-lg hover:bg-muted">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold truncate">{selectedDoc.name}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <Icon className={`h-3.5 w-3.5 ${typeMeta.color}`} />
                <span className="text-xs text-muted-foreground">{typeMeta.label}</span>
                {expiry && (
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border-0 ${expiry.color}`}>
                    {expiry.label}
                  </Badge>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setSelectedDoc(null); setEditDoc(selectedDoc); }}
            >
              Edit
            </Button>
          </div>
        </div>

        <div className="px-4 py-4 space-y-4">
          {selectedDoc.description && (
            <div className="rounded-2xl border border-border/50 bg-card p-4">
              <p className="text-sm text-foreground/80">{selectedDoc.description}</p>
            </div>
          )}

          <div className="rounded-2xl border border-border/50 bg-card p-4 space-y-3">
            <h3 className="font-semibold text-sm">Details</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {selectedDoc.provider && (
                <div>
                  <span className="text-xs text-muted-foreground">Provider</span>
                  <p className="font-medium">{selectedDoc.provider}</p>
                </div>
              )}
              {selectedDoc.policyNumber && (
                <div>
                  <span className="text-xs text-muted-foreground">Policy #</span>
                  <p className="font-medium">{selectedDoc.policyNumber}</p>
                </div>
              )}
              <div>
                <span className="text-xs text-muted-foreground">Effective</span>
                <p className="font-medium">{formatDate(selectedDoc.effectiveDate)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Expires</span>
                <p className="font-medium">{formatDate(selectedDoc.expirationDate)}</p>
              </div>
              {selectedDoc.renewalDate && (
                <div>
                  <span className="text-xs text-muted-foreground">Renewal</span>
                  <p className="font-medium">{formatDate(selectedDoc.renewalDate)}</p>
                </div>
              )}
              {selectedDoc.autoRenews && (
                <div className="flex items-center gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">Auto-renews</span>
                </div>
              )}
            </div>
          </div>

          {(selectedDoc.annualCost || selectedDoc.coverageAmount || selectedDoc.deductible) && (
            <div className="rounded-2xl border border-border/50 bg-card p-4 space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Financial
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {selectedDoc.annualCost && (
                  <div>
                    <span className="text-xs text-muted-foreground">Annual Cost</span>
                    <p className="font-medium">{formatCurrency(selectedDoc.annualCost)}</p>
                    {selectedDoc.paymentFrequency && (
                      <span className="text-[10px] text-muted-foreground capitalize">{selectedDoc.paymentFrequency}</span>
                    )}
                  </div>
                )}
                {selectedDoc.coverageAmount && (
                  <div>
                    <span className="text-xs text-muted-foreground">Coverage</span>
                    <p className="font-medium">{formatCurrency(selectedDoc.coverageAmount)}</p>
                  </div>
                )}
                {selectedDoc.deductible && (
                  <div>
                    <span className="text-xs text-muted-foreground">Deductible</span>
                    <p className="font-medium">{formatCurrency(selectedDoc.deductible)}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {(selectedDoc.contactName || selectedDoc.contactPhone || selectedDoc.contactEmail) && (
            <div className="rounded-2xl border border-border/50 bg-card p-4 space-y-3">
              <h3 className="font-semibold text-sm">Contact</h3>
              <div className="space-y-2 text-sm">
                {selectedDoc.contactName && (
                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{selectedDoc.contactName}</span>
                  </div>
                )}
                {selectedDoc.contactPhone && (
                  <a href={`tel:${selectedDoc.contactPhone}`} className="flex items-center gap-2 text-[#1D2A44] dark:text-[#C9A96E]">
                    <Phone className="h-3.5 w-3.5" />
                    <span>{selectedDoc.contactPhone}</span>
                  </a>
                )}
                {selectedDoc.contactEmail && (
                  <a href={`mailto:${selectedDoc.contactEmail}`} className="flex items-center gap-2 text-[#1D2A44] dark:text-[#C9A96E]">
                    <Mail className="h-3.5 w-3.5" />
                    <span>{selectedDoc.contactEmail}</span>
                  </a>
                )}
              </div>
            </div>
          )}

          {selectedDoc.notes && (
            <div className="rounded-2xl border border-border/50 bg-card p-4">
              <h3 className="font-semibold text-sm mb-2">Notes</h3>
              <p className="text-sm text-foreground/80 whitespace-pre-wrap">{selectedDoc.notes}</p>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
              onClick={() => {
                if (confirm("Delete this document?")) {
                  deleteMutation.mutate(selectedDoc.id);
                }
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50 px-4 pt-4 pb-3"
        style={{ paddingTop: "max(env(safe-area-inset-top), 16px)" }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/house")} className="p-1.5 -ml-1.5 rounded-lg hover:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1D2A44] to-[#2a3f6b] flex items-center justify-center">
            <FileText className="h-5 w-5 text-[#C9A96E]" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold tracking-tight">Documents</h1>
            <p className="text-xs text-muted-foreground">Track contracts & expirations</p>
          </div>
          <Button
            size="sm"
            onClick={() => setShowForm(true)}
            className="bg-[#1D2A44] hover:bg-[#2a3f6b] text-white"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>
      </div>

      {summary && (
        <div className="px-4 pt-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-border/50 bg-card p-3 text-center">
              <p className="text-2xl font-bold">{summary.total}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Total</p>
            </div>
            <div className={`rounded-2xl border p-3 text-center ${summary.expiringSoon > 0 ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950" : "border-border/50 bg-card"}`}>
              <p className="text-2xl font-bold">{summary.expiringSoon}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Expiring Soon</p>
            </div>
            <div className={`rounded-2xl border p-3 text-center ${summary.expired > 0 ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950" : "border-border/50 bg-card"}`}>
              <p className="text-2xl font-bold">{summary.expired}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Expired</p>
            </div>
          </div>
          {summary.totalAnnualCost > 0 && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Annual spend: <span className="font-medium text-foreground">{formatCurrency(summary.totalAnnualCost)}</span>
            </p>
          )}
        </div>
      )}

      <div className="px-4 pt-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents..."
            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl border border-border/50 bg-background focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/50"
          />
        </div>
      </div>

      <div className="px-4 pt-3 flex gap-2 overflow-x-auto no-scrollbar pb-1">
        <button
          onClick={() => setFilterType("")}
          className={`px-3 py-1.5 text-xs rounded-full whitespace-nowrap transition-colors ${!filterType ? "bg-[#1D2A44] text-white" : "bg-muted text-muted-foreground"}`}
        >
          All
        </button>
        {Object.entries(DOC_TYPES).map(([key, meta]) => (
          <button
            key={key}
            onClick={() => setFilterType(filterType === key ? "" : key)}
            className={`px-3 py-1.5 text-xs rounded-full whitespace-nowrap transition-colors ${filterType === key ? "bg-[#1D2A44] text-white" : "bg-muted text-muted-foreground"}`}
          >
            {meta.label}
          </button>
        ))}
      </div>

      <div className="px-4 py-3 space-y-4">
        {Object.keys(grouped).length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto">
              <FileText className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">No documents tracked yet</p>
            <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add your first document
            </Button>
          </div>
        ) : (
          Object.entries(grouped).map(([group, items]) => (
            <div key={group}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{group}</h3>
              <div className="space-y-2">
                {items.map((doc) => {
                  const typeMeta = DOC_TYPES[doc.type] || DOC_TYPES.OTHER;
                  const Icon = typeMeta.icon;
                  const expiry = getExpiryInfo(doc.expirationDate);

                  return (
                    <button
                      key={doc.id}
                      onClick={() => setSelectedDoc(doc)}
                      className="w-full text-left rounded-2xl border border-border/50 bg-card p-4 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 ${typeMeta.color}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="font-medium text-sm truncate">{doc.name}</h4>
                            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          </div>
                          {doc.provider && (
                            <p className="text-xs text-muted-foreground mt-0.5">{doc.provider}</p>
                          )}
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            {expiry && (
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border-0 ${expiry.color}`}>
                                {expiry.urgent && <AlertTriangle className="h-3 w-3 mr-0.5" />}
                                {expiry.label}
                              </Badge>
                            )}
                            {doc.autoRenews && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                <RefreshCw className="h-3 w-3 mr-0.5" />
                                Auto-renews
                              </Badge>
                            )}
                            {doc.annualCost && (
                              <span className="text-[10px] text-muted-foreground">
                                {formatCurrency(doc.annualCost)}/yr
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DocumentForm({
  doc,
  onClose,
  onSaved,
}: {
  doc: TrackedDocument | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: doc?.name || "",
    type: doc?.type || "OTHER",
    description: doc?.description || "",
    provider: doc?.provider || "",
    policyNumber: doc?.policyNumber || "",
    effectiveDate: doc?.effectiveDate ? doc.effectiveDate.split("T")[0] : "",
    expirationDate: doc?.expirationDate ? doc.expirationDate.split("T")[0] : "",
    renewalDate: doc?.renewalDate ? doc.renewalDate.split("T")[0] : "",
    annualCost: doc?.annualCost ? String(doc.annualCost / 100) : "",
    paymentFrequency: doc?.paymentFrequency || "",
    coverageAmount: doc?.coverageAmount ? String(doc.coverageAmount / 100) : "",
    deductible: doc?.deductible ? String(doc.deductible / 100) : "",
    alertDaysBefore: doc?.alertDaysBefore ? String(doc.alertDaysBefore) : "30",
    autoRenews: doc?.autoRenews || false,
    contactName: doc?.contactName || "",
    contactPhone: doc?.contactPhone || "",
    contactEmail: doc?.contactEmail || "",
    notes: doc?.notes || "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const body = {
        ...form,
        annualCost: form.annualCost ? Math.round(parseFloat(form.annualCost) * 100) : null,
        coverageAmount: form.coverageAmount ? Math.round(parseFloat(form.coverageAmount) * 100) : null,
        deductible: form.deductible ? Math.round(parseFloat(form.deductible) * 100) : null,
        alertDaysBefore: parseInt(form.alertDaysBefore) || 30,
      };

      if (doc) {
        await apiRequest("PATCH", `/api/v1/documents/${doc.id}`, body);
      } else {
        await apiRequest("POST", "/api/v1/documents", body);
      }
    },
    onSuccess: onSaved,
  });

  const update = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50 px-4 pt-4 pb-3"
        style={{ paddingTop: "max(env(safe-area-inset-top), 16px)" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="p-1.5 -ml-1.5 rounded-lg hover:bg-muted">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-bold">{doc ? "Edit Document" : "Add Document"}</h1>
          </div>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!form.name.trim() || mutation.isPending}
            size="sm"
            className="bg-[#1D2A44] hover:bg-[#2a3f6b] text-white"
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-5">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Basic Info</h3>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name *</label>
            <input
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="e.g., Homeowners Insurance"
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-border/50 bg-background focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/50"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Type *</label>
            <select
              value={form.type}
              onChange={(e) => update("type", e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-border/50 bg-background focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/50"
            >
              {Object.entries(DOC_TYPES).map(([key, meta]) => (
                <option key={key} value={key}>{meta.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              rows={2}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-border/50 bg-background focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/50 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Provider</label>
              <input
                value={form.provider}
                onChange={(e) => update("provider", e.target.value)}
                placeholder="Company name"
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-border/50 bg-background focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/50"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Policy/Ref #</label>
              <input
                value={form.policyNumber}
                onChange={(e) => update("policyNumber", e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-border/50 bg-background focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/50"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Dates</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Effective Date</label>
              <input
                type="date"
                value={form.effectiveDate}
                onChange={(e) => update("effectiveDate", e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-border/50 bg-background focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/50"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Expiration Date</label>
              <input
                type="date"
                value={form.expirationDate}
                onChange={(e) => update("expirationDate", e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-border/50 bg-background focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/50"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Renewal Date</label>
              <input
                type="date"
                value={form.renewalDate}
                onChange={(e) => update("renewalDate", e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-border/50 bg-background focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/50"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Alert Before (days)</label>
              <input
                type="number"
                value={form.alertDaysBefore}
                onChange={(e) => update("alertDaysBefore", e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-border/50 bg-background focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/50"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.autoRenews}
              onChange={(e) => update("autoRenews", e.target.checked)}
              className="rounded border-border"
            />
            Auto-renews
          </label>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Financial</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Annual Cost ($)</label>
              <input
                type="number"
                step="0.01"
                value={form.annualCost}
                onChange={(e) => update("annualCost", e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-border/50 bg-background focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/50"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Frequency</label>
              <select
                value={form.paymentFrequency}
                onChange={(e) => update("paymentFrequency", e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-border/50 bg-background focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/50"
              >
                <option value="">Select...</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="semiannual">Semi-Annual</option>
                <option value="annual">Annual</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Coverage ($)</label>
              <input
                type="number"
                step="0.01"
                value={form.coverageAmount}
                onChange={(e) => update("coverageAmount", e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-border/50 bg-background focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/50"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Deductible ($)</label>
              <input
                type="number"
                step="0.01"
                value={form.deductible}
                onChange={(e) => update("deductible", e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-border/50 bg-background focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/50"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Contact</h3>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Contact Name</label>
            <input
              value={form.contactName}
              onChange={(e) => update("contactName", e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-border/50 bg-background focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/50"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Phone</label>
              <input
                type="tel"
                value={form.contactPhone}
                onChange={(e) => update("contactPhone", e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-border/50 bg-background focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/50"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Email</label>
              <input
                type="email"
                value={form.contactEmail}
                onChange={(e) => update("contactEmail", e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-border/50 bg-background focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/50"
              />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            rows={3}
            className="w-full px-3 py-2.5 text-sm rounded-xl border border-border/50 bg-background focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/50 resize-none"
          />
        </div>

        {mutation.isError && (
          <p className="text-sm text-red-500">Failed to save document. Please try again.</p>
        )}
      </div>
    </div>
  );
}
