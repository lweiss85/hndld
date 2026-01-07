import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  MessageSquare, ShoppingCart, Car, Wrench, Calendar, Gift, 
  Home, Utensils, Dog, Baby, Sparkles, AlertCircle, Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { QuickRequestTemplate } from "@shared/schema";

const iconMap: Record<string, typeof MessageSquare> = {
  MessageSquare,
  ShoppingCart,
  Car,
  Wrench,
  Calendar,
  Gift,
  Home,
  Utensils,
  Dog,
  Baby,
  Sparkles,
  AlertCircle,
  Plus,
};

interface QuickRequestButtonsProps {
  onRequestCreated?: () => void;
}

export function QuickRequestButtons({ onRequestCreated }: QuickRequestButtonsProps) {
  const { toast } = useToast();

  const { data: templates = [], isLoading } = useQuery<QuickRequestTemplate[]>({
    queryKey: ["/api/quick-request-templates"],
  });

  const createRequestMutation = useMutation({
    mutationFn: async (template: QuickRequestTemplate) => {
      return apiRequest("POST", "/api/requests", {
        title: template.title,
        description: template.description || `Quick request: ${template.title}`,
        category: template.category,
        urgency: template.urgency,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
      toast({
        title: "Request sent",
        description: "Your request has been submitted to your assistant.",
      });
      onRequestCreated?.();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to submit request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleQuickRequest = (template: QuickRequestTemplate) => {
    createRequestMutation.mutate(template);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Requests</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (templates.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Quick Requests
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {templates.map((template) => {
            const Icon = iconMap[template.icon || "MessageSquare"] || MessageSquare;
            return (
              <Button
                key={template.id}
                variant="outline"
                className="h-auto py-4 px-3 flex flex-col items-center gap-2 text-center"
                onClick={() => handleQuickRequest(template)}
                disabled={createRequestMutation.isPending}
                data-testid={`quick-request-${template.id}`}
              >
                <Icon className="h-6 w-6 text-primary" />
                <span className="text-sm font-medium leading-tight">{template.title}</span>
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
