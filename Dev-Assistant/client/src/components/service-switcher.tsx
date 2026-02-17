import { useActiveServiceType, ServiceType } from "@/hooks/use-active-service-type";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown, Sparkles, Home } from "lucide-react";

const SERVICE_LABELS: Record<ServiceType, { label: string; icon: typeof Sparkles }> = {
  CLEANING: { label: "Cleaning", icon: Sparkles },
  PA: { label: "Personal Assistant", icon: Home },
};

export function ServiceSwitcher() {
  const { 
    activeServiceType, 
    setActiveServiceType, 
    hasMultipleServices, 
    availableServiceTypes,
    isLoading 
  } = useActiveServiceType();

  if (isLoading || !hasMultipleServices) {
    return null;
  }

  const current = SERVICE_LABELS[activeServiceType];
  const CurrentIcon = current.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="gap-1.5 text-xs font-medium text-ink-navy/70 hover:text-ink-navy"
          aria-label="Switch service type"
        >
          <CurrentIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {current.label}
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        {availableServiceTypes.map((serviceType) => {
          const service = SERVICE_LABELS[serviceType];
          const Icon = service.icon;
          const isActive = serviceType === activeServiceType;
          
          return (
            <DropdownMenuItem
              key={serviceType}
              onClick={() => setActiveServiceType(serviceType)}
              className={isActive ? "bg-porcelain" : ""}
            >
              <Icon className="h-4 w-4 mr-2" aria-hidden="true" />
              {service.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ServiceBadge({ serviceType }: { serviceType: ServiceType }) {
  const label = SERVICE_LABELS[serviceType]?.label ?? serviceType;
  
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-ink-navy/5 text-ink-navy/60">
      {serviceType === "CLEANING" ? "Cleaning" : "PA"}
    </span>
  );
}
