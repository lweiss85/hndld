import { useQuery } from "@tanstack/react-query";

interface HouseholdData {
  id: string;
  name: string;
  serviceType: "PA" | "CLEANING";
}

export function useServiceType() {
  const { data: household, isLoading } = useQuery<HouseholdData>({
    queryKey: ["/api/household"],
  });

  return {
    serviceType: household?.serviceType || "PA",
    isCleaning: household?.serviceType === "CLEANING",
    isPA: household?.serviceType !== "CLEANING",
    isLoading,
  };
}
