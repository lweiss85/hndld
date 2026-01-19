import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  MessageSquarePlus, 
  CheckCircle2, 
  Calendar,
  Bell,
  ChevronRight,
  Clock,
  Sparkles,
  Camera,
  CreditCard,
  CalendarDays,
  Heart
} from "lucide-react";
import { format, isToday, isTomorrow, isThisWeek, formatDistanceToNow } from "date-fns";
import type { Task, Approval, CalendarEvent, Update, SpendingItem } from "@shared/schema";
import { Link } from "wouter";
import { 
  LuxuryCard, 
  SectionHeader, 
  ItemRow,
  SkeletonCard,
  SkeletonRow,
  EmptyState
} from "@/components/premium";
import { CalendarIllustration, CheckmarkIllustration } from "@/components/illustrations";
import { StaggeredList, PageTransition, triggerHaptic } from "@/components/juice";
import { AIWeeklyBrief } from "@/components/ai-weekly-brief";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { PullToRefreshIndicator } from "@/components/pull-to-refresh";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useActiveServiceType } from "@/hooks/use-active-service-type";
import { withServiceType } from "@/lib/serviceUrl";
import { PayNowSheet } from "@/components/pay-now-sheet";

interface ImpactMetrics {
  minutesReturnedWeek: number;
  minutesReturnedMonth: number;
  minutesReturnedAllTime: number;
  hoursReturnedWeek: number;
  hoursReturnedMonth: number;
  hoursReturnedAllTime: number;
  formattedWeek: string;
  formattedMonth: string;
  formattedAllTime: string;
}

interface DashboardData {
  tasks: Task[];
  approvals: Approval[];
  events: CalendarEvent[];
  spending: { amount: number; date?: Date | string; createdAt?: Date | string }[];
  impact?: ImpactMetrics;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatEventTime(date: Date | string): string {
  const d = new Date(date);
  if (isToday(d)) return `Today, ${format(d, "h:mm a")}`;
  if (isTomorrow(d)) return `Tomorrow, ${format(d, "h:mm a")}`;
  return format(d, "EEE, MMM d, h:mm a");
}

function useCountUp(target: number, duration: number = 1000) {
  const [count, setCount] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const targetRef = useRef(target);

  useEffect(() => {
    targetRef.current = target;
    
    if (target === 0) {
      setCount(0);
      return;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    startTimeRef.current = null;
    
    const animate = (timestamp: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      
      const easeOutQuad = 1 - (1 - progress) * (1 - progress);
      setCount(Math.floor(easeOutQuad * targetRef.current));

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [target, duration]);

  return count;
}

function TimeReturnedCard({ impact }: { impact: ImpactMetrics }) {
  const { toast } = useToast();
  const weekMinutes = useCountUp(impact.minutesReturnedWeek, 800);
  const monthMinutes = useCountUp(impact.minutesReturnedMonth, 1000);
  const allTimeMinutes = useCountUp(impact.minutesReturnedAllTime, 1200);

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    return `${hours}h ${mins}m`;
  };

  const workdays = Math.round((impact.minutesReturnedAllTime / 60) / 8 * 10) / 10;

  useEffect(() => {
    const allTimeHours = Math.floor(impact.minutesReturnedAllTime / 60);
    const lastMilestone = parseInt(localStorage.getItem("hndld_time_milestone") || "0");
    
    const milestones = [10, 25, 50, 100, 250, 500];
    const newMilestone = milestones.find(m => allTimeHours >= m && m > lastMilestone);
    
    if (newMilestone) {
      localStorage.setItem("hndld_time_milestone", String(newMilestone));
      setTimeout(() => {
        toast({
          title: "Milestone reached",
          description: `You've saved ${newMilestone}+ hours with hndld`,
        });
      }, 1500);
    }
  }, [impact.minutesReturnedAllTime, toast]);

  return (
    <LuxuryCard className="relative overflow-visible">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-foreground">Time Returned</h3>
        <Badge variant="secondary" className="text-[10px] ml-auto">
          <Sparkles className="w-3 h-3 mr-1" />
          White Glove Impact
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-foreground tabular-nums" data-testid="text-time-week">
            {formatTime(weekMinutes)}
          </p>
          <p className="text-xs text-muted-foreground">This week</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-foreground tabular-nums" data-testid="text-time-month">
            {formatTime(monthMinutes)}
          </p>
          <p className="text-xs text-muted-foreground">This month</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-foreground tabular-nums" data-testid="text-time-total">
            {Math.floor(allTimeMinutes / 60)}h
          </p>
          <p className="text-xs text-muted-foreground">All time</p>
        </div>
      </div>

      {workdays >= 0.5 && (
        <p className="text-xs text-muted-foreground text-center mt-3 pt-3 border-t border-border/50">
          That's ~{workdays} workday{workdays !== 1 ? 's' : ''} back in your life
        </p>
      )}
    </LuxuryCard>
  );
}

function WeeklyBriefSkeleton() {
  return (
    <div className="px-5 py-6 space-y-6 max-w-4xl mx-auto">
      <div className="space-y-2">
        <div className="h-7 w-48 bg-muted rounded skeleton-shimmer" />
        <div className="h-4 w-32 bg-muted rounded skeleton-shimmer" />
      </div>
      <SkeletonCard className="h-40" lines={2} />
      <div className="flex gap-3 overflow-x-auto pb-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-11 w-28 bg-muted rounded-xl shrink-0 skeleton-shimmer" />
        ))}
      </div>
      <SkeletonCard lines={3} />
      <SkeletonCard lines={3} />
    </div>
  );
}

function CleaningOverview() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { activeServiceType } = useActiveServiceType();
  const [showTipSheet, setShowTipSheet] = useState(false);
  const [tipSpendingId, setTipSpendingId] = useState<string | null>(null);

  const tasksUrl = withServiceType("/api/tasks", "CLEANING");
  const approvalsUrl = withServiceType("/api/approvals", "CLEANING");
  const updatesUrl = withServiceType("/api/updates", "CLEANING");
  const spendingUrl = withServiceType("/api/spending", "CLEANING");

  const { data: tasks, isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: [tasksUrl],
  });

  const { data: approvals } = useQuery<Approval[]>({
    queryKey: [approvalsUrl],
  });

  const { data: updates } = useQuery<Update[]>({
    queryKey: [updatesUrl],
  });

  const { data: spending } = useQuery<SpendingItem[]>({
    queryKey: [spendingUrl],
  });

  const createTipMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/spending", {
        title: "Tip for Cleaner",
        description: "Thank you tip",
        amountCents: 0,
        category: "TIP",
        serviceType: "CLEANING",
        status: "DRAFT",
      });
      return res.json();
    },
    onSuccess: (data) => {
      setTipSpendingId(data.id);
      setShowTipSheet(true);
      queryClient.invalidateQueries({ queryKey: [spendingUrl] });
    },
    onError: () => {
      toast({ title: "Could not start tip", variant: "destructive" });
    },
  });

  const { isRefreshing, pullDistance, threshold, progress } = usePullToRefresh({
    onRefresh: async () => {
      triggerHaptic("medium");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [tasksUrl] }),
        queryClient.invalidateQueries({ queryKey: [approvalsUrl] }),
        queryClient.invalidateQueries({ queryKey: [updatesUrl] }),
        queryClient.invalidateQueries({ queryKey: [spendingUrl] }),
      ]);
    },
  });

  if (tasksLoading) return <WeeklyBriefSkeleton />;

  const nextVisit = tasks
    ?.filter(t => t.status !== "DONE" && t.status !== "CANCELLED")
    .sort((a, b) => {
      if (!a.dueAt && !b.dueAt) return 0;
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    })[0];

  const pendingAddons = approvals?.filter(a => a.status === "PENDING") || [];
  const recentPhotos = updates?.filter(u => u.images && u.images.length > 0).slice(0, 3) || [];
  const pendingPayments = spending?.filter(s => 
    s.status === "NEEDS_APPROVAL" || s.status === "APPROVED"
  ) || [];

  const firstName = user?.firstName || "there";

  return (
    <PageTransition className="relative">
      <PullToRefreshIndicator
        pullDistance={pullDistance}
        threshold={threshold}
        isRefreshing={isRefreshing}
        progress={progress}
      />
      <div className="px-5 py-6 space-y-6 max-w-4xl mx-auto pb-24">
        <header className="space-y-1 animate-fade-in-up">
          <h1 className="text-2xl font-semibold text-foreground" data-testid="text-greeting">
            {getGreeting()}, {firstName}.
          </h1>
          <p className="text-xs text-muted-foreground">Your cleaning service overview</p>
        </header>

        <section>
          <SectionHeader title="Next Visit" action={nextVisit ? { label: "All visits", href: "/tasks" } : undefined} />
          <LuxuryCard>
            {nextVisit ? (
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <CalendarDays className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-foreground">{nextVisit.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {nextVisit.dueAt ? format(new Date(nextVisit.dueAt), "EEEE, MMM d 'at' h:mm a") : "Not scheduled"}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </div>
            ) : (
              <EmptyState
                illustration={<CalendarIllustration className="w-full h-full" />}
                title="No upcoming visits"
                description="You're all set for now"
              />
            )}
          </LuxuryCard>
        </section>

        {pendingAddons.length > 0 && (
          <section>
            <SectionHeader title="Pending Add-ons" action={{ label: "View all", href: "/approvals" }} />
            <LuxuryCard>
              <StaggeredList>
                {pendingAddons.slice(0, 3).map((addon) => (
                  <ItemRow
                    key={addon.id}
                    title={addon.title}
                    meta={addon.amountCents ? `$${(addon.amountCents / 100).toFixed(2)}` : undefined}
                    urgency="MEDIUM"
                  />
                ))}
              </StaggeredList>
            </LuxuryCard>
          </section>
        )}

        {recentPhotos.length > 0 && (
          <section>
            <SectionHeader title="Photos & Notes" action={{ label: "View all", href: "/updates" }} />
            <LuxuryCard>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {recentPhotos.slice(0, 3).map((update) => (
                  <div key={update.id} className="aspect-square rounded-lg overflow-hidden bg-muted">
                    {update.images?.[0] && (
                      <img 
                        src={update.images[0]} 
                        alt="Cleaning update" 
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                ))}
              </div>
              <Link href="/updates">
                <Button variant="ghost" size="sm" className="w-full">
                  <Camera className="w-4 h-4 mr-2" />
                  See all photos
                </Button>
              </Link>
            </LuxuryCard>
          </section>
        )}

        <section>
          <SectionHeader title="Pay & Tip" action={pendingPayments.length > 0 ? { label: "View all", href: "/pay" } : undefined} />
          <LuxuryCard>
            {pendingPayments.length > 0 ? (
              <div className="space-y-3">
                {pendingPayments.slice(0, 2).map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                    <div>
                      <p className="font-medium text-sm">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.status}</p>
                    </div>
                    <p className="font-semibold">${((item.amountCents || 0) / 100).toFixed(2)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-2">No pending payments</p>
            )}
            <Button 
              variant="outline" 
              className="w-full mt-4 gap-2"
              onClick={() => createTipMutation.mutate()}
              disabled={createTipMutation.isPending}
            >
              <Heart className="w-4 h-4" />
              Tip your cleaner
            </Button>
          </LuxuryCard>
        </section>
      </div>

      {tipSpendingId && (
        <PayNowSheet
          open={showTipSheet}
          onOpenChange={setShowTipSheet}
          spendingId={tipSpendingId}
          vendorName="Tip for Cleaner"
        />
      )}
    </PageTransition>
  );
}

export default function ThisWeek() {
  const { user } = useAuth();
  const { activeServiceType } = useActiveServiceType();

  if (activeServiceType === "CLEANING") {
    return <CleaningOverview />;
  }

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
  });

  const { data: updates } = useQuery<Update[]>({
    queryKey: ["/api/updates"],
  });

  const { isRefreshing, pullDistance, threshold, progress } = usePullToRefresh({
    onRefresh: async () => {
      triggerHaptic("medium");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/updates"] }),
      ]);
    },
  });

  if (isLoading) return <WeeklyBriefSkeleton />;

  const pendingApprovals = data?.approvals.filter(a => a.status === "PENDING") || [];
  const priorityTasks = data?.tasks
    .filter(t => t.status !== "DONE" && (t.urgency === "HIGH" || t.urgency === "MEDIUM"))
    .slice(0, 3) || [];
  const upcomingEvents = data?.events
    .filter(e => isThisWeek(new Date(e.startAt)))
    .slice(0, 3) || [];
  const recentUpdates = updates?.slice(0, 3) || [];
  
  const todayEvents = data?.events.filter(e => isToday(new Date(e.startAt))).length || 0;

  const firstName = user?.firstName || "there";

  return (
    <PageTransition className="relative">
      <PullToRefreshIndicator
        pullDistance={pullDistance}
        threshold={threshold}
        isRefreshing={isRefreshing}
        progress={progress}
      />
    <div className="px-5 py-6 space-y-6 max-w-4xl mx-auto pb-24">
      <header className="space-y-1 animate-fade-in-up">
        <h1 className="text-2xl font-semibold text-foreground" data-testid="text-greeting">
          {getGreeting()}, {firstName}.
        </h1>
        <p className="text-xs text-muted-foreground">
          Last updated {formatDistanceToNow(new Date(), { addSuffix: true })}
        </p>
      </header>

      <LuxuryCard>
        <h2 className="text-xl font-semibold text-foreground mb-1">
          This week is handled.
        </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {priorityTasks.length} priorities 
            {todayEvents > 0 && ` • ${todayEvents} today`}
            {pendingApprovals.length > 0 && ` • ${pendingApprovals.length} waiting`}
          </p>
          
        <div className="flex flex-wrap gap-3">
          <Button asChild className="rounded-xl">
            <Link href="/requests" data-testid="button-request-hero">
              <MessageSquarePlus className="w-4 h-4 mr-2" />
              Request
            </Link>
          </Button>
          {pendingApprovals.length > 0 && (
            <Button variant="outline" asChild className="rounded-xl">
              <Link href="/approvals" data-testid="button-approvals-hero">
                <Bell className="w-4 h-4 mr-2" />
                Approvals ({pendingApprovals.length})
              </Link>
            </Button>
          )}
        </div>
      </LuxuryCard>

      {data?.impact && data.impact.minutesReturnedAllTime > 0 && (
        <TimeReturnedCard impact={data.impact} />
      )}

      <AIWeeklyBrief />

      <section>
        <SectionHeader 
          title="Top Priorities" 
          action={priorityTasks.length > 0 ? { label: "View all", href: "/tasks" } : undefined}
        />
        <LuxuryCard>
          {priorityTasks.length === 0 ? (
            <EmptyState
              illustration={<CheckmarkIllustration className="w-full h-full" />}
              title="Nothing urgent today."
              description="You're in a good spot."
            />
          ) : (
            <StaggeredList>
              {priorityTasks.map((task) => (
                <ItemRow
                  key={task.id}
                  title={task.title}
                  meta={task.dueAt ? format(new Date(task.dueAt), "EEE, h:mm a") : undefined}
                  urgency={task.urgency as "HIGH" | "MEDIUM" | "LOW"}
                />
              ))}
            </StaggeredList>
          )}
        </LuxuryCard>
      </section>

      <section>
        <SectionHeader 
          title="Key Events" 
          action={upcomingEvents.length > 0 ? { label: "View all", href: "/calendar" } : undefined}
        />
        <LuxuryCard>
          {upcomingEvents.length === 0 ? (
            <EmptyState
              illustration={<CalendarIllustration className="w-full h-full" />}
              title="No events this week."
              description="Enjoy the calm."
            />
          ) : (
            <StaggeredList>
              {upcomingEvents.map((event) => (
                <ItemRow
                  key={event.id}
                  title={event.title}
                  meta={formatEventTime(event.startAt)}
                  location={event.location || undefined}
                />
              ))}
            </StaggeredList>
          )}
        </LuxuryCard>
      </section>

      {recentUpdates.length > 0 && (
        <section>
          <SectionHeader 
            title="Handled for You" 
            action={{ label: "View all", href: "/updates" }}
          />
          <LuxuryCard>
            <StaggeredList>
              {recentUpdates.map((update) => (
                <div 
                  key={update.id} 
                  className="flex items-center gap-3 py-2.5 border-b border-border/50 last:border-0"
                  data-testid={`update-row-${update.id}`}
                >
                  <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                  <p className="text-sm text-foreground truncate flex-1">{update.text}</p>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </div>
              ))}
            </StaggeredList>
          </LuxuryCard>
        </section>
      )}
    </div>
    </PageTransition>
  );
}
