import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState } from "react";
import {
  Gift,
  Trophy,
  Sun,
  Lightbulb,
  Sparkles,
  Eye,
  X,
  Share2,
  Check,
  Clock,
  Calendar,
  ChevronRight,
  PartyPopper,
  Snowflake,
  Leaf,
  Flower2,
  Mail,
  Heart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Celebration {
  id: string;
  type: "ANNIVERSARY" | "MILESTONE" | "SEASONAL" | "PATTERN_REMINDER";
  status: "ACTIVE" | "SEEN" | "DISMISSED" | "SHARED";
  title: string;
  subtitle: string | null;
  message: string;
  data: Record<string, unknown>;
  shareableHtml: string | null;
  triggeredAt: string;
  seenAt: string | null;
  sharedAt: string | null;
}

interface HandwrittenNote {
  id: string;
  recipientName: string;
  message: string;
  occasion: string;
  status: "QUEUED" | "APPROVED" | "SENT" | "DELIVERED";
  scheduledFor: string | null;
  createdAt: string;
}

interface HouseholdSummary {
  tasksCompleted: number;
  totalTasks: number;
  eventsManaged: number;
  expensesTracked: number;
  estimatedHoursSaved: number;
}

const typeConfig = {
  ANNIVERSARY: {
    icon: PartyPopper,
    gradient: "from-amber-500/20 via-yellow-500/10 to-amber-600/20",
    border: "border-amber-500/30",
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    accent: "text-amber-600 dark:text-amber-400",
    label: "Anniversary",
  },
  MILESTONE: {
    icon: Trophy,
    gradient: "from-emerald-500/20 via-teal-500/10 to-emerald-600/20",
    border: "border-emerald-500/30",
    badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    accent: "text-emerald-600 dark:text-emerald-400",
    label: "Milestone",
  },
  SEASONAL: {
    icon: Sun,
    gradient: "from-sky-500/20 via-blue-500/10 to-indigo-500/20",
    border: "border-sky-500/30",
    badge: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    accent: "text-sky-600 dark:text-sky-400",
    label: "Seasonal",
  },
  PATTERN_REMINDER: {
    icon: Lightbulb,
    gradient: "from-violet-500/20 via-purple-500/10 to-fuchsia-500/20",
    border: "border-violet-500/30",
    badge: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    accent: "text-violet-600 dark:text-violet-400",
    label: "Reminder",
  },
};

function getSeasonIcon() {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return Flower2;
  if (month >= 5 && month <= 7) return Sun;
  if (month >= 8 && month <= 10) return Leaf;
  return Snowflake;
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number | string; icon: any }) {
  return (
    <div className="flex flex-col items-center gap-1 p-4 rounded-2xl bg-card border border-border/50">
      <Icon className="h-5 w-5 text-muted-foreground mb-1" />
      <span className="text-2xl font-bold tracking-tight">{value}</span>
      <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</span>
    </div>
  );
}

function CelebrationCard({ celebration, onSeen, onDismiss, onShare }: {
  celebration: Celebration;
  onSeen: (id: string) => void;
  onDismiss: (id: string) => void;
  onShare: (id: string) => void;
}) {
  const config = typeConfig[celebration.type];
  const Icon = config.icon;
  const [showChecklist, setShowChecklist] = useState(false);
  const checklist = (celebration.data?.checklist as string[]) || [];
  const stat = celebration.data?.stat as string | undefined;
  const isActive = celebration.status === "ACTIVE";

  return (
    <div className={`relative overflow-hidden rounded-2xl border ${config.border} bg-gradient-to-br ${config.gradient} backdrop-blur-sm transition-all duration-300 ${isActive ? "shadow-lg" : "opacity-75"}`}>
      {isActive && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#C9A96E] to-transparent" />
      )}

      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-background/60 flex items-center justify-center ${config.accent}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <Badge variant="outline" className={`${config.badge} border-0 text-[10px] font-medium px-2 py-0`}>
                {config.label}
              </Badge>
              <p className="text-xs text-muted-foreground mt-0.5">
                {format(new Date(celebration.triggeredAt), "MMM d, yyyy")}
              </p>
            </div>
          </div>

          {isActive && (
            <div className="flex gap-1">
              <button
                onClick={() => onDismiss(celebration.id)}
                className="p-1.5 rounded-lg hover:bg-background/50 text-muted-foreground transition-colors"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <h3 className="text-lg font-semibold tracking-tight mb-1">{celebration.title}</h3>
        {celebration.subtitle && (
          <p className="text-sm text-muted-foreground mb-2">{celebration.subtitle}</p>
        )}
        <p className="text-sm leading-relaxed text-foreground/80">{celebration.message}</p>

        {stat && (
          <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1D2A44]/10 dark:bg-[#C9A96E]/10 border border-[#1D2A44]/10 dark:border-[#C9A96E]/20">
            <Sparkles className="h-4 w-4 text-[#C9A96E]" />
            <span className="text-lg font-bold text-[#1D2A44] dark:text-[#C9A96E]">{stat}</span>
          </div>
        )}

        {checklist.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => setShowChecklist(!showChecklist)}
              className="flex items-center gap-2 text-sm font-medium text-foreground/70 hover:text-foreground transition-colors"
            >
              <ChevronRight className={`h-4 w-4 transition-transform ${showChecklist ? "rotate-90" : ""}`} />
              View checklist ({checklist.length} items)
            </button>
            {showChecklist && (
              <ul className="mt-3 space-y-2">
                {checklist.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground/70">
                    <div className="mt-1 w-4 h-4 rounded border border-border/50 flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] text-muted-foreground">{i + 1}</span>
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 mt-4">
          {isActive && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onSeen(celebration.id)}
              className="text-xs gap-1.5"
            >
              <Eye className="h-3.5 w-3.5" />
              Mark seen
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onShare(celebration.id)}
            className="text-xs gap-1.5"
          >
            <Share2 className="h-3.5 w-3.5" />
            {celebration.status === "SHARED" ? "Shared" : "Share"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function NoteCard({ note }: { note: HandwrittenNote }) {
  const statusColors: Record<string, string> = {
    QUEUED: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    APPROVED: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    SENT: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    DELIVERED: "bg-green-500/15 text-green-700 dark:text-green-300",
  };
  const statusIcons: Record<string, any> = {
    QUEUED: Clock,
    APPROVED: Check,
    SENT: Mail,
    DELIVERED: Heart,
  };
  const StatusIcon = statusIcons[note.status] || Clock;

  return (
    <div className="rounded-2xl border border-[#C9A96E]/20 bg-gradient-to-br from-[#C9A96E]/5 to-transparent p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-[#C9A96E]" />
          <span className="text-sm font-medium">Handwritten Note</span>
        </div>
        <Badge variant="outline" className={`${statusColors[note.status]} border-0 text-[10px] font-medium gap-1`}>
          <StatusIcon className="h-3 w-3" />
          {note.status.charAt(0) + note.status.slice(1).toLowerCase()}
        </Badge>
      </div>
      <p className="text-sm text-foreground/80 whitespace-pre-line leading-relaxed">{note.message}</p>
      <p className="text-xs text-muted-foreground mt-3">
        To: {note.recipientName} {note.scheduledFor && `· Scheduled: ${format(new Date(note.scheduledFor), "MMM d, yyyy")}`}
      </p>
    </div>
  );
}

function SharePreview({ html, onClose }: { html: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-10 right-0 text-white/70 hover:text-white">
          <X className="h-6 w-6" />
        </button>
        <div
          className="rounded-3xl overflow-hidden shadow-2xl"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        <p className="text-center text-white/50 text-xs mt-4">Tap outside to close</p>
      </div>
    </div>
  );
}

export default function CelebrationsPage() {
  const queryClient = useQueryClient();
  const [shareHtml, setShareHtml] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>("all");

  const { data: celebrations = [], isLoading } = useQuery<Celebration[]>({
    queryKey: ["/api/v1/celebrations"],
  });

  const { data: summary } = useQuery<HouseholdSummary>({
    queryKey: ["/api/v1/celebrations/summary"],
  });

  const { data: notes = [] } = useQuery<HandwrittenNote[]>({
    queryKey: ["/api/v1/handwritten-notes"],
  });

  const seenMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/v1/celebrations/${id}/seen`, { method: "PATCH", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/v1/celebrations"] }),
  });

  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/v1/celebrations/${id}/dismiss`, { method: "PATCH", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/v1/celebrations"] }),
  });

  const shareMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/v1/celebrations/${id}/share`, { method: "PATCH", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/celebrations"] });
      if (data.shareableHtml) setShareHtml(data.shareableHtml);
    },
  });

  const activeCelebrations = celebrations.filter((c) => c.status === "ACTIVE");
  const filteredCelebrations = activeFilter === "all"
    ? celebrations
    : activeFilter === "active"
      ? activeCelebrations
      : celebrations.filter((c) => c.type === activeFilter);

  const SeasonIcon = getSeasonIcon();

  const filterOptions = [
    { key: "all", label: "All" },
    { key: "active", label: "New" },
    { key: "ANNIVERSARY", label: "Anniversaries" },
    { key: "MILESTONE", label: "Milestones" },
    { key: "SEASONAL", label: "Seasonal" },
    { key: "PATTERN_REMINDER", label: "Reminders" },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen p-4 space-y-4 pb-24">
        <div className="h-8 w-48 bg-muted animate-pulse rounded-lg" />
        <div className="h-4 w-32 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-2 gap-3 mt-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-2xl" />
          ))}
        </div>
        <div className="space-y-3 mt-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 bg-muted animate-pulse rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50 px-4 pt-4 pb-3"
        style={{ paddingTop: "max(env(safe-area-inset-top), 16px)" }}>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#C9A96E] to-[#E8D5A3] flex items-center justify-center">
            <Gift className="h-5 w-5 text-[#1D2A44]" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Celebrations</h1>
            <p className="text-xs text-muted-foreground">
              {activeCelebrations.length > 0
                ? `${activeCelebrations.length} new ${activeCelebrations.length === 1 ? "moment" : "moments"}`
                : "Your household milestones"}
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-6">
        {summary && (
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Tasks Done" value={summary.tasksCompleted} icon={Check} />
            <StatCard label="Hours Saved" value={`~${summary.estimatedHoursSaved}`} icon={Clock} />
            <StatCard label="Events" value={summary.eventsManaged} icon={Calendar} />
            <StatCard label="Expenses" value={summary.expensesTracked} icon={SeasonIcon} />
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
          {filterOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setActiveFilter(opt.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                activeFilter === opt.key
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {opt.label}
              {opt.key === "active" && activeCelebrations.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#C9A96E] text-[#1D2A44] text-[10px] font-bold">
                  {activeCelebrations.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {filteredCelebrations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <Sparkles className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold mb-1">No celebrations yet</h3>
            <p className="text-sm text-muted-foreground max-w-[240px]">
              As you use hndld, we'll celebrate your milestones and suggest seasonal prep.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredCelebrations.map((c) => (
              <CelebrationCard
                key={c.id}
                celebration={c}
                onSeen={(id) => seenMutation.mutate(id)}
                onDismiss={(id) => dismissMutation.mutate(id)}
                onShare={(id) => shareMutation.mutate(id)}
              />
            ))}
          </div>
        )}

        {notes.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Personal Notes</h2>
            {notes.map((note) => (
              <NoteCard key={note.id} note={note} />
            ))}
          </div>
        )}
      </div>

      {shareHtml && (
        <SharePreview html={shareHtml} onClose={() => setShareHtml(null)} />
      )}
    </div>
  );
}
