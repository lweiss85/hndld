import { useCallback, useEffect, useMemo, useRef } from "react";
import { TourProvider, useTour, StepType } from "@reactour/tour";
import { useMutation } from "@tanstack/react-query";
import { useUser } from "@/lib/user-context";
import { useActiveServiceType } from "@/hooks/use-active-service-type";
import { apiRequest, queryClient } from "@/lib/queryClient";

const clientSteps: StepType[] = [
  {
    selector: '[data-tour="nav-home"]',
    content: (
      <div className="space-y-2">
        <h3 className="font-semibold text-base text-foreground">This is your home base</h3>
        <p className="text-sm text-muted-foreground">
          Your dashboard shows a snapshot of everything happening in your household — tasks, upcoming events, and recent activity.
        </p>
      </div>
    ),
  },
  {
    selector: '[data-tour="nav-approvals"]',
    content: (
      <div className="space-y-2">
        <h3 className="font-semibold text-base text-foreground">Approve requests here</h3>
        <p className="text-sm text-muted-foreground">
          When your assistant needs your sign-off on purchases, vendors, or decisions, they'll appear here for your review.
        </p>
      </div>
    ),
  },
  {
    selector: '[data-tour="nav-updates"]',
    content: (
      <div className="space-y-2">
        <h3 className="font-semibold text-base text-foreground">Your team posts updates</h3>
        <p className="text-sm text-muted-foreground">
          Stay in the loop without the back-and-forth. Your assistant shares daily progress, completed tasks, and important notes here.
        </p>
      </div>
    ),
  },
  {
    selector: '[data-tour="nav-messages"]',
    content: (
      <div className="space-y-2">
        <h3 className="font-semibold text-base text-foreground">Stay connected</h3>
        <p className="text-sm text-muted-foreground">
          Send messages to your assistant for anything you need. Quick, private, and all in one place.
        </p>
      </div>
    ),
  },
];

const cleaningClientSteps: StepType[] = [
  {
    selector: '[data-tour="nav-home"]',
    content: (
      <div className="space-y-2">
        <h3 className="font-semibold text-base text-foreground">This is your home base</h3>
        <p className="text-sm text-muted-foreground">
          Your dashboard shows upcoming cleanings, recent activity, and everything at a glance.
        </p>
      </div>
    ),
  },
  {
    selector: '[data-tour="nav-schedule"]',
    content: (
      <div className="space-y-2">
        <h3 className="font-semibold text-base text-foreground">Your cleaning schedule</h3>
        <p className="text-sm text-muted-foreground">
          See upcoming and past cleaning visits. Your schedule is managed by your cleaning team.
        </p>
      </div>
    ),
  },
  {
    selector: '[data-tour="nav-add-ons"]',
    content: (
      <div className="space-y-2">
        <h3 className="font-semibold text-base text-foreground">Add extra services</h3>
        <p className="text-sm text-muted-foreground">
          Need deep cleaning, laundry, or organizing? Browse and request add-on services here.
        </p>
      </div>
    ),
  },
  {
    selector: '[data-tour="nav-messages"]',
    content: (
      <div className="space-y-2">
        <h3 className="font-semibold text-base text-foreground">Stay connected</h3>
        <p className="text-sm text-muted-foreground">
          Send messages to your cleaning team for special requests or instructions.
        </p>
      </div>
    ),
  },
];

const assistantSteps: StepType[] = [
  {
    selector: '[data-tour="nav-today"]',
    content: (
      <div className="space-y-2">
        <h3 className="font-semibold text-base text-foreground">This is your home base</h3>
        <p className="text-sm text-muted-foreground">
          Your daily overview shows today's priority tasks, upcoming events, and anything that needs your attention right away.
        </p>
      </div>
    ),
  },
  {
    selector: '[data-tour="nav-tasks"]',
    content: (
      <div className="space-y-2">
        <h3 className="font-semibold text-base text-foreground">Manage all tasks</h3>
        <p className="text-sm text-muted-foreground">
          Create, assign, and track everything that needs to get done. Tasks can be one-time or recurring, and you can add checklists to each one.
        </p>
      </div>
    ),
  },
  {
    selector: '[data-tour="nav-money"]',
    content: (
      <div className="space-y-2">
        <h3 className="font-semibold text-base text-foreground">Track spending</h3>
        <p className="text-sm text-muted-foreground">
          Log expenses, send invoices, and keep a clear record of all household spending. Your clients can approve purchases right from the app.
        </p>
      </div>
    ),
  },
  {
    selector: '[data-tour="nav-house"]',
    content: (
      <div className="space-y-2">
        <h3 className="font-semibold text-base text-foreground">Everything about the home</h3>
        <p className="text-sm text-muted-foreground">
          People, preferences, important dates, access codes, and locations — everything you need to know about the household in one place.
        </p>
      </div>
    ),
  },
];

const staffSteps: StepType[] = [
  {
    selector: '[data-tour="nav-today"]',
    content: (
      <div className="space-y-2">
        <h3 className="font-semibold text-base text-foreground">This is your home base</h3>
        <p className="text-sm text-muted-foreground">
          See your schedule for the day — assigned jobs, notes from the team, and what's coming up next.
        </p>
      </div>
    ),
  },
  {
    selector: '[data-tour="nav-jobs"]',
    content: (
      <div className="space-y-2">
        <h3 className="font-semibold text-base text-foreground">Your assigned jobs</h3>
        <p className="text-sm text-muted-foreground">
          View and complete the jobs assigned to you. Check off items as you go and leave notes for the team.
        </p>
      </div>
    ),
  },
  {
    selector: '[data-tour="nav-updates"]',
    content: (
      <div className="space-y-2">
        <h3 className="font-semibold text-base text-foreground">Post updates</h3>
        <p className="text-sm text-muted-foreground">
          Share progress photos, notes, and completion updates with the household and your team lead.
        </p>
      </div>
    ),
  },
  {
    selector: '[data-tour="nav-more"]',
    content: (
      <div className="space-y-2">
        <h3 className="font-semibold text-base text-foreground">More options</h3>
        <p className="text-sm text-muted-foreground">
          Access your profile, settings, and additional features from here.
        </p>
      </div>
    ),
  },
];

function getStepsForRole(role: string, serviceType?: string): StepType[] {
  switch (role) {
    case "ASSISTANT":
      return assistantSteps;
    case "STAFF":
      return staffSteps;
    case "CLIENT":
      return serviceType === "CLEANING" ? cleaningClientSteps : clientSteps;
    default:
      return clientSteps;
  }
}

export function OnboardingTourProvider({ children }: { children: React.ReactNode }) {
  const { userProfile, activeRole } = useUser();
  const { activeServiceType } = useActiveServiceType();
  const hasMarkedComplete = useRef(false);

  const completeTourMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/user-profile/tour", { completed: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-profile"] });
    },
  });

  const steps = useMemo(
    () => getStepsForRole(activeRole, activeServiceType),
    [activeRole, activeServiceType]
  );

  const shouldShowTour = userProfile && !userProfile.tourCompleted;

  const markComplete = useCallback(() => {
    if (!hasMarkedComplete.current) {
      hasMarkedComplete.current = true;
      completeTourMutation.mutate();
    }
  }, [completeTourMutation]);

  useEffect(() => {
    hasMarkedComplete.current = false;
  }, [userProfile?.tourCompleted]);

  if (!userProfile) {
    return <>{children}</>;
  }

  return (
    <TourProvider
      steps={steps}
      defaultOpen={shouldShowTour ?? false}
      onClickClose={({ setIsOpen }: { setIsOpen: (v: boolean) => void }) => {
        setIsOpen(false);
        markComplete();
      }}
      onClickMask={({ setIsOpen }: { setIsOpen: (v: boolean) => void }) => {
        setIsOpen(false);
        markComplete();
      }}
      afterOpen={() => {
        document.body.style.overflow = "hidden";
      }}
      beforeClose={() => {
        document.body.style.overflow = "";
        markComplete();
      }}
      styles={{
        popover: (base: any) => ({
          ...base,
          borderRadius: "16px",
          padding: "20px 24px",
          boxShadow: "0 20px 60px rgba(29, 42, 68, 0.15), 0 4px 16px rgba(29, 42, 68, 0.08)",
          maxWidth: "320px",
          border: "1px solid hsl(var(--border))",
          backgroundColor: "hsl(var(--background))",
        }),
        maskArea: (base: any) => ({
          ...base,
          rx: 12,
        }),
        badge: (base: any) => ({
          ...base,
          backgroundColor: "hsl(var(--primary))",
          color: "hsl(var(--primary-foreground))",
          fontFamily: "Inter, sans-serif",
          fontWeight: 600,
          borderRadius: "8px",
          padding: "2px 8px",
        }),
        controls: (base: any) => ({
          ...base,
          marginTop: "16px",
        }),
        dot: (base: any, { current }: { current: boolean }) => ({
          ...base,
          backgroundColor: current ? "hsl(var(--primary))" : "hsl(var(--muted))",
          border: "none",
          width: "8px",
          height: "8px",
        }),
        close: (base: any) => ({
          ...base,
          color: "hsl(var(--muted-foreground))",
          width: "12px",
          height: "12px",
          top: "14px",
          right: "14px",
        }),
      }}
      padding={{ mask: 8, popover: [12, 8] }}
      showDots={true}
      showBadge={true}
      showNavigation={true}
      showCloseButton={true}
      disableInteraction={true}
    >
      {children}
    </TourProvider>
  );
}

export function useOnboardingTour() {
  return useTour();
}
