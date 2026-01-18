import { cn } from "@/lib/utils";
import { Check, Home, Users, Settings, Key, Sparkles } from "lucide-react";

interface OnboardingStep {
  id: number;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  { id: 1, title: "Home", icon: Home },
  { id: 2, title: "People", icon: Users },
  { id: 3, title: "Rules", icon: Settings },
  { id: 4, title: "Access", icon: Key },
  { id: 5, title: "Done", icon: Sparkles },
];

interface OnboardingStepsProps {
  currentStep: number;
  className?: string;
}

export function OnboardingSteps({ currentStep, className }: OnboardingStepsProps) {
  return (
    <div className={cn("flex items-center justify-between", className)}>
      {ONBOARDING_STEPS.map((step, index) => {
        const isCompleted = step.id < currentStep;
        const isCurrent = step.id === currentStep;
        const isUpcoming = step.id > currentStep;
        const Icon = step.icon;

        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300",
                  isCompleted && "bg-success text-success-foreground",
                  isCurrent && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                  isUpcoming && "bg-muted text-muted-foreground"
                )}
                data-testid={`step-indicator-${step.id}`}
              >
                {isCompleted ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <Icon className="h-5 w-5" />
                )}
              </div>
              <span
                className={cn(
                  "text-xs mt-1.5 font-medium transition-colors",
                  isCompleted && "text-success",
                  isCurrent && "text-foreground",
                  isUpcoming && "text-muted-foreground"
                )}
              >
                {step.title}
              </span>
            </div>
            {index < ONBOARDING_STEPS.length - 1 && (
              <div
                className={cn(
                  "h-0.5 flex-1 mx-2 transition-colors duration-300",
                  step.id < currentStep ? "bg-success" : "bg-muted"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
