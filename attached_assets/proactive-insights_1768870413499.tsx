/**
 * Proactive Insights Component
 * 
 * FILE: client/src/components/proactive-insights.tsx
 * ACTION: Create this new file
 * 
 * Displays AI-generated proactive insights to the user.
 * This is what transforms hndld from reactive to proactive.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Sparkles, X, Bell, Lightbulb, AlertTriangle, Gift,
  ChevronRight, RefreshCw, Clock
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface ProactiveInsight {
  id?: string;
  type: "REMINDER" | "SUGGESTION" | "ALERT" | "OPPORTUNITY";
  priority: "LOW" | "MEDIUM" | "HIGH";
  title: string;
  body: string;
  actionLabel?: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

interface InsightsResponse {
  insights: ProactiveInsight[];
}

const INSIGHT_ICONS = {
  REMINDER: Bell,
  SUGGESTION: Lightbulb,
  ALERT: AlertTriangle,
  OPPORTUNITY: Gift,
};

const PRIORITY_STYLES = {
  HIGH: "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20",
  MEDIUM: "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20",
  LOW: "border-border bg-background",
};

const PRIORITY_BADGE_STYLES = {
  HIGH: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  MEDIUM: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  LOW: "bg-muted text-muted-foreground",
};

export function ProactiveInsights() {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const { data, isLoading, isFetching } = useQuery<InsightsResponse>({
    queryKey: ["/api/ai/insights"],
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/ai/insights/refresh");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/insights"] });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (insightId: string) => {
      await apiRequest("POST", `/api/ai/insights/${insightId}/dismiss`);
    },
  });

  const handleDismiss = (insight: ProactiveInsight, index: number) => {
    const id = insight.id || `temp-${index}`;
    setDismissed(prev => new Set(prev).add(id));
    
    if (insight.id) {
      dismissMutation.mutate(insight.id);
    }
  };

  const visibleInsights = data?.insights.filter((insight, index) => {
    const id = insight.id || `temp-${index}`;
    return !dismissed.has(id);
  }) || [];

  if (isLoading) {
    return (
      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (visibleInsights.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center">
          <Sparkles className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            No insights right now. I'll let you know when something needs your attention.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending || isFetching}
          >
            <RefreshCw className={cn("h-4 w-4 mr-1", (refreshMutation.isPending || isFetching) && "animate-spin")} />
            Check now
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-proactive-insights">
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-500" />
          For You
          {visibleInsights.length > 0 && (
            <Badge variant="secondary" className="ml-1 text-xs">
              {visibleInsights.length}
            </Badge>
          )}
        </CardTitle>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending || isFetching}
        >
          <RefreshCw className={cn("h-4 w-4", (refreshMutation.isPending || isFetching) && "animate-spin")} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {visibleInsights.map((insight, index) => {
          const Icon = INSIGHT_ICONS[insight.type];
          const id = insight.id || `temp-${index}`;
          
          return (
            <div
              key={id}
              className={cn(
                "relative rounded-lg border p-3 transition-all duration-200",
                "animate-in fade-in slide-in-from-top-2",
                PRIORITY_STYLES[insight.priority]
              )}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {/* Dismiss button */}
              <button
                onClick={() => handleDismiss(insight, index)}
                className="absolute top-2 right-2 p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              
              {/* Content */}
              <div className="pr-6">
                <div className="flex items-start gap-2.5">
                  <div className={cn(
                    "shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
                    insight.priority === "HIGH" ? "bg-red-100 text-red-600 dark:bg-red-900/30" :
                    insight.priority === "MEDIUM" ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30" :
                    "bg-muted text-muted-foreground"
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm leading-tight">{insight.title}</p>
                      {insight.priority === "HIGH" && (
                        <Badge className={cn("text-[10px] px-1.5 py-0", PRIORITY_BADGE_STYLES.HIGH)}>
                          Urgent
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5 leading-snug">
                      {insight.body}
                    </p>
                    
                    {insight.actionUrl && (
                      <a
                        href={insight.actionUrl}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline mt-2"
                      >
                        {insight.actionLabel || "View"}
                        <ChevronRight className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/**
 * Compact version for dashboard/header
 */
export function ProactiveInsightsBadge() {
  const { data } = useQuery<InsightsResponse>({
    queryKey: ["/api/ai/insights"],
    staleTime: 1000 * 60 * 5,
  });

  const highPriorityCount = data?.insights.filter(i => i.priority === "HIGH").length || 0;
  const totalCount = data?.insights.length || 0;

  if (totalCount === 0) {
    return null;
  }

  return (
    <div className="relative">
      <Sparkles className="h-5 w-5 text-violet-500" />
      {highPriorityCount > 0 ? (
        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
          {highPriorityCount}
        </span>
      ) : (
        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-violet-500 text-[10px] font-bold text-white">
          {totalCount}
        </span>
      )}
    </div>
  );
}
