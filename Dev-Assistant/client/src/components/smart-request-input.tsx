import { useState, useCallback, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Send, Clock, MapPin, Check, X, Tag, AlertTriangle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";

interface ParsedRequest {
  title: string;
  description?: string;
  category: string;
  urgency: string;
  suggestedDueDate?: string;
  location?: string;
  confidence: number;
  usedAI: boolean;
}

interface SmartRequestInputProps {
  onSubmit: (data: {
    title: string;
    description?: string;
    category: string;
    urgency: string;
    dueAt?: Date;
    location?: string;
  }) => void;
  isSubmitting?: boolean;
  placeholder?: string;
}

const CATEGORY_STYLES: Record<string, string> = {
  HOUSEHOLD: "bg-info-muted text-info-muted-foreground",
  ERRANDS: "bg-warning-muted text-warning-muted-foreground",
  MAINTENANCE: "bg-warning-muted text-warning-muted-foreground",
  GROCERIES: "bg-success-muted text-success-muted-foreground",
  KIDS: "bg-info-muted text-info-muted-foreground",
  PETS: "bg-info-muted text-info-muted-foreground",
  EVENTS: "bg-info-muted text-info-muted-foreground",
  OTHER: "bg-muted text-muted-foreground",
};

const URGENCY_STYLES: Record<string, string> = {
  HIGH: "bg-destructive-muted text-destructive-muted-foreground",
  MEDIUM: "bg-warning-muted text-warning-muted-foreground",
  LOW: "bg-success-muted text-success-muted-foreground",
};

export function SmartRequestInput({
  onSubmit,
  isSubmitting,
  placeholder = "What do you need help with? Try: 'Pick up dry cleaning tomorrow afternoon'",
}: SmartRequestInputProps) {
  const [input, setInput] = useState("");
  const [parsed, setParsed] = useState<ParsedRequest | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);

  const parseMutation = useMutation({
    mutationFn: async (text: string) => {
      const response = await apiRequest("POST", "/api/ai/parse-smart", { text });
      return response.json();
    },
    onSuccess: (data: ParsedRequest) => {
      setParsed(data);
      setShowPreview(true);
    },
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);
    setShowPreview(false);
    setParsed(null);

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    if (value.trim().length >= 10) {
      const timer = setTimeout(() => {
        parseMutation.mutate(value.trim());
      }, 800);
      setDebounceTimer(timer);
    }
  };

  useEffect(() => {
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
  }, [debounceTimer]);

  const handleSubmit = useCallback(() => {
    if (!parsed) return;

    onSubmit({
      title: parsed.title,
      description: parsed.description,
      category: parsed.category,
      urgency: parsed.urgency,
      dueAt: parsed.suggestedDueDate ? parseISO(parsed.suggestedDueDate) : undefined,
      location: parsed.location,
    });

    setInput("");
    setParsed(null);
    setShowPreview(false);
  }, [parsed, onSubmit]);

  const handleCancel = () => {
    setParsed(null);
    setShowPreview(false);
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Textarea
          value={input}
          onChange={handleInputChange}
          placeholder={placeholder}
          className="min-h-[80px] pr-10 resize-none"
          aria-label="Request description"
          data-testid="input-smart-request"
        />
        <div className="absolute right-2 top-2">
          {parseMutation.isPending ? (
            <Sparkles className="h-5 w-5 text-violet-500 animate-pulse" aria-hidden="true" />
          ) : (
            <Sparkles className="h-5 w-5 text-muted-foreground/40" aria-hidden="true" />
          )}
        </div>
      </div>

      {parseMutation.isPending && !showPreview && (
        <Card>
          <CardContent className="p-3 space-y-2" aria-busy="true" aria-label="Parsing request">
            <Skeleton className="h-4 w-3/4" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-16" />
            </div>
          </CardContent>
        </Card>
      )}

      {showPreview && parsed && (
        <Card className="border-violet-200 dark:border-violet-800">
          <CardContent className="p-3 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{parsed.title}</p>
                {parsed.description && (
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                    {parsed.description}
                  </p>
                )}
              </div>
              {parsed.usedAI && (
                <Badge variant="outline" className="shrink-0 text-xs border-violet-300 text-violet-600 dark:border-violet-700 dark:text-violet-400">
                  <Sparkles className="h-3 w-3 mr-1" aria-hidden="true" />
                  AI
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge className={cn("text-xs", CATEGORY_STYLES[parsed.category])}>
                <Tag className="h-3 w-3 mr-1" aria-hidden="true" />
                {parsed.category}
              </Badge>
              <Badge className={cn("text-xs", URGENCY_STYLES[parsed.urgency])}>
                <AlertTriangle className="h-3 w-3 mr-1" aria-hidden="true" />
                {parsed.urgency}
              </Badge>
              {parsed.suggestedDueDate && (
                <Badge variant="outline" className="text-xs">
                  <Clock className="h-3 w-3 mr-1" aria-hidden="true" />
                  {format(parseISO(parsed.suggestedDueDate), "MMM d")}
                </Badge>
              )}
              {parsed.location && (
                <Badge variant="outline" className="text-xs">
                  <MapPin className="h-3 w-3 mr-1" aria-hidden="true" />
                  {parsed.location}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-1"
                data-testid="button-smart-request-submit"
              >
                <Check className="h-4 w-4 mr-1" aria-hidden="true" />
                Create Request
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCancel}
                disabled={isSubmitting}
                aria-label="Cancel request"
                data-testid="button-smart-request-cancel"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
