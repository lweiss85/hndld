import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ArrowLeft,
  DollarSign,
  Clock,
  CheckCircle,
  AlertCircle,
  Settings,
  ExternalLink,
} from "lucide-react";
import { SiVenmo } from "react-icons/si";
import { Link } from "wouter";
import { useUser } from "@/lib/user-context";
import { formatDistanceToNow } from "date-fns";

interface SpendingItem {
  id: string;
  amount: number;
  tipAmount: number | null;
  category: string;
  vendor: string | null;
  status: string;
  createdAt: string;
  paidAt: string | null;
  paymentMethodUsed: string | null;
  title: string | null;
  kind: string | null;
}

interface PaymentProfile {
  venmoUsername: string | null;
  zelleRecipient: string | null;
  cashAppCashtag: string | null;
  paypalMeHandle: string | null;
  defaultPaymentMethod: string;
  payNoteTemplate: string;
}

function GetPaidSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function getStatusBadge(status: string) {
  switch (status) {
    case "NEEDS_APPROVAL":
      return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" /> Awaiting Payment</Badge>;
    case "APPROVED":
      return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" /> Approved</Badge>;
    case "PAYMENT_SENT":
      return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100"><CheckCircle className="w-3 h-3 mr-1" /> Payment Sent</Badge>;
    case "RECONCILED":
      return <Badge className="bg-green-100 text-green-700 hover:bg-green-100"><CheckCircle className="w-3 h-3 mr-1" /> Reconciled</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getPaymentMethodLabel(method: string | null) {
  switch (method) {
    case "VENMO": return "Venmo";
    case "ZELLE": return "Zelle";
    case "CASHAPP": return "Cash App";
    case "PAYPAL": return "PayPal";
    default: return method || "Unknown";
  }
}

export default function GetPaidPage() {
  const { userProfile } = useUser();

  const { data: spending, isLoading: spendingLoading } = useQuery<SpendingItem[]>({
    queryKey: ["/api/spending"],
    enabled: userProfile?.role === "ASSISTANT",
  });

  const { data: payOptions, isLoading: profileLoading } = useQuery<PaymentProfile>({
    queryKey: ["/api/pay-options"],
    enabled: userProfile?.role === "ASSISTANT",
  });

  const isLoading = spendingLoading || profileLoading;

  const pendingPayments = spending?.filter(s => 
    s.status === "NEEDS_APPROVAL" || s.status === "APPROVED"
  ) || [];

  const awaitingReconciliation = spending?.filter(s => 
    s.status === "PAYMENT_SENT"
  ) || [];

  const recentReconciled = spending?.filter(s => 
    s.status === "RECONCILED"
  ).slice(0, 5) || [];

  const totalPending = pendingPayments.reduce((sum, s) => sum + s.amount, 0);
  const totalAwaitingReconciliation = awaitingReconciliation.reduce((sum, s) => sum + s.amount + (s.tipAmount || 0), 0);

  const hasPaymentMethodSet = payOptions && (
    payOptions.venmoUsername || 
    payOptions.zelleRecipient || 
    payOptions.cashAppCashtag || 
    payOptions.paypalMeHandle
  );

  if (!userProfile) {
    return (
      <div className="container max-w-2xl mx-auto p-4">
        <GetPaidSkeleton />
      </div>
    );
  }

  if (userProfile.role !== "ASSISTANT") {
    return (
      <div className="container max-w-2xl mx-auto">
        <div className="flex items-center gap-3 p-4 border-b sticky top-0 bg-background z-10">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold">Get Paid</h1>
          </div>
        </div>
        <div className="p-8 text-center">
          <DollarSign className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="font-medium text-lg mb-2">Assistant Only</h2>
          <p className="text-muted-foreground">
            This page is for assistants to track their reimbursements.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl mx-auto pb-24">
      <div className="flex items-center justify-between gap-3 p-4 border-b sticky top-0 bg-background z-10">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold">Get Paid</h1>
            <p className="text-sm text-muted-foreground">Track your reimbursements</p>
          </div>
        </div>
        <Link href="/payment-profile">
          <Button variant="outline" size="icon">
            <Settings className="w-4 h-4" />
          </Button>
        </Link>
      </div>

      <div className="p-4 space-y-6">
        {isLoading ? (
          <GetPaidSkeleton />
        ) : (
          <>
            {!hasPaymentMethodSet && (
              <Card className="border-amber-200 bg-amber-50">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-amber-800">Set up your payment profile</p>
                      <p className="text-sm text-amber-700 mt-1">
                        Add your Venmo, Zelle, Cash App, or PayPal to receive payments from clients.
                      </p>
                      <Link href="/payment-profile">
                        <Button variant="outline" size="sm" className="mt-3">
                          Set Up Payment Profile
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-2xl font-light">{formatCurrency(totalPending)}</CardTitle>
                <CardDescription>Pending Reimbursements</CardDescription>
              </CardHeader>
              <CardContent>
                {pendingPayments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No pending reimbursements</p>
                ) : (
                  <div className="space-y-3">
                    {pendingPayments.map((item) => (
                      <div key={item.id} className="flex items-center justify-between py-2 border-b last:border-0">
                        <div>
                          <p className="font-medium">{item.title || item.vendor || item.category}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{formatCurrency(item.amount)}</p>
                          {getStatusBadge(item.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-2xl font-light">{formatCurrency(totalAwaitingReconciliation)}</CardTitle>
                <CardDescription>Payments to Confirm</CardDescription>
              </CardHeader>
              <CardContent>
                {awaitingReconciliation.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payments awaiting confirmation</p>
                ) : (
                  <div className="space-y-3">
                    {awaitingReconciliation.map((item) => (
                      <div key={item.id} className="flex items-center justify-between py-2 border-b last:border-0">
                        <div>
                          <p className="font-medium">{item.title || item.vendor || item.category}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.paymentMethodUsed && `via ${getPaymentMethodLabel(item.paymentMethodUsed)}`}
                            {item.paidAt && ` • ${formatDistanceToNow(new Date(item.paidAt), { addSuffix: true })}`}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{formatCurrency(item.amount)}</p>
                          {item.tipAmount && item.tipAmount > 0 && (
                            <p className="text-xs text-green-600">+{formatCurrency(item.tipAmount)} tip</p>
                          )}
                          {getStatusBadge(item.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {recentReconciled.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    Recently Reconciled
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {recentReconciled.map((item) => (
                      <div key={item.id} className="flex items-center justify-between py-2 border-b last:border-0">
                        <div>
                          <p className="font-medium text-muted-foreground">{item.title || item.vendor || item.category}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-muted-foreground">{formatCurrency(item.amount)}</p>
                          {item.tipAmount && item.tipAmount > 0 && (
                            <p className="text-xs text-green-600">+{formatCurrency(item.tipAmount)} tip</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {hasPaymentMethodSet && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5" />
                    Your Payment Links
                  </CardTitle>
                  <CardDescription>
                    Clients will see these options when paying you
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {payOptions?.venmoUsername && (
                    <a 
                      href={`https://venmo.com/${payOptions.venmoUsername}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <SiVenmo className="w-5 h-5 text-blue-500" />
                        <span>@{payOptions.venmoUsername}</span>
                      </div>
                      <ExternalLink className="w-4 h-4 text-muted-foreground" />
                    </a>
                  )}
                  {payOptions?.zelleRecipient && (
                    <div className="flex items-center gap-3 p-3 rounded-lg border">
                      <DollarSign className="w-5 h-5 text-purple-500" />
                      <span>{payOptions.zelleRecipient} (Zelle)</span>
                    </div>
                  )}
                  {payOptions?.cashAppCashtag && (
                    <a 
                      href={`https://cash.app/$${payOptions.cashAppCashtag}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <DollarSign className="w-5 h-5 text-green-500" />
                        <span>${payOptions.cashAppCashtag} (Cash App)</span>
                      </div>
                      <ExternalLink className="w-4 h-4 text-muted-foreground" />
                    </a>
                  )}
                  {payOptions?.paypalMeHandle && (
                    <a 
                      href={`https://paypal.me/${payOptions.paypalMeHandle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <DollarSign className="w-5 h-5 text-blue-600" />
                        <span>paypal.me/{payOptions.paypalMeHandle}</span>
                      </div>
                      <ExternalLink className="w-4 h-4 text-muted-foreground" />
                    </a>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
