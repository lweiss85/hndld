import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowLeft,
  Bug,
  Lightbulb,
  MessageCircle,
  AlertCircle,
  Heart,
  Clock,
  CheckCircle2,
  Circle,
  Loader2,
  Send,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";

const TYPE_META: Record<string, { icon: typeof Bug; label: string; color: string }> = {
  BUG: { icon: Bug, label: "Bug", color: "text-red-500" },
  FEATURE_REQUEST: { icon: Lightbulb, label: "Feature", color: "text-amber-500" },
  GENERAL: { icon: MessageCircle, label: "General", color: "text-blue-500" },
  COMPLAINT: { icon: AlertCircle, label: "Complaint", color: "text-orange-500" },
  PRAISE: { icon: Heart, label: "Praise", color: "text-pink-500" },
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  NEW: { label: "New", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  REVIEWED: { label: "Reviewed", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
  IN_PROGRESS: { label: "In Progress", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  RESOLVED: { label: "Resolved", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  WONT_FIX: { label: "Won't Fix", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
};

interface FeedbackItem {
  id: string;
  type: string;
  subject: string;
  description: string;
  status: string;
  createdAt: string;
  screenshotUrl?: string;
}

interface FeedbackReply {
  id: string;
  userId: string;
  isAdmin: boolean;
  message: string;
  createdAt: string;
}

export default function MyFeedbackPage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const { data: feedbackList, isLoading } = useQuery<{ feedback: FeedbackItem[] }>({
    queryKey: ["/api/v1/feedback"],
  });

  const { data: detail } = useQuery<{ feedback: FeedbackItem; replies: FeedbackReply[] }>({
    queryKey: [`/api/v1/feedback/${selectedId}`],
    enabled: !!selectedId,
  });

  const replyMutation = useMutation({
    mutationFn: async ({ id, message }: { id: string; message: string }) => {
      const res = await fetch(`/api/v1/feedback/${id}/reply`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) throw new Error("Failed to send reply");
      return res.json();
    },
    onSuccess: () => {
      setReplyText("");
      queryClient.invalidateQueries({ queryKey: [`/api/v1/feedback/${selectedId}`] });
    },
  });

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

  if (selectedId && detail) {
    const item = detail.feedback;
    const typeMeta = TYPE_META[item.type] || TYPE_META.GENERAL;
    const statusMeta = STATUS_META[item.status] || STATUS_META.NEW;
    const Icon = typeMeta.icon;

    return (
      <div className="min-h-screen pb-24 flex flex-col">
        <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50 px-4 pt-4 pb-3"
          style={{ paddingTop: "max(env(safe-area-inset-top), 16px)" }}>
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedId(null)} className="p-1.5 -ml-1.5 rounded-lg hover:bg-muted">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold truncate">{item.subject}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <Icon className={`h-3.5 w-3.5 ${typeMeta.color}`} />
                <span className="text-xs text-muted-foreground">{typeMeta.label}</span>
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border-0 ${statusMeta.color}`}>
                  {statusMeta.label}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 px-4 py-4 space-y-4 overflow-y-auto">
          <div className="rounded-2xl border border-border/50 bg-card p-4">
            <p className="text-sm text-foreground/80 whitespace-pre-wrap">{item.description}</p>
            {item.screenshotUrl && (
              <img src={item.screenshotUrl} alt="Screenshot" className="mt-3 rounded-xl max-h-48 object-contain" />
            )}
            <p className="text-xs text-muted-foreground mt-3">
              {new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
            </p>
          </div>

          {detail.replies.length > 0 && (
            <div className="space-y-3">
              {detail.replies.map((reply) => (
                <div
                  key={reply.id}
                  className={`rounded-2xl p-4 ${
                    reply.isAdmin
                      ? "bg-[#1D2A44]/5 dark:bg-[#1D2A44]/20 border border-[#C9A96E]/20 ml-0 mr-8"
                      : "bg-muted/50 ml-8 mr-0"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-medium">
                      {reply.isAdmin ? "Support" : "You"}
                    </span>
                    {reply.isAdmin && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-[#C9A96E]/10 text-[#C9A96E] border-0">
                        Staff
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm">{reply.message}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {new Date(reply.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {item.status !== "RESOLVED" && item.status !== "WONT_FIX" && (
          <div className="sticky bottom-0 px-4 py-3 border-t border-border/50 bg-background/80 backdrop-blur-xl"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}>
            <div className="flex gap-2">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Add a reply..."
                className="flex-1 px-3 py-2.5 text-sm rounded-xl border border-border/50 bg-background focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/50"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && replyText.trim()) {
                    replyMutation.mutate({ id: selectedId, message: replyText.trim() });
                  }
                }}
              />
              <Button
                onClick={() => replyMutation.mutate({ id: selectedId, message: replyText.trim() })}
                disabled={!replyText.trim() || replyMutation.isPending}
                size="icon"
                className="bg-[#1D2A44] hover:bg-[#2a3f6b] text-white rounded-xl h-10 w-10"
              >
                {replyMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const items = feedbackList?.feedback || [];

  return (
    <div className="min-h-screen pb-24">
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50 px-4 pt-4 pb-3"
        style={{ paddingTop: "max(env(safe-area-inset-top), 16px)" }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/house")} className="p-1.5 -ml-1.5 rounded-lg hover:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1D2A44] to-[#2a3f6b] flex items-center justify-center">
            <MessageCircle className="h-5 w-5 text-[#C9A96E]" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">My Feedback</h1>
            <p className="text-xs text-muted-foreground">Track your submissions</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-3">
        {items.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto">
              <MessageCircle className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">No feedback submitted yet</p>
            <p className="text-xs text-muted-foreground">
              Use the feedback button to share your thoughts
            </p>
          </div>
        ) : (
          items.map((item) => {
            const typeMeta = TYPE_META[item.type] || TYPE_META.GENERAL;
            const statusMeta = STATUS_META[item.status] || STATUS_META.NEW;
            const Icon = typeMeta.icon;

            return (
              <button
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className="w-full text-left rounded-2xl border border-border/50 bg-card p-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 ${typeMeta.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-medium text-sm truncate">{item.subject}</h3>
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{item.description}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border-0 ${statusMeta.color}`}>
                        {statusMeta.label}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
