import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Lightbulb, 
  AlertCircle, 
  Calendar, 
  CheckCircle2,
  Clock,
  ArrowRight,
  Sparkles
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

interface SmartSuggestion {
  id: string;
  type: "task" | "reminder" | "vendor" | "event" | "pattern";
  title: string;
  description: string;
  actionLabel: string;
  actionType: "create_task" | "view" | "contact" | "schedule";
  metadata?: Record<string, unknown>;
  priority: number;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  task: <CheckCircle2 className="h-4 w-4" />,
  reminder: <AlertCircle className="h-4 w-4" />,
  vendor: <Clock className="h-4 w-4" />,
  event: <Calendar className="h-4 w-4" />,
  pattern: <Sparkles className="h-4 w-4" />,
};

const TYPE_COLORS: Record<string, string> = {
  task: "bg-info-muted text-info-muted-foreground",
  reminder: "bg-warning-muted text-warning-muted-foreground",
  vendor: "bg-muted text-muted-foreground",
  event: "bg-success-muted text-success-muted-foreground",
  pattern: "bg-warning-muted text-warning-muted-foreground",
};

function SuggestionSkeleton() {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/30">
      <Skeleton className="h-8 w-8 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

function SuggestionItem({ suggestion, onAction }: { 
  suggestion: SmartSuggestion; 
  onAction: (suggestion: SmartSuggestion) => void;
}) {
  const getActionHref = () => {
    if (suggestion.actionType === "view" && suggestion.metadata?.filter) {
      if (suggestion.metadata.filter === "overdue") {
        return "/tasks?filter=overdue";
      }
      if (suggestion.metadata.filter === "waiting") {
        return "/tasks?filter=waiting";
      }
    }
    return null;
  };

  const href = getActionHref();

  return (
    <div 
      className="flex items-start gap-3 p-3 rounded-xl bg-card border border-border hover:bg-muted/50 transition-colors"
      data-testid={`suggestion-${suggestion.id}`}
    >
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
        TYPE_COLORS[suggestion.type] || TYPE_COLORS.pattern
      )}>
        {TYPE_ICONS[suggestion.type] || TYPE_ICONS.pattern}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{suggestion.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
          {suggestion.description}
        </p>
      </div>
      {href ? (
        <Link href={href}>
          <Button variant="ghost" size="sm" className="shrink-0 h-8 px-2">
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      ) : (
        <Button 
          variant="ghost" 
          size="sm" 
          className="shrink-0 h-8 px-2"
          onClick={() => onAction(suggestion)}
        >
          <ArrowRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

interface SmartSuggestionsProps {
  className?: string;
  onCreateTask?: (title: string, metadata?: Record<string, unknown>) => void;
}

export function SmartSuggestions({ className, onCreateTask }: SmartSuggestionsProps) {
  const { data: suggestions, isLoading } = useQuery<SmartSuggestion[]>({
    queryKey: ["/api/suggestions"],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const handleAction = (suggestion: SmartSuggestion) => {
    if (suggestion.actionType === "create_task" && onCreateTask) {
      onCreateTask(suggestion.title, suggestion.metadata);
    }
  };

  if (isLoading) {
    return (
      <Card className={cn("", className)}>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">Smart Suggestions</span>
          </div>
          <div className="space-y-2">
            <SuggestionSkeleton />
            <SuggestionSkeleton />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!suggestions || suggestions.length === 0) {
    return null;
  }

  return (
    <Card className={cn("", className)} data-testid="smart-suggestions">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Smart Suggestions</span>
          <span className="text-xs text-muted-foreground">AI-powered</span>
        </div>
        <div className="space-y-2">
          {suggestions.slice(0, 3).map((suggestion) => (
            <SuggestionItem 
              key={suggestion.id} 
              suggestion={suggestion}
              onAction={handleAction}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
