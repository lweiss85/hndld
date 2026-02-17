import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Building2, Check, ChevronDown } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { triggerHaptic } from "@/components/juice";

interface Household {
  id: string;
  name: string;
  userRole: string;
}

export function HouseholdSwitcher() {
  const { toast } = useToast();
  const [activeHouseholdId, setActiveHouseholdId] = useState<string | null>(
    localStorage.getItem("activeHouseholdId")
  );

  const { data: households, isLoading } = useQuery<Household[]>({
    queryKey: ["/api/households/mine"],
  });

  useEffect(() => {
    if (households && households.length > 0 && !activeHouseholdId) {
      const firstHousehold = households[0].id;
      setActiveHouseholdId(firstHousehold);
      localStorage.setItem("activeHouseholdId", firstHousehold);
    }
  }, [households, activeHouseholdId]);

  const activeHousehold = households?.find(h => h.id === activeHouseholdId);

  const switchHousehold = (householdId: string) => {
    setActiveHouseholdId(householdId);
    localStorage.setItem("activeHouseholdId", householdId);
    
    queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    queryClient.invalidateQueries({ queryKey: ["/api/today"] });
    queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
    queryClient.invalidateQueries({ queryKey: ["/api/updates"] });
    queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
    queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
    queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
    queryClient.invalidateQueries({ queryKey: ["/api/spending"] });
    queryClient.invalidateQueries({ queryKey: ["/api/access-items"] });
    queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
    queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    queryClient.invalidateQueries({ queryKey: ["/api/insights"] });
    triggerHaptic("medium");
    
    toast({
      title: "Household switched",
      description: `Now managing: ${households?.find(h => h.id === householdId)?.name}`,
    });
  };

  if (isLoading) {
    return null;
  }

  if (!households || households.length === 0) {
    return null;
  }

  if (households.length === 1) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 text-sm">
        <Building2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="text-muted-foreground text-xs">{households[0].name}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm"
          className="gap-1.5 px-2 h-auto py-1.5"
          aria-label="Switch household"
          data-testid="household-switcher"
        >
          <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="text-xs font-medium max-w-24 truncate">
            {activeHousehold?.name || "Select"}
          </span>
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs">Switch Household</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {households.map((household) => (
          <DropdownMenuItem
            key={household.id}
            onClick={() => switchHousehold(household.id)}
            className="flex items-center justify-between cursor-pointer"
            data-testid={`household-option-${household.id}`}
          >
            <div className="flex flex-col">
              <span className="font-medium">{household.name}</span>
              <span className="text-xs text-muted-foreground capitalize">
                {household.userRole?.toLowerCase().replace("_", " ")}
              </span>
            </div>
            {household.id === activeHouseholdId && (
              <Check className="h-4 w-4 text-primary" aria-hidden="true" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
