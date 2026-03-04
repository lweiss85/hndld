import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Receipt, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Update, Comment } from "@shared/schema";
import { QuickReactions } from "@/components/quick-reactions";

interface UpdateWithComments extends Update {
  comments?: Comment[];
}

type UpdateType = "CLEANING" | "GROCERY" | "MAINTENANCE" | "DEFAULT";

const BORDER_COLORS: Record<UpdateType, string> = {
  CLEANING: "#2E7D5B",
  GROCERY: "#B07A2A",
  MAINTENANCE: "#1e3058",
  DEFAULT: "transparent",
};

function detectUpdateType(update: Update): UpdateType {
  const text = (update.text || "").toLowerCase();
  const serviceType = update.serviceType;

  if (serviceType === "CLEANING" || text.includes("clean")) {
    return "CLEANING";
  }
  if (
    text.includes("grocer") ||
    text.includes("errand") ||
    text.includes("items") ||
    text.includes("shopping") ||
    text.includes("picked up") ||
    text.includes("delivered")
  ) {
    return "GROCERY";
  }
  if (
    text.includes("repair") ||
    text.includes("maintenance") ||
    text.includes("fix") ||
    text.includes("plumb") ||
    text.includes("hvac") ||
    text.includes("electrician")
  ) {
    return "MAINTENANCE";
  }
  return "DEFAULT";
}

function parseItemCount(text: string): number | null {
  const match = text.match(/(\d+)\s*items?/i);
  return match ? parseInt(match[1], 10) : null;
}

function inferMaintenanceStatus(text: string): "scheduled" | "in_progress" | "done" {
  const lower = text.toLowerCase();
  if (lower.includes("completed") || lower.includes("done") || lower.includes("finished") || lower.includes("fixed")) {
    return "done";
  }
  if (lower.includes("in progress") || lower.includes("working") || lower.includes("started")) {
    return "in_progress";
  }
  return "scheduled";
}

function StatusTimeline({ status }: { status: "scheduled" | "in_progress" | "done" }) {
  const steps = [
    { key: "scheduled", label: "Scheduled" },
    { key: "in_progress", label: "In Progress" },
    { key: "done", label: "Done" },
  ];
  const activeIndex = steps.findIndex((s) => s.key === status);

  return (
    <div className="flex items-center gap-1 mt-3">
      {steps.map((step, i) => (
        <div key={step.key} className="flex items-center gap-1">
          <div
            className={`w-2 h-2 rounded-full ${
              i <= activeIndex ? "bg-[#1e3058]" : "bg-muted-foreground/20"
            }`}
          />
          <span
            className={`text-[10px] uppercase tracking-wide ${
              i <= activeIndex ? "text-foreground font-medium" : "text-muted-foreground"
            }`}
          >
            {step.label}
          </span>
          {i < steps.length - 1 && (
            <div
              className={`w-4 h-px ${
                i < activeIndex ? "bg-[#1e3058]" : "bg-muted-foreground/20"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function BeforeAfterViewer({ images }: { images: string[] }) {
  return (
    <div className="flex gap-0.5 mt-3 rounded-lg overflow-hidden">
      <div className="flex-1 relative">
        <img
          src={images[0]}
          alt="Before"
          className="w-full aspect-[4/3] object-cover"
        />
        <span className="absolute bottom-1 left-1 text-[10px] uppercase tracking-wider text-white/90 bg-black/40 px-1.5 py-0.5 rounded">
          Before
        </span>
      </div>
      <div className="w-px bg-background" />
      <div className="flex-1 relative">
        <img
          src={images[1]}
          alt="After"
          className="w-full aspect-[4/3] object-cover"
        />
        <span className="absolute bottom-1 left-1 text-[10px] uppercase tracking-wider text-white/90 bg-black/40 px-1.5 py-0.5 rounded">
          After
        </span>
      </div>
    </div>
  );
}

interface UpdateCardProps {
  update: UpdateWithComments;
  onCommentClick: (update: UpdateWithComments) => void;
}

export function UpdateCard({ update, onCommentClick }: UpdateCardProps) {
  const type = detectUpdateType(update);
  const borderColor = BORDER_COLORS[type];
  const images = (update.images as string[]) || [];
  const receipts = (update.receipts as string[]) || [];

  const text = update.text || "";
  const showBeforeAfter = type === "CLEANING" && images.length >= 2;
  const showReceiptThumb = type === "GROCERY" && receipts.length > 0 && /\.(jpe?g|png|webp|gif)/i.test(receipts[0]);
  const itemCount = type === "GROCERY" ? parseItemCount(text) : null;
  const maintenanceStatus = type === "MAINTENANCE" ? inferMaintenanceStatus(text) : null;

  return (
    <Card
      className="rounded-2xl overflow-hidden"
      data-testid={`card-update-${update.id}`}
      style={
        type !== "DEFAULT"
          ? { borderLeft: `3px solid ${borderColor}` }
          : undefined
      }
    >
      <CardContent className="p-4">
        <div className="flex gap-3">
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary text-sm">
              A
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-sm">Assistant</span>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(update.createdAt!), { addSuffix: true })}
              </span>
              {type === "CLEANING" && (
                <Badge variant="outline" className="ml-auto text-[10px] gap-1 text-emerald-600 border-emerald-200 bg-emerald-50">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Completed
                </Badge>
              )}
              {type === "GROCERY" && itemCount && (
                <Badge variant="outline" className="ml-auto text-[10px] text-amber-700 border-amber-200 bg-amber-50">
                  {itemCount} items
                </Badge>
              )}
            </div>

            <div className={showReceiptThumb ? "flex gap-3" : ""}>
              <div className="flex-1 min-w-0">
                <p className="text-sm whitespace-pre-wrap">{update.text}</p>
              </div>
              {showReceiptThumb && (
                <img
                  src={receipts[0]}
                  alt="Receipt"
                  className="w-[60px] h-[80px] rounded-lg object-cover shrink-0"
                />
              )}
            </div>

            {showBeforeAfter ? (
              <BeforeAfterViewer images={images} />
            ) : (
              images.length > 0 && (
                <div className="grid grid-cols-2 gap-2 mt-3">
                  {images.slice(0, 4).map((img, i) => (
                    <img
                      key={i}
                      src={img}
                      alt={`Update photo ${i + 1}`}
                      className="rounded-md w-full aspect-square object-cover"
                    />
                  ))}
                </div>
              )
            )}

            {!showReceiptThumb && receipts.length > 0 && (
              <div className="flex items-center gap-2 mt-3 p-2 rounded-md bg-muted/50">
                <Receipt className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span className="text-xs text-muted-foreground">
                  {receipts.length} receipt(s) attached
                </span>
              </div>
            )}

            {maintenanceStatus && <StatusTimeline status={maintenanceStatus} />}

            <div className="flex items-center gap-2 mt-3 pt-3 border-t flex-wrap">
              <QuickReactions entityType="UPDATE" entityId={update.id} compact />

              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 gap-1 ml-auto"
                onClick={() => onCommentClick(update)}
                aria-label="View comments"
                data-testid="button-comments"
              >
                <MessageSquare className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                {update.comments?.length || 0}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
