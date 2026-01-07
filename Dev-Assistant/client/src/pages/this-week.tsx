import { useQuery } from "@tanstack/react-query";
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
  Sparkles
} from "lucide-react";
import { format, isToday, isTomorrow, isThisWeek, formatDistanceToNow } from "date-fns";
import type { Task, Approval, CalendarEvent, Update } from "@shared/schema";
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
import { StaggeredList, PageTransition } from "@/components/juice";
import { AIWeeklyBrief } from "@/components/ai-weekly-brief";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

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

export default function ThisWeek() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
  });

  const { data: updates } = useQuery<Update[]>({
    queryKey: ["/api/updates"],
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
    <PageTransition>
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
