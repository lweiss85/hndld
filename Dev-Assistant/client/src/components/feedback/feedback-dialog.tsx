import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquarePlus,
  Bug,
  Lightbulb,
  MessageCircle,
  AlertCircle,
  Heart,
  X,
  Loader2,
  CheckCircle2,
  Camera,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const FEEDBACK_TYPES = [
  { value: "BUG", label: "Bug Report", icon: Bug, color: "text-red-500" },
  { value: "FEATURE_REQUEST", label: "Feature Request", icon: Lightbulb, color: "text-amber-500" },
  { value: "GENERAL", label: "General", icon: MessageCircle, color: "text-blue-500" },
  { value: "COMPLAINT", label: "Complaint", icon: AlertCircle, color: "text-orange-500" },
  { value: "PRAISE", label: "Praise", icon: Heart, color: "text-pink-500" },
] as const;

interface FeedbackDialogProps {
  open: boolean;
  onClose: () => void;
}

export function FeedbackDialog({ open, onClose }: FeedbackDialogProps) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("type", type);
      formData.append("subject", subject);
      formData.append("description", description);
      formData.append("pageUrl", window.location.pathname);
      if (screenshot) {
        formData.append("screenshot", screenshot);
      }

      const res = await fetch("/api/v1/feedback", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit");
      }
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["/api/v1/feedback"] });
    },
  });

  const handleClose = () => {
    setType("");
    setSubject("");
    setDescription("");
    setScreenshot(null);
    setSubmitted(false);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-lg mx-4 mb-4 sm:mb-0 rounded-2xl bg-card border border-border/50 shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#1D2A44] to-[#2a3f6b] flex items-center justify-center">
              <MessageSquarePlus className="h-4 w-4 text-[#C9A96E]" />
            </div>
            <h2 className="font-semibold text-lg">Send Feedback</h2>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {submitted ? (
            <div className="py-8 text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="font-semibold text-lg">Thank you!</h3>
              <p className="text-sm text-muted-foreground">
                Your feedback has been received. We'll review it and get back to you if needed.
              </p>
              <Button onClick={handleClose} variant="outline" className="mt-4">
                Close
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">What type of feedback?</label>
                <div className="grid grid-cols-2 gap-2">
                  {FEEDBACK_TYPES.map((ft) => {
                    const Icon = ft.icon;
                    return (
                      <button
                        key={ft.value}
                        onClick={() => setType(ft.value)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm transition-all text-left ${
                          type === ft.value
                            ? "border-[#C9A96E] bg-[#C9A96E]/10 ring-1 ring-[#C9A96E]/30"
                            : "border-border/50 hover:bg-muted/50"
                        }`}
                      >
                        <Icon className={`h-4 w-4 flex-shrink-0 ${ft.color}`} />
                        <span>{ft.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={200}
                  placeholder="Brief summary of your feedback"
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-border/50 bg-background focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/50"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Tell us more about your feedback..."
                  rows={4}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-border/50 bg-background focus:outline-none focus:ring-2 focus:ring-[#C9A96E]/50 resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Screenshot (optional)</label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-border cursor-pointer hover:bg-muted/50 transition-colors text-sm text-muted-foreground">
                    <Camera className="h-4 w-4" />
                    {screenshot ? screenshot.name : "Attach image"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => setScreenshot(e.target.files?.[0] || null)}
                    />
                  </label>
                  {screenshot && (
                    <button
                      onClick={() => setScreenshot(null)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>

              {submitMutation.isError && (
                <p className="text-sm text-red-500">{submitMutation.error.message}</p>
              )}
            </>
          )}
        </div>

        {!submitted && (
          <div className="px-5 py-4 border-t border-border/50">
            <Button
              onClick={() => submitMutation.mutate()}
              disabled={!type || !subject.trim() || !description.trim() || submitMutation.isPending}
              className="w-full bg-[#1D2A44] hover:bg-[#2a3f6b] text-white"
            >
              {submitMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <MessageSquarePlus className="h-4 w-4 mr-2" />
              )}
              Submit Feedback
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function FeedbackButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 z-40 w-12 h-12 rounded-full bg-[#1D2A44] text-white shadow-lg shadow-[#1D2A44]/25 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        style={{ bottom: "calc(6rem + env(safe-area-inset-bottom))" }}
        aria-label="Send feedback"
      >
        <MessageSquarePlus className="h-5 w-5" />
      </button>
      <FeedbackDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
