import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ArrowLeft,
  DollarSign,
  Clock,
  CheckCircle,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { SiVenmo } from "react-icons/si";
import { Link } from "wouter";
import { useUser } from "@/lib/user-context";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SpendingItem {
  id: string;
  amount: number;
  tipAmount: number | null;
  category: string;
  vendor: string | null;
  status: string;
  createdAt: string;
  paidAt: string | null;
  title: string | null;
  kind: string | null;
  invoiceNumber: string | null;
}

interface PayOptions {
  ref: string;
  amount: number;
  note: string;
  venmo: {
    enabled: boolean;
    username: string | null;
    url: string | null;
  };
  zelle: {
    enabled: boolean;
    recipient: string | null;
    note: string;
  };
  cashApp: {
    enabled: boolean;
    cashtag: string | null;
    url: string | null;
  };
  paypal: {
    enabled: boolean;
    handle: string | null;
    url: string | null;
  };
  preferredMethod: string;
  display: {
    payToLine: string;
  };
}

function PaySkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full" />
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

const TIP_PRESETS = [0, 500, 1000, 1500, 2000];

export default function PayPage() {
  const { userProfile } = useUser();
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<SpendingItem | null>(null);
  const [tipAmount, setTipAmount] = useState(0);
  const [customTip, setCustomTip] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("VENMO");

  const { data: spending, isLoading: spendingLoading } = useQuery<SpendingItem[]>({
    queryKey: ["/api/spending"],
    enabled: userProfile?.role === "CLIENT",
  });

  const { data: payOptions, isLoading: payOptionsLoading } = useQuery<PayOptions>({
    queryKey: ["/api/spending", selectedItem?.id, "pay-options"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/spending/${selectedItem?.id}/pay-options`);
      return res.json() as Promise<PayOptions>;
    },
    enabled: !!selectedItem,
  });

  const markPaidMutation = useMutation({
    mutationFn: async ({ id, tipAmount, paymentMethod }: { id: string; tipAmount: number; paymentMethod: string }) => {
      return apiRequest("PATCH", `/api/spending/${id}/status`, {
        status: "PAYMENT_SENT",
        tipAmount,
        paymentMethodUsed: paymentMethod,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spending"] });
      toast({ description: "Payment marked as sent!" });
      setSelectedItem(null);
      setTipAmount(0);
      setCustomTip("");
    },
    onError: (error: any) => {
      toast({ 
        variant: "destructive", 
        description: error.message || "Failed to mark as paid" 
      });
    },
  });

  const pendingItems = spending?.filter(s => 
    s.status === "NEEDS_APPROVAL" || s.status === "APPROVED"
  ) || [];

  const recentlyPaid = spending?.filter(s => 
    s.status === "PAYMENT_SENT" || s.status === "RECONCILED"
  ).slice(0, 5) || [];

  const totalPending = pendingItems.reduce((sum, s) => sum + s.amount, 0);

  const handleTipPreset = (amount: number) => {
    setTipAmount(amount);
    setCustomTip("");
  };

  const handleCustomTipChange = (value: string) => {
    setCustomTip(value);
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 500) {
      setTipAmount(Math.round(parsed * 100));
    } else if (value === "") {
      setTipAmount(0);
    }
  };

  const handlePayNow = (method: string) => {
    if (!selectedItem || !payOptions) return;
    
    let url: string | null = null;
    const totalAmount = (selectedItem.amount + tipAmount) / 100;

    switch (method) {
      case "VENMO":
        if (payOptions.venmo.username) {
          url = `https://venmo.com/${payOptions.venmo.username}?txn=pay&amount=${totalAmount.toFixed(2)}&note=${encodeURIComponent(payOptions.note)}`;
        }
        break;
      case "CASHAPP":
        if (payOptions.cashApp.cashtag) {
          url = `https://cash.app/$${payOptions.cashApp.cashtag}/${totalAmount.toFixed(2)}`;
        }
        break;
      case "PAYPAL":
        if (payOptions.paypal.handle) {
          url = `https://paypal.me/${payOptions.paypal.handle}/${totalAmount.toFixed(2)}`;
        }
        break;
    }

    if (url) {
      window.open(url, "_blank");
    }

    markPaidMutation.mutate({
      id: selectedItem.id,
      tipAmount,
      paymentMethod: method,
    });
  };

  const handleMarkPaidOnly = () => {
    if (!selectedItem) return;
    markPaidMutation.mutate({
      id: selectedItem.id,
      tipAmount,
      paymentMethod,
    });
  };

  const availableMethods = payOptions ? [
    payOptions.venmo.enabled && "VENMO",
    payOptions.zelle.enabled && "ZELLE",
    payOptions.cashApp.enabled && "CASHAPP",
    payOptions.paypal.enabled && "PAYPAL",
  ].filter(Boolean) as string[] : [];

  if (!userProfile) {
    return (
      <div className="container max-w-2xl mx-auto p-4">
        <PaySkeleton />
      </div>
    );
  }

  if (userProfile.role !== "CLIENT") {
    return (
      <div className="container max-w-2xl mx-auto">
        <div className="flex items-center gap-3 p-4 border-b sticky top-0 bg-background z-10">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold">Pay</h1>
          </div>
        </div>
        <div className="p-8 text-center">
          <DollarSign className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="font-medium text-lg mb-2">Client Only</h2>
          <p className="text-muted-foreground">
            This page is for clients to pay their assistants.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl mx-auto pb-24">
      <div className="flex items-center gap-3 p-4 border-b sticky top-0 bg-background z-10">
        <Link href="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-lg font-semibold">Pay</h1>
          <p className="text-sm text-muted-foreground">Reimburse your assistant</p>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {spendingLoading ? (
          <PaySkeleton />
        ) : (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-2xl font-light">{formatCurrency(totalPending)}</CardTitle>
                <CardDescription>Amount Due</CardDescription>
              </CardHeader>
              <CardContent>
                {pendingItems.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle className="w-12 h-12 mx-auto text-green-500 mb-3" />
                    <p className="font-medium">All caught up!</p>
                    <p className="text-sm text-muted-foreground">No pending reimbursements</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setSelectedItem(item);
                          setTipAmount(0);
                          setCustomTip("");
                        }}
                        className="w-full flex items-center justify-between py-3 px-4 border rounded-lg hover:bg-muted transition-colors text-left"
                      >
                        <div>
                          <p className="font-medium">{item.title || item.vendor || item.category}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.invoiceNumber || formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{formatCurrency(item.amount)}</p>
                          <Badge variant="secondary" className="text-xs">
                            <Clock className="w-3 h-3 mr-1" /> Pay Now
                          </Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {recentlyPaid.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    Recent Payments
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {recentlyPaid.map((item) => (
                      <div key={item.id} className="flex items-center justify-between py-2 border-b last:border-0">
                        <div>
                          <p className="font-medium text-muted-foreground">{item.title || item.vendor || item.category}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.paidAt && formatDistanceToNow(new Date(item.paidAt), { addSuffix: true })}
                          </p>
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
          </>
        )}
      </div>

      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pay {selectedItem?.title || selectedItem?.vendor || selectedItem?.category}</DialogTitle>
            <DialogDescription>
              {formatCurrency(selectedItem?.amount || 0)} reimbursement
            </DialogDescription>
          </DialogHeader>

          {payOptionsLoading ? (
            <div className="py-4">
              <Skeleton className="h-32 w-full" />
            </div>
          ) : payOptions && availableMethods.length > 0 ? (
            <div className="space-y-6 py-4">
              <div className="space-y-3">
                <Label>Add a tip (optional)</Label>
                <div className="flex gap-2 flex-wrap">
                  {TIP_PRESETS.map((preset) => (
                    <Button
                      key={preset}
                      variant={tipAmount === preset && !customTip ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleTipPreset(preset)}
                    >
                      {preset === 0 ? "No tip" : formatCurrency(preset)}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">$</span>
                  <Input
                    type="number"
                    placeholder="Custom amount"
                    value={customTip}
                    onChange={(e) => handleCustomTipChange(e.target.value)}
                    className="w-32"
                    min="0"
                    max="500"
                    step="0.01"
                  />
                </div>
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <div className="flex justify-between text-sm">
                  <span>Reimbursement</span>
                  <span>{formatCurrency(selectedItem?.amount || 0)}</span>
                </div>
                {tipAmount > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Tip</span>
                    <span>+{formatCurrency(tipAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-medium mt-2 pt-2 border-t">
                  <span>Total</span>
                  <span>{formatCurrency((selectedItem?.amount || 0) + tipAmount)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Pay with</Label>
                <div className="grid gap-2">
                  {payOptions.venmo.enabled && (
                    <Button
                      variant="outline"
                      className="justify-between"
                      onClick={() => handlePayNow("VENMO")}
                    >
                      <div className="flex items-center gap-2">
                        <SiVenmo className="w-4 h-4 text-blue-500" />
                        Venmo @{payOptions.venmo.username}
                      </div>
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  )}
                  {payOptions.cashApp.enabled && (
                    <Button
                      variant="outline"
                      className="justify-between"
                      onClick={() => handlePayNow("CASHAPP")}
                    >
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-green-500" />
                        Cash App ${payOptions.cashApp.cashtag}
                      </div>
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  )}
                  {payOptions.paypal.enabled && (
                    <Button
                      variant="outline"
                      className="justify-between"
                      onClick={() => handlePayNow("PAYPAL")}
                    >
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-blue-600" />
                        PayPal {payOptions.paypal.handle}
                      </div>
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  )}
                  {payOptions.zelle.enabled && (
                    <div className="p-3 border rounded-lg space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <DollarSign className="w-4 h-4 text-purple-500" />
                        <span>Zelle: {payOptions.zelle.recipient}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Send {formatCurrency((selectedItem?.amount || 0) + tipAmount)} to the above recipient in your Zelle app
                      </p>
                      <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ZELLE">Zelle</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button 
                        className="w-full" 
                        onClick={handleMarkPaidOnly}
                        disabled={markPaidMutation.isPending}
                      >
                        {markPaidMutation.isPending ? "Processing..." : "I've Sent via Zelle"}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center">
              <AlertCircle className="w-12 h-12 mx-auto text-amber-500 mb-3" />
              <p className="font-medium">No payment methods set up</p>
              <p className="text-sm text-muted-foreground">
                Please contact your assistant to set up payment methods.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedItem(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
