import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

const TOTAL_STEPS = 3;

const SERVICE_OPTIONS = [
  { id: "cleaning", label: "Cleaning & home care" },
  { id: "errands", label: "Errands & household tasks" },
  { id: "scheduling", label: "Scheduling & coordination" },
  { id: "everything", label: "Everything — I need it all handled" },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 justify-center">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <div
          key={i}
          className={`h-1 rounded-full transition-all duration-500 ${
            i + 1 <= current ? "w-8 bg-primary" : "w-4 bg-muted-foreground/20"
          }`}
        />
      ))}
    </div>
  );
}

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [selectedPrefs, setSelectedPrefs] = useState<string[]>([]);
  const [householdName, setHouseholdName] = useState("");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [subtitleVisible, setSubtitleVisible] = useState(false);

  useEffect(() => {
    if (step === 1) {
      const subtitleTimer = setTimeout(() => setSubtitleVisible(true), 800);
      const advanceTimer = setTimeout(() => setStep(2), 2500);
      return () => {
        clearTimeout(subtitleTimer);
        clearTimeout(advanceTimer);
      };
    }
  }, [step]);

  useEffect(() => {
    if (step === 3) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [step]);

  const togglePref = (id: string) => {
    setSelectedPrefs((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  const saveStepMutation = useMutation({
    mutationFn: async (data: { step: number; data: any }) => {
      return apiRequest("POST", "/api/onboarding/save-step", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/settings"] });
    },
    onError: (error) => {
      toast({
        title: "Error saving",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/onboarding/complete-phase", { phase: 1 });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-profile"] });
      setLocation("/");
    },
    onError: (error) => {
      toast({
        title: "Error completing setup",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleContinuePrefs = () => {
    localStorage.setItem("hndld_service_prefs", JSON.stringify(selectedPrefs));
    setStep(3);
  };

  const handleSubmit = async () => {
    if (!householdName.trim()) return;
    await saveStepMutation.mutateAsync({
      step: 1,
      data: { type: "basics", name: householdName.trim() },
    });
    completeMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="welcome"
            className="flex-1 flex flex-col items-center justify-center px-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1
              className="font-display text-foreground"
              style={{ fontSize: "48px", fontWeight: 400, letterSpacing: "0.06em" }}
            >
              hndld
            </h1>
            <AnimatePresence>
              {subtitleVisible && (
                <motion.p
                  className="mt-4 text-muted-foreground text-base"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  Your home, handled.
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="preferences"
            className="flex-1 flex flex-col px-6 pt-16 pb-10 max-w-lg mx-auto w-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <StepIndicator current={2} />

            <div className="mt-10 flex-1">
              <h2
                className="font-display text-foreground mb-8"
                style={{ fontSize: "32px" }}
                data-testid="text-step-title"
              >
                What brings you here?
              </h2>

              <div className="space-y-3">
                {SERVICE_OPTIONS.map((option) => {
                  const selected = selectedPrefs.includes(option.id);
                  return (
                    <motion.button
                      key={option.id}
                      type="button"
                      onClick={() => togglePref(option.id)}
                      className={`w-full text-left px-5 py-4 rounded-2xl border-2 transition-colors text-base font-medium ${
                        selected
                          ? "bg-primary text-primary-foreground border-highlight"
                          : "bg-transparent text-foreground border-border hover:border-muted-foreground/40"
                      }`}
                      whileTap={{ scale: 0.98 }}
                      data-testid={`pill-${option.id}`}
                    >
                      {option.label}
                    </motion.button>
                  );
                })}
              </div>
            </div>

            <Button
              className="w-full rounded-xl h-12 text-base mt-8"
              disabled={selectedPrefs.length === 0}
              onClick={handleContinuePrefs}
              data-testid="button-continue"
            >
              Continue
            </Button>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            key="household-name"
            className="flex-1 flex flex-col px-6 pt-16 pb-10 max-w-lg mx-auto w-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <StepIndicator current={3} />

            <div className="mt-10 flex-1">
              <h2
                className="font-display text-foreground mb-8"
                style={{ fontSize: "32px" }}
                data-testid="text-step-title"
              >
                What should we call your home?
              </h2>

              <Input
                ref={inputRef}
                className="text-center text-lg h-14 rounded-xl border-border"
                placeholder="The Weiss Residence"
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                data-testid="input-household-name"
              />

              <p className="text-center text-muted-foreground mt-3" style={{ fontSize: "13px" }}>
                You can always change this later.
              </p>
            </div>

            <Button
              className="w-full rounded-xl h-12 text-base mt-8"
              disabled={!householdName.trim() || completeMutation.isPending || saveStepMutation.isPending}
              onClick={handleSubmit}
              data-testid="button-submit"
            >
              {completeMutation.isPending || saveStepMutation.isPending ? "Setting up..." : "We're ready."}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
