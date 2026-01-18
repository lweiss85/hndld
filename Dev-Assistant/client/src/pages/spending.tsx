import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Plus, 
  DollarSign, 
  TrendingUp,
  Receipt,
  CreditCard,
  Check,
  Clock,
  Send,
  CheckCircle2,
  MoreVertical,
  Copy,
  FileText,
  Sparkles,
  Settings
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format, isThisWeek, isThisMonth, subDays } from "date-fns";
import type { SpendingItem, InsertSpendingItem } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/lib/user-context";
import { PayNowSheet } from "@/components/pay-now-sheet";
import { Link } from "wouter";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { PullToRefreshIndicator } from "@/components/pull-to-refresh";
import { PageTransition, triggerHaptic } from "@/components/juice";

const SPENDING_CATEGORIES = [
  "Groceries",
  "Household",
  "Utilities",
  "Maintenance",
  "Services",
  "Kids",
  "Pets",
  "Entertainment",
  "Other",
];

interface PayOptionsResponse {
  venmoUsername: string | null;
  zelleRecipient: string | null;
  defaultPaymentMethod: "VENMO" | "ZELLE";
  payNoteTemplate: string;
}

function SpendingSkeleton() {
  return (
    <div className="px-4 py-6 space-y-4 max-w-4xl mx-auto">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-6 w-64" />
      <Skeleton className="h-32 w-full" />
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-16" />
      ))}
    </div>
  );
}

function ClientSpendingView() {
  const { toast } = useToast();
  const [showPaySheet, setShowPaySheet] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<SpendingItem | null>(null);

  const { data: spending, isLoading } = useQuery<SpendingItem[]>({
    queryKey: ["/api/spending"],
  });

  const { data: payOptions } = useQuery<PayOptionsResponse>({
    queryKey: ["/api/pay-options"],
  });

  const { isRefreshing, pullDistance, threshold, progress } = usePullToRefresh({
    onRefresh: async () => {
      triggerHaptic("medium");
      await queryClient.invalidateQueries({ queryKey: ["/api/spending"] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/spending/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        description: error.message || "Failed to update",
      });
    },
  });

  const openPaySheet = (item: SpendingItem) => {
    setSelectedExpense(item);
    setShowPaySheet(true);
  };

  const approveItem = (item: SpendingItem) => {
    updateStatusMutation.mutate(
      { id: item.id, status: "APPROVED" },
      { 
        onSuccess: () => {
          toast({ description: "Approved." });
          openPaySheet(item);
        }
      }
    );
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ description: "Copied." });
    } catch (e) {
      toast({ variant: "destructive", description: "Failed to copy" });
    }
  };

  if (isLoading) return <SpendingSkeleton />;

  const pullToRefreshProps = { isRefreshing, pullDistance, threshold, progress };

  const waitingItems = spending?.filter(s => 
    s.status === "NEEDS_APPROVAL" || s.status === "APPROVED"
  ).sort((a, b) => {
    const order = { "NEEDS_APPROVAL": 0, "APPROVED": 1 };
    return (order[a.status as keyof typeof order] || 2) - (order[b.status as keyof typeof order] || 2);
  }) || [];

  const paymentSentItems = spending?.filter(s => s.status === "PAYMENT_SENT") || [];

  const sixtyDaysAgo = subDays(new Date(), 60);
  const recentReceipts = spending?.filter(s => 
    s.status === "RECONCILED" && new Date(s.date || s.createdAt!) >= sixtyDaysAgo
  ).slice(0, 10) || [];

  const thisMonthReconciled = spending?.filter(s => 
    s.status === "RECONCILED" && isThisMonth(new Date(s.date || s.createdAt!))
  ) || [];
  const monthlyReimbursed = thisMonthReconciled.reduce((sum, s) => sum + (s.amount || 0), 0);

  const hasPaymentMethod = payOptions?.venmoUsername || payOptions?.zelleRecipient;
  const payToDisplay = [
    payOptions?.venmoUsername ? `@${payOptions.venmoUsername}` : null,
    payOptions?.zelleRecipient ? payOptions.zelleRecipient : null,
  ].filter(Boolean).join(" or ");

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "NEEDS_APPROVAL": return "Approval needed";
      case "APPROVED": return "Ready to pay";
      case "PAYMENT_SENT": return "Marked paid";
      default: return status;
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "NEEDS_APPROVAL": return "bg-warning-muted text-warning-muted-foreground";
      case "APPROVED": return "bg-info-muted text-info-muted-foreground";
      case "PAYMENT_SENT": return "bg-success-muted text-success-muted-foreground";
      default: return "";
    }
  };

  return (
    <PageTransition className="relative">
      <PullToRefreshIndicator {...pullToRefreshProps} />
    <div className="px-4 py-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Money</h1>
        <p className="text-muted-foreground mt-1">Reimbursements and receipts, handled.</p>
      </div>

      {hasPaymentMethod && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Paying to:</span>
          <span className="font-medium text-foreground">{payToDisplay}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => copyToClipboard(payToDisplay, "recipient")}
            data-testid="button-copy-pay-to"
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Waiting on you
        </h2>
        
        {waitingItems.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <Sparkles className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">All set. Nothing needs your attention.</p>
            </CardContent>
          </Card>
        ) : (
          waitingItems.map((item) => (
            <Card key={item.id} data-testid={`card-waiting-${item.id}`}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-lg">
                        ${(item.amount / 100).toFixed(2)}
                      </span>
                      <Badge variant="secondary" className={`text-xs ${getStatusBadgeClass(item.status)}`}>
                        {getStatusLabel(item.status)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {item.vendor || item.category || "Reimbursement"}
                      {" • "}
                      {format(new Date(item.date || item.createdAt!), "MMM d")}
                    </p>
                  </div>
                  
                  <div className="shrink-0">
                    {item.status === "NEEDS_APPROVAL" && (
                      <Button
                        onClick={() => approveItem(item)}
                        disabled={updateStatusMutation.isPending}
                        data-testid={`button-approve-${item.id}`}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                    )}
                    {item.status === "APPROVED" && (
                      <Button
                        onClick={() => openPaySheet(item)}
                        data-testid={`button-pay-${item.id}`}
                      >
                        <CreditCard className="h-4 w-4 mr-1" />
                        Pay now
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {paymentSentItems.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Being reconciled
          </h2>
          
          {paymentSentItems.map((item) => (
            <Card key={item.id} className="bg-muted/30 border-dashed" data-testid={`card-reconciling-${item.id}`}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-lg">
                        ${(item.amount / 100).toFixed(2)}
                      </span>
                      <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        Paid
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {item.vendor || item.category || "Reimbursement"}
                      {" • "}
                      {format(new Date(item.date || item.createdAt!), "MMM d")}
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground italic shrink-0">
                    We're reconciling.
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <Receipt className="h-4 w-4" />
          Recent receipts
        </h2>
        
        {recentReceipts.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">Receipts will appear here as items are reconciled.</p>
            </CardContent>
          </Card>
        ) : (
          recentReceipts.map((item) => (
            <Card key={item.id} data-testid={`card-receipt-${item.id}`}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">${(item.amount / 100).toFixed(2)}</span>
                        {item.category && (
                          <Badge variant="outline" className="text-xs">{item.category}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {item.vendor || "Reimbursement"}
                        {" • "}
                        {format(new Date(item.date || item.createdAt!), "MMM d")}
                      </p>
                    </div>
                  </div>
                  {item.receipts && item.receipts.length > 0 && (
                    <Button variant="outline" size="sm" data-testid={`button-receipt-${item.id}`}>
                      <FileText className="h-4 w-4 mr-1" />
                      Receipt
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {thisMonthReconciled.length > 0 && (
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">This month</p>
            <p className="text-lg font-semibold">
              ${(monthlyReimbursed / 100).toFixed(2)} reimbursed
              <span className="text-muted-foreground font-normal"> • {thisMonthReconciled.length} items</span>
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <CreditCard className="h-4 w-4" />
          Invoice History
        </h2>
        
        {(() => {
          const invoices = spending?.filter(s => s.kind === "INVOICE") || [];
          if (invoices.length === 0) {
            return (
              <Card>
                <CardContent className="p-6 text-center">
                  <CreditCard className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                  <p className="text-muted-foreground text-sm">No invoices yet</p>
                </CardContent>
              </Card>
            );
          }
          return invoices.slice(0, 5).map((invoice) => (
            <Card key={invoice.id} data-testid={`card-invoice-${invoice.id}`}>
              <CardContent className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{invoice.title || `Invoice #${invoice.invoiceNumber}`}</p>
                  <p className="text-sm text-muted-foreground">
                    {invoice.sentAt ? format(new Date(invoice.sentAt), "MMM d, yyyy") : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-semibold">${(invoice.amount / 100).toFixed(2)}</span>
                  <Badge className={getStatusBadgeClass(invoice.status)}>
                    {getStatusLabel(invoice.status)}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ));
        })()}
      </div>

      <PayNowSheet
        open={showPaySheet}
        onOpenChange={setShowPaySheet}
        spendingId={selectedExpense?.id || ""}
        vendorName={selectedExpense?.vendor || undefined}
        onPaymentSent={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/spending"] });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        }}
      />
    </div>
    </PageTransition>
  );
}

interface InvoiceForm {
  title: string;
  amount: number | undefined;
  note: string;
  dueDate: string;
}

function AssistantSpendingView() {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [showPaySheet, setShowPaySheet] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<SpendingItem | null>(null);
  const [newItem, setNewItem] = useState<Partial<InsertSpendingItem>>({
    amount: undefined,
    category: "Other",
    vendor: "",
    note: "",
  });
  const [invoiceForm, setInvoiceForm] = useState<InvoiceForm>({
    title: "",
    amount: undefined,
    note: "",
    dueDate: "",
  });

  const { data: spending, isLoading } = useQuery<SpendingItem[]>({
    queryKey: ["/api/spending"],
  });

  const { data: payOptions } = useQuery<PayOptionsResponse>({
    queryKey: ["/api/pay-options"],
  });

  const { isRefreshing, pullDistance, threshold, progress } = usePullToRefresh({
    onRefresh: async () => {
      triggerHaptic("medium");
      await queryClient.invalidateQueries({ queryKey: ["/api/spending"] });
    },
  });

  const hasPaymentMethod = payOptions?.venmoUsername || payOptions?.zelleRecipient;

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/spending/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        description: error.message || "Failed to update status",
      });
    },
  });

  const createSpendingMutation = useMutation({
    mutationFn: async (data: Partial<InsertSpendingItem>) => {
      return apiRequest("POST", "/api/spending", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      setShowCreateDialog(false);
      setNewItem({
        amount: undefined,
        category: "Other",
        vendor: "",
        note: "",
      });
      toast({ description: "Expense added" });
    },
  });

  const sendInvoiceMutation = useMutation({
    mutationFn: async (data: { title: string; amount: number; note?: string; dueDate?: string }) => {
      return apiRequest("POST", "/api/invoices/send", data);
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/spending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      setShowInvoiceDialog(false);
      setInvoiceForm({ title: "", amount: undefined, note: "", dueDate: "" });
      toast({ 
        description: `Invoice ${result.invoiceNumber} sent to client` 
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        description: error.message || "Failed to send invoice",
      });
    },
  });

  const requestReimbursement = (item: SpendingItem) => {
    updateStatusMutation.mutate(
      { id: item.id, status: "NEEDS_APPROVAL" },
      { onSuccess: () => toast({ description: "Reimbursement requested" }) }
    );
  };

  const markReconciled = (item: SpendingItem) => {
    updateStatusMutation.mutate(
      { id: item.id, status: "RECONCILED" },
      { onSuccess: () => toast({ description: "Marked as reconciled" }) }
    );
  };

  const openPaySheet = (item: SpendingItem) => {
    setSelectedExpense(item);
    setShowPaySheet(true);
  };

  if (isLoading) return <SpendingSkeleton />;

  const weeklyTotal = spending
    ?.filter(s => isThisWeek(new Date(s.date || s.createdAt!)))
    .reduce((sum, s) => sum + (s.amount || 0), 0) || 0;

  const monthlyTotal = spending
    ?.filter(s => isThisMonth(new Date(s.date || s.createdAt!)))
    .reduce((sum, s) => sum + (s.amount || 0), 0) || 0;

  const categoryTotals = spending?.reduce((acc, s) => {
    const cat = s.category || "Other";
    acc[cat] = (acc[cat] || 0) + (s.amount || 0);
    return acc;
  }, {} as Record<string, number>) || {};

  const sortedCategories = Object.entries(categoryTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const pullToRefreshProps = { isRefreshing, pullDistance, threshold, progress };

  return (
    <PageTransition className="relative">
      <PullToRefreshIndicator {...pullToRefreshProps} />
    <div className="px-4 py-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Money</h1>
          <p className="text-muted-foreground mt-1">Track expenses and reimbursements</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/payment-profile">
            <Button variant="ghost" size="icon" data-testid="button-payment-settings">
              <Settings className="h-5 w-5" />
            </Button>
          </Link>
          <Button 
            size="sm" 
            variant="outline"
            onClick={() => setShowInvoiceDialog(true)} 
            data-testid="button-send-invoice"
          >
            <FileText className="h-4 w-4 mr-1" />
            Invoice
          </Button>
          <Button size="sm" onClick={() => setShowCreateDialog(true)} data-testid="button-add-expense">
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>
      </div>

      {!hasPaymentMethod && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-800 shrink-0">
                <CreditCard className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium">Set up payment methods</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Add your Venmo or Zelle so clients can pay you directly from the app.
                </p>
                <Link href="/payment-profile">
                  <Button size="sm" className="mt-3" data-testid="button-setup-payment-cta">
                    Set Up Now
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              This Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold" data-testid="text-weekly-total">
              ${(weeklyTotal / 100).toFixed(2)}
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold" data-testid="text-monthly-total">
              ${(monthlyTotal / 100).toFixed(2)}
            </span>
          </CardContent>
        </Card>
      </div>

      {sortedCategories.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Top Categories
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {sortedCategories.map(([category, amount]) => (
              <div key={category} className="flex items-center justify-between">
                <span className="text-sm font-medium">{category}</span>
                <span className="text-sm text-muted-foreground">
                  ${(amount / 100).toFixed(2)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Recent Expenses
        </h2>
        {spending?.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <Receipt className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No expenses recorded yet</p>
            </CardContent>
          </Card>
        ) : (
          spending?.slice(0, 10).map((item) => {
            const isReconciled = item.status === "RECONCILED";
            const isPaymentSent = item.status === "PAYMENT_SENT";
            const isNeedsReimbursement = item.status === "NEEDS_APPROVAL";
            const isDraft = item.status === "DRAFT";
            
            return (
              <Card key={item.id} data-testid={`card-expense-${item.id}`}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        {isReconciled ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        ) : isPaymentSent ? (
                          <Check className="h-5 w-5 text-blue-500" />
                        ) : isNeedsReimbursement ? (
                          <Clock className="h-5 w-5 text-amber-500" />
                        ) : (
                          <DollarSign className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">
                            ${(item.amount / 100).toFixed(2)}
                          </span>
                          {item.category && (
                            <Badge variant="outline" className="text-xs">
                              {item.category}
                            </Badge>
                          )}
                          {isReconciled && (
                            <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                              Reconciled
                            </Badge>
                          )}
                          {isPaymentSent && (
                            <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                              Payment Sent
                            </Badge>
                          )}
                          {isNeedsReimbursement && (
                            <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                              Awaiting Payment
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {item.vendor || item.note || "No description"}
                          {" • "}
                          {format(new Date(item.date || item.createdAt!), "MMM d")}
                        </p>
                      </div>
                    </div>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`button-expense-menu-${item.id}`}>
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {isDraft && (
                          <DropdownMenuItem 
                            onClick={() => requestReimbursement(item)}
                            data-testid={`menu-request-reimbursement-${item.id}`}
                          >
                            <Send className="h-4 w-4 mr-2" />
                            Request Reimbursement
                          </DropdownMenuItem>
                        )}
                        {(isPaymentSent || isNeedsReimbursement) && (
                          <DropdownMenuItem 
                            onClick={() => markReconciled(item)}
                            data-testid={`menu-mark-reconciled-${item.id}`}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Mark Reconciled
                          </DropdownMenuItem>
                        )}
                        {isNeedsReimbursement && (
                          <DropdownMenuItem 
                            onClick={() => openPaySheet(item)}
                            data-testid={`menu-view-pay-${item.id}`}
                          >
                            <CreditCard className="h-4 w-4 mr-2" />
                            View Pay Options
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Amount</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  className="pl-9"
                  value={newItem.amount ? (newItem.amount / 100).toString() : ""}
                  onChange={(e) => setNewItem({ 
                    ...newItem, 
                    amount: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : undefined 
                  })}
                  data-testid="input-expense-amount"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Category</label>
              <Select
                value={newItem.category || "Other"}
                onValueChange={(value) => setNewItem({ ...newItem, category: value })}
              >
                <SelectTrigger data-testid="select-expense-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SPENDING_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Input
              placeholder="Vendor / Store"
              value={newItem.vendor || ""}
              onChange={(e) => setNewItem({ ...newItem, vendor: e.target.value })}
              data-testid="input-expense-vendor"
            />

            <Input
              placeholder="Note (optional)"
              value={newItem.note || ""}
              onChange={(e) => setNewItem({ ...newItem, note: e.target.value })}
              data-testid="input-expense-note"
            />

            <div>
              <label className="text-sm font-medium mb-1 block">Date</label>
              <Input
                type="date"
                value={newItem.date ? format(new Date(newItem.date), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd")}
                onChange={(e) => setNewItem({ 
                  ...newItem, 
                  date: e.target.value ? new Date(e.target.value) : undefined 
                })}
                data-testid="input-expense-date"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => createSpendingMutation.mutate(newItem)}
              disabled={!newItem.amount || createSpendingMutation.isPending}
              className="w-full"
              data-testid="button-save-expense"
            >
              Add Expense
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showInvoiceDialog} onOpenChange={setShowInvoiceDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Send Invoice
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Invoice Title</label>
              <Input
                placeholder="e.g., January Household Services"
                value={invoiceForm.title}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, title: e.target.value })}
                data-testid="input-invoice-title"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Amount</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  className="pl-9"
                  value={invoiceForm.amount ? (invoiceForm.amount / 100).toString() : ""}
                  onChange={(e) => setInvoiceForm({ 
                    ...invoiceForm, 
                    amount: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : undefined 
                  })}
                  data-testid="input-invoice-amount"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Due Date (optional)</label>
              <Input
                type="date"
                value={invoiceForm.dueDate}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })}
                data-testid="input-invoice-due-date"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Note (optional)</label>
              <Input
                placeholder="Additional details..."
                value={invoiceForm.note}
                onChange={(e) => setInvoiceForm({ ...invoiceForm, note: e.target.value })}
                data-testid="input-invoice-note"
              />
            </div>

            <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md">
              Invoice will be sent immediately and the client will see a "Pay Now" prompt in their app.
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (invoiceForm.title && invoiceForm.amount) {
                  sendInvoiceMutation.mutate({
                    title: invoiceForm.title,
                    amount: invoiceForm.amount,
                    note: invoiceForm.note || undefined,
                    dueDate: invoiceForm.dueDate || undefined,
                  });
                }
              }}
              disabled={!invoiceForm.title || !invoiceForm.amount || sendInvoiceMutation.isPending}
              className="w-full"
              data-testid="button-send-invoice-confirm"
            >
              <Send className="h-4 w-4 mr-2" />
              {sendInvoiceMutation.isPending ? "Sending..." : "Send Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PayNowSheet
        open={showPaySheet}
        onOpenChange={setShowPaySheet}
        spendingId={selectedExpense?.id || ""}
        vendorName={selectedExpense?.vendor || undefined}
        onPaymentSent={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/spending"] });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        }}
      />
    </div>
    </PageTransition>
  );
}

export default function Spending() {
  const { userProfile } = useUser();
  
  if (userProfile?.role === "CLIENT") {
    return <ClientSpendingView />;
  }
  
  return <AssistantSpendingView />;
}
