import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/queryClient";

interface AIBriefData {
  brief: string;
}

interface AIStatus {
  available: boolean;
  provider: string;
  demoMode: boolean;
}

export function AIWeeklyBrief() {
  const { data: status } = useQuery<AIStatus>({
    queryKey: ["/api/ai/status"],
  });

  const { data, isLoading, isFetching } = useQuery<AIBriefData>({
    queryKey: ["/api/ai/weekly-brief"],
    staleTime: 1000 * 60 * 5,
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/ai/weekly-brief"] });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4 mt-2" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="relative overflow-hidden" data-testid="card-ai-brief">
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Weekly Brief
        </CardTitle>
        <div className="flex items-center gap-2">
          {status?.demoMode && (
            <Badge variant="secondary" className="text-xs">Demo</Badge>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleRefresh}
                disabled={isFetching}
                data-testid="button-refresh-brief"
              >
                <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh brief</TooltipContent>
          </Tooltip>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {data?.brief || "Your personalized weekly summary will appear here."}
        </p>
      </CardContent>
    </Card>
  );
}
