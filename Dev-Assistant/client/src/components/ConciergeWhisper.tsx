import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { isToday, differenceInMinutes, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";

interface DashboardData {
  tasks: Array<{ title: string; status: string; dueAt: string | null; urgency: string }>;
  approvals: Array<{ title: string; status: string; amount: number | null }>;
  events: Array<{ title: string; startAt: string }>;
  spending: Array<{ amount: number; date?: string; createdAt?: string }>;
}

function computeWhisper(data: DashboardData): string {
  const now = new Date();
  const hour = now.getHours();

  const inProgressToday = data.tasks.find(
    (t) => t.status === "IN_PROGRESS" && t.dueAt && isToday(new Date(t.dueAt))
  );
  if (inProgressToday) {
    return `Your ${inProgressToday.title} is underway right now.`;
  }

  const pendingApproval = data.approvals.find(
    (a) => a.status === "PENDING" && a.amount && a.amount > 0
  );
  if (pendingApproval) {
    return `One item needs your approval — ${pendingApproval.title}.`;
  }

  const soonEvent = data.events.find((e) => {
    const minsUntil = differenceInMinutes(new Date(e.startAt), now);
    return minsUntil >= 0 && minsUntil < 180;
  });
  if (soonEvent) {
    const minsUntil = differenceInMinutes(new Date(soonEvent.startAt), now);
    if (minsUntil < 15) {
      return `${soonEvent.title} is starting now.`;
    }
    if (minsUntil < 60) {
      return `${soonEvent.title} starts in ${minsUntil} minutes.`;
    }
    const hours = Math.ceil(minsUntil / 60);
    return `${soonEvent.title} starts in about ${hours} hour${hours === 1 ? "" : "s"}.`;
  }

  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const weeklySpending = data.spending.reduce((sum, s) => {
    const d = new Date(s.date || s.createdAt || 0);
    if (isWithinInterval(d, { start: weekStart, end: weekEnd })) {
      return sum + s.amount;
    }
    return sum;
  }, 0);
  if (weeklySpending > 50000) {
    return `You've spent $${(weeklySpending / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} this week.`;
  }

  const hasOverdue = data.tasks.some(
    (t) => t.status !== "DONE" && t.dueAt && new Date(t.dueAt) < now && !isToday(new Date(t.dueAt))
  );
  const hasPending = data.approvals.some((a) => a.status === "PENDING");

  if (hasOverdue || hasPending) {
    return "Good to see you.";
  }

  const hasDueToday = data.tasks.some((t) => t.dueAt && isToday(new Date(t.dueAt)) && t.status !== "DONE");
  if (hour < 9 && !hasDueToday) {
    return "Clear morning. Nothing urgent today.";
  }

  return "Your home is in order.";
}

export function ConciergeWhisper() {
  const { data } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
  });

  if (!data) return null;

  const message = computeWhisper(data);

  return (
    <motion.p
      aria-live="polite"
      role="status"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="font-display italic text-muted-foreground"
      style={{ fontSize: "17px" }}
    >
      {message}
    </motion.p>
  );
}
