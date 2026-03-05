import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import type { Approval, Task, SpendingItem } from "@shared/schema";

export function useAllHandled(enabled = true) {
  const { data: approvals, isLoading: approvalsLoading } = useQuery<Approval[]>({
    queryKey: ["/api/approvals"],
    enabled,
  });

  const { data: dashboard, isLoading: dashboardLoading } = useQuery<{ tasks: Task[] }>({
    queryKey: ["/api/dashboard"],
    enabled,
  });

  const { data: spending, isLoading: spendingLoading } = useQuery<SpendingItem[]>({
    queryKey: ["/api/spending"],
    enabled,
  });

  const isLoading = approvalsLoading || dashboardLoading || spendingLoading;

  const hasPendingApprovals = approvals?.some((a) => a.status === "PENDING") ?? false;

  const now = Date.now();
  const hasOverdueTasks =
    dashboard?.tasks?.some(
      (t) =>
        (t.status === "PLANNED" || t.status === "IN_PROGRESS") &&
        t.dueAt &&
        new Date(t.dueAt).getTime() < now
    ) ?? false;

  const hasPendingInvoices =
    spending?.some(
      (s) => s.status === "NEEDS_APPROVAL" || s.status === "APPROVED"
    ) ?? false;

  const rawAllHandled =
    enabled && !isLoading && !hasPendingApprovals && !hasOverdueTasks && !hasPendingInvoices;

  const [allHandled, setAllHandled] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (rawAllHandled) {
      timerRef.current = setTimeout(() => setAllHandled(true), 1000);
    } else {
      setAllHandled(false);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [rawAllHandled]);

  return { allHandled };
}
