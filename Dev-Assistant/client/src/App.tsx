import { Switch, Route, useLocation, Redirect } from "wouter";
import { lazy, Suspense } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { UndoToastContainer } from "@/components/premium/toast-undo";
import { UserProvider, useUser } from "@/lib/user-context";
import { VaultProvider } from "@/lib/vault-context";
import { WebSocketProvider } from "@/lib/websocket-context";
import { ConnectionStatus } from "@/components/connection-status";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/layout/app-layout";
import { Skeleton } from "@/components/ui/skeleton";

import Landing from "@/pages/landing";
import ThisWeek from "@/pages/this-week";
import Approvals from "@/pages/approvals";
import Requests from "@/pages/requests";
import Updates from "@/pages/updates";
import Today from "@/pages/today";
import Tasks from "@/pages/tasks";
import NotFound from "@/pages/not-found";

const Calendar = lazy(() => import("@/pages/calendar"));
const House = lazy(() => import("@/pages/house"));
const Vendors = lazy(() => import("@/pages/vendors"));
const Spending = lazy(() => import("@/pages/spending"));
const Onboarding = lazy(() => import("@/pages/onboarding"));
const HouseholdProfile = lazy(() => import("@/pages/household-profile"));
const Playbooks = lazy(() => import("@/pages/playbooks"));
const Organizations = lazy(() => import("@/pages/organizations"));
const RoleSelection = lazy(() => import("@/pages/role-selection"));
const Terms = lazy(() => import("@/pages/terms"));
const Privacy = lazy(() => import("@/pages/privacy"));
const Billing = lazy(() => import("@/pages/billing"));
const Join = lazy(() => import("@/pages/join"));
const Analytics = lazy(() => import("@/pages/analytics"));
const Emergency = lazy(() => import("@/pages/emergency"));
const Messages = lazy(() => import("@/pages/messages"));
const Files = lazy(() => import("@/pages/files"));
const PaymentProfile = lazy(() => import("@/pages/payment-profile"));

function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4">
      <Skeleton className="h-10 w-32" />
      <Skeleton className="h-4 w-48" />
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="min-h-screen p-4 space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-32" />
      <div className="space-y-3 mt-6">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    </div>
  );
}

function ClientRouter() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Switch>
        <Route path="/" component={ThisWeek} />
        <Route path="/tasks" component={Tasks} />
        <Route path="/calendar" component={Calendar} />
        <Route path="/approvals" component={Approvals} />
        <Route path="/requests" component={Requests} />
        <Route path="/updates" component={Updates} />
        <Route path="/house" component={House} />
        <Route path="/vendors" component={Vendors} />
        <Route path="/spending" component={Spending} />
        <Route path="/playbooks" component={Playbooks} />
        <Route path="/messages" component={Messages} />
        <Route path="/files" component={Files} />
        <Route path="/emergency" component={Emergency} />
        <Route path="/onboarding" component={Onboarding} />
        <Route path="/profile" component={HouseholdProfile} />
        <Route path="/payment-profile" component={PaymentProfile} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function AssistantRouter() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Switch>
        <Route path="/" component={Today} />
        <Route path="/tasks" component={Tasks} />
        <Route path="/calendar" component={Calendar} />
        <Route path="/house" component={House} />
        <Route path="/vendors" component={Vendors} />
        <Route path="/spending" component={Spending} />
        <Route path="/approvals" component={Approvals} />
        <Route path="/updates" component={Updates} />
        <Route path="/requests" component={Requests} />
        <Route path="/onboarding" component={Onboarding} />
        <Route path="/profile" component={HouseholdProfile} />
        <Route path="/playbooks" component={Playbooks} />
        <Route path="/organizations" component={Organizations} />
        <Route path="/billing" component={Billing} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/emergency" component={Emergency} />
        <Route path="/messages" component={Messages} />
        <Route path="/files" component={Files} />
        <Route path="/payment-profile" component={PaymentProfile} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

interface OnboardingStatus {
  phase1Complete: boolean;
  phase2Complete: boolean;
  phase3Complete: boolean;
}

function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: onboardingStatus, isLoading } = useQuery<OnboardingStatus>({
    queryKey: ["/api/onboarding/status"],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Skeleton className="h-8 w-32" />
      </div>
    );
  }

  if (onboardingStatus && !onboardingStatus.phase1Complete && location !== "/onboarding") {
    return <Redirect to="/onboarding" />;
  }

  return <>{children}</>;
}

function AuthenticatedApp() {
  const { activeRole, needsRoleSelection, isLoading } = useUser();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (needsRoleSelection) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <RoleSelection />
      </Suspense>
    );
  }

  if (activeRole === "ASSISTANT") {
    return (
      <AppLayout>
        <AssistantRouter />
      </AppLayout>
    );
  }

  return (
    <OnboardingGuard>
      <AppLayout>
        <ClientRouter />
      </AppLayout>
    </OnboardingGuard>
  );
}

function AppContent() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Landing />;
  }

  return (
    <UserProvider>
      <VaultProvider>
        <WebSocketProvider>
          <AuthenticatedApp />
          <ConnectionStatus />
        </WebSocketProvider>
      </VaultProvider>
    </UserProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <UndoToastContainer />
          <Suspense fallback={<LoadingScreen />}>
            <Switch>
              <Route path="/terms" component={Terms} />
              <Route path="/privacy" component={Privacy} />
              <Route path="/join/:token" component={Join} />
              <Route>
                <AppContent />
              </Route>
            </Switch>
          </Suspense>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
