import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/lib/user-context";

interface PendingInvoicesData {
  count: number;
  totalAmount: number;
  latestInvoiceId: string | null;
  latestInvoiceTitle: string | null;
  latestInvoiceNumber: string | null;
  latestDueDate: string | null;
}

export function usePendingInvoices() {
  const { activeRole } = useUser();

  return useQuery<PendingInvoicesData>({
    queryKey: ["/api/invoices/pending"],
    enabled: activeRole === "CLIENT",
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
  });
}
