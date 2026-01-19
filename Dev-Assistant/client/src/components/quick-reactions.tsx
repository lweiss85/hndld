import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, HelpCircle, RefreshCw, Heart, Bookmark, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/components/juice";
import { useUser } from "@/lib/user-context";

type ReactionType = "LOOKS_GOOD" | "NEED_DETAILS" | "PLEASE_ADJUST" | "LOVE_IT" | "SAVE_THIS";

interface ReactionConfig {
  type: ReactionType;
  icon: typeof Check;
  label: string;
  shortLabel: string;
  needsNote?: boolean;
}

const REACTIONS: ReactionConfig[] = [
  { type: "LOOKS_GOOD", icon: Check, label: "Looks Good", shortLabel: "Good" },
  { type: "NEED_DETAILS", icon: HelpCircle, label: "Need Details", shortLabel: "Details", needsNote: true },
  { type: "PLEASE_ADJUST", icon: RefreshCw, label: "Please Adjust", shortLabel: "Adjust", needsNote: true },
  { type: "LOVE_IT", icon: Heart, label: "Love It", shortLabel: "Love" },
  { type: "SAVE_THIS", icon: Bookmark, label: "Save This", shortLabel: "Save" },
];

const NOTE_CHIPS = ["Cost?", "Timeline?", "Photos?", "What's next?", "Why this option?"];

interface QuickReactionsProps {
  entityType: "TASK" | "UPDATE" | "APPROVAL";
  entityId: string;
  compact?: boolean;
}

export function QuickReactions({ entityType, entityId, compact = false }: QuickReactionsProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { userProfile } = useUser();
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [pendingReaction, setPendingReaction] = useState<ReactionType | null>(null);
  const [noteText, setNoteText] = useState("");
  const [animatingReaction, setAnimatingReaction] = useState<ReactionType | null>(null);
  const [floatingHearts, setFloatingHearts] = useState<number[]>([]);
  const [countAnimating, setCountAnimating] = useState<ReactionType | null>(null);

  const householdId = userProfile?.householdId || localStorage.getItem("activeHouseholdId");

  const { data: reactionsData } = useQuery<{
    reactions: Record<string, Record<string, number>>;
    userReactions: Record<string, string>;
  }>({
    queryKey: ["/api/reactions", entityType, entityId, householdId],
    queryFn: async ({ queryKey }) => {
      const hId = queryKey[3] as string;
      const res = await fetch(`/api/reactions?entityType=${entityType}&entityIds=${entityId}`, {
        credentials: "include",
        headers: hId ? { "X-Household-Id": hId } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch reactions");
      return res.json();
    },
    enabled: !!householdId,
  });

  const reactionMutation = useMutation({
    mutationFn: async (data: { reactionType: ReactionType; note?: string }) => {
      return apiRequest("POST", "/api/reactions", {
        entityType,
        entityId,
        reactionType: data.reactionType,
        note: data.note,
      });
    },
    onMutate: (variables) => {
      setAnimatingReaction(variables.reactionType);
      setCountAnimating(variables.reactionType);
      triggerHaptic("light");
      
      if (variables.reactionType === "LOVE_IT") {
        const heartId = Date.now();
        setFloatingHearts(prev => [...prev, heartId]);
        setTimeout(() => {
          setFloatingHearts(prev => prev.filter(id => id !== heartId));
        }, 800);
      }
      
      setTimeout(() => setAnimatingReaction(null), 600);
      setTimeout(() => setCountAnimating(null), 300);
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reactions", entityType, entityId, householdId] });
      if (result.action === "removed") {
        toast({ description: "Reaction removed" });
      } else if (result.reaction?.reactionType === "SAVE_THIS") {
        toast({ description: "Bookmarked for reference" });
      }
    },
    onError: () => {
      toast({ variant: "destructive", description: "Failed to save reaction" });
    },
  });

  const currentCounts = reactionsData?.reactions?.[entityId] || {};
  const userReaction = reactionsData?.userReactions?.[entityId];

  const handleReactionClick = (reaction: ReactionConfig) => {
    if (reaction.needsNote && userReaction !== reaction.type) {
      setPendingReaction(reaction.type);
      setNoteText("");
      setNoteModalOpen(true);
    } else {
      reactionMutation.mutate({ reactionType: reaction.type });
    }
  };

  const handleNoteSubmit = () => {
    if (pendingReaction) {
      reactionMutation.mutate({ reactionType: pendingReaction, note: noteText || undefined });
      setNoteModalOpen(false);
      setPendingReaction(null);
      setNoteText("");
    }
  };

  const handleChipClick = (chip: string) => {
    setNoteText((prev) => (prev ? `${prev} ${chip}` : chip));
  };

  return (
    <>
      <div className={cn("flex items-center gap-1 flex-wrap", compact && "gap-0.5")}>
        {REACTIONS.map((reaction) => {
          const Icon = reaction.icon;
          const count = currentCounts[reaction.type] || 0;
          const isSelected = userReaction === reaction.type;
          const isAnimating = animatingReaction === reaction.type;
          const isCountAnimating = countAnimating === reaction.type;

          return (
            <div key={reaction.type} className="relative">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleReactionClick(reaction)}
                    disabled={reactionMutation.isPending}
                    className={cn(
                      "gap-1 text-xs relative overflow-visible transition-all duration-200",
                      compact && "h-7 px-2",
                      isSelected && reaction.type === "LOOKS_GOOD" && "bg-emerald-500 hover:bg-emerald-600 text-white",
                      isSelected && reaction.type === "LOVE_IT" && "bg-red-500 hover:bg-red-600 text-white",
                      isSelected && reaction.type !== "LOOKS_GOOD" && reaction.type !== "LOVE_IT" && "bg-primary text-primary-foreground hover:bg-primary/90",
                      isAnimating && "animate-reaction-pop"
                    )}
                    data-testid={`reaction-${reaction.type.toLowerCase()}-${entityId}`}
                  >
                    {isAnimating && (
                      <span className="absolute inset-0 rounded-md animate-ripple-out bg-primary/20 pointer-events-none" />
                    )}
                    <Icon className={cn(
                      "h-3.5 w-3.5 transition-all duration-200",
                      isSelected && (reaction.type === "LOOKS_GOOD" || reaction.type === "LOVE_IT") && "text-white",
                      reaction.type === "LOVE_IT" && isSelected && "fill-current",
                      isAnimating && "scale-125"
                    )} />
                    {!compact && <span>{reaction.shortLabel}</span>}
                    {count > 0 && (
                      <Badge 
                        variant="secondary" 
                        className={cn(
                          "ml-0.5 h-4 px-1 text-[10px]",
                          isCountAnimating && "animate-count-pop"
                        )}
                      >
                        {count}
                      </Badge>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">{reaction.label}</TooltipContent>
              </Tooltip>
              
              {reaction.type === "LOVE_IT" && floatingHearts.map((heartId) => (
                <Heart 
                  key={heartId}
                  className="absolute left-1/2 top-0 -translate-x-1/2 h-4 w-4 fill-red-500 text-red-500 animate-float-up pointer-events-none"
                />
              ))}
            </div>
          );
        })}
      </div>

      <Dialog open={noteModalOpen} onOpenChange={setNoteModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pendingReaction === "NEED_DETAILS" ? "What details do you need?" : "What should be adjusted?"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {NOTE_CHIPS.map((chip) => (
                <Button
                  key={chip}
                  variant="outline"
                  size="sm"
                  onClick={() => handleChipClick(chip)}
                  data-testid={`chip-${chip.replace(/[?\s]/g, "-").toLowerCase()}`}
                >
                  {chip}
                </Button>
              ))}
            </div>
            <Input
              placeholder="Add a note..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              data-testid="input-reaction-note"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNoteModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleNoteSubmit} disabled={reactionMutation.isPending} data-testid="button-submit-reaction">
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
