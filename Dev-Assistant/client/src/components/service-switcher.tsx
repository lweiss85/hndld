import { useActiveServiceType, ServiceType } from "@/hooks/use-active-service-type";
import { triggerHaptic } from "@/components/juice";

const SERVICE_LABELS: Record<ServiceType, string> = {
  CLEANING: "Cleaning",
  PA: "Personal Assistant",
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

  return (
    <div className="flex gap-1.5" role="tablist" aria-label="Service type">
      {availableServiceTypes.map((serviceType) => {
        const isActive = serviceType === activeServiceType;
        return (
          <button
            key={serviceType}
            role="tab"
            aria-selected={isActive}
            onClick={() => {
              setActiveServiceType(serviceType);
              triggerHaptic("light");
            }}
            className={`
              px-3 py-1 rounded-full text-xs font-medium transition-all duration-200
              ${isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/60 text-muted-foreground hover:bg-muted"
              }
            `}
            style={{
              fontFamily: "'DM Sans', system-ui, sans-serif",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            {SERVICE_LABELS[serviceType]}
          </button>
        );
      })}
    </div>
  );
}

export function ServiceBadge({ serviceType }: { serviceType: ServiceType }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-ink-navy/5 text-ink-navy/60">
      {serviceType === "CLEANING" ? "Cleaning" : "PA"}
    </span>
  );
}
