import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/lib/user-context";
import { useActiveServiceType } from "./use-active-service-type";
import { withServiceType } from "@/lib/serviceUrl";

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
  const { activeServiceType } = useActiveServiceType();
  
  const url = withServiceType("/api/invoices/pending", activeServiceType);

  return useQuery<PendingInvoicesData>({
    queryKey: [url],
    enabled: activeRole === "CLIENT",
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
  });
}
