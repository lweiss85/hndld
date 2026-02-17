import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useOnboardingTour } from "./tour";

export function ReplayTourButton() {
  const { setIsOpen, setCurrentStep } = useOnboardingTour();

  const resetTourMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/user-profile/tour", { completed: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-profile"] });
      setCurrentStep(0);
      setIsOpen(true);
    },
  });

  return (
    <Button
      variant="outline"
      onClick={() => resetTourMutation.mutate()}
      disabled={resetTourMutation.isPending}
      className="gap-2"
      aria-label="Replay app tour"
    >
      <RotateCcw className="h-4 w-4" aria-hidden="true" />
      {resetTourMutation.isPending ? "Starting..." : "Replay Tour"}
    </Button>
  );
}
