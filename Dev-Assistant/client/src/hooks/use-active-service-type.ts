import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/lib/user-context";
import { versionedUrl } from "@/lib/queryClient";

export type ServiceType = "CLEANING" | "PA";
export type ServiceRole = "CLIENT" | "PROVIDER";

export interface ServiceMembership {
  serviceType: ServiceType;
  serviceRole: ServiceRole;
  isActive: boolean;
}

interface ServicesResponse {
  householdId: string;
  memberships: ServiceMembership[];
  defaultServiceType: ServiceType | null;
}

function getStorageKey(householdId: string): string {
  return `activeServiceType:${householdId}`;
}

export function useActiveServiceType() {
  const { userProfile, isLoading: userLoading } = useUser();
  const queryClient = useQueryClient();
  const activeHouseholdId = userProfile?.householdId;
  
  const { data: servicesData, isLoading } = useQuery<ServicesResponse>({
    queryKey: [activeHouseholdId, "/api/services/mine"],
    queryFn: async () => {
      const res = await fetch(versionedUrl("/api/services/mine"), {
        headers: activeHouseholdId ? { "X-Household-Id": activeHouseholdId } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch services");
      return res.json();
    },
    enabled: !!userProfile && !!activeHouseholdId,
    staleTime: 5 * 60 * 1000,
  });

  const [activeServiceType, setActiveServiceTypeState] = useState<ServiceType>(() => {
    if (!activeHouseholdId) return "PA";
    const stored = localStorage.getItem(getStorageKey(activeHouseholdId));
    return (stored === "CLEANING" || stored === "PA") ? stored : "PA";
  });

  useEffect(() => {
    if (!activeHouseholdId) return;
    
    const stored = localStorage.getItem(getStorageKey(activeHouseholdId));
    if (stored === "CLEANING" || stored === "PA") {
      setActiveServiceTypeState(stored);
    } else if (servicesData?.defaultServiceType) {
      setActiveServiceTypeState(servicesData.defaultServiceType);
    } else if (servicesData?.memberships?.length === 1) {
      setActiveServiceTypeState(servicesData.memberships[0].serviceType);
    }
  }, [activeHouseholdId, servicesData]);

  const setActiveServiceType = useCallback((serviceType: ServiceType) => {
    if (!activeHouseholdId) return;
    localStorage.setItem(getStorageKey(activeHouseholdId), serviceType);
    setActiveServiceTypeState(serviceType);
    
    queryClient.invalidateQueries({ queryKey: [activeHouseholdId] });
  }, [activeHouseholdId, queryClient]);

  const memberships = servicesData?.memberships ?? [];
  const hasMultipleServices = memberships.length > 1;
  const availableServiceTypes = memberships.map(m => m.serviceType);

  return {
    activeServiceType,
    setActiveServiceType,
    memberships,
    hasMultipleServices,
    availableServiceTypes,
    isLoading,
  };
}
