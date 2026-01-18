import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Copy, 
  ExternalLink, 
  Check, 
  CreditCard, 
  AlertCircle,
  Settings,
  Smartphone,
  DollarSign,
  Heart,
} from "lucide-react";
import { SiVenmo } from "react-icons/si";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/lib/user-context";
import { apiRequest } from "@/lib/queryClient";

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
  preferredMethod: "VENMO" | "ZELLE" | "CASHAPP" | "PAYPAL";
  display: {
    payToLine: string;
  };
}

interface PayNowSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spendingId: string;
  vendorName?: string;
  onPaymentSent?: () => void;
}

function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

const TIP_PRESETS = [0, 500, 1000, 1500, 2000];

export function PayNowSheet({ open, onOpenChange, spendingId, vendorName, onPaymentSent }: PayNowSheetProps) {
  const { toast } = useToast();
  const { userProfile } = useUser();
  const [, navigate] = useLocation();
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showHelper, setShowHelper] = useState(true);
  const [tipAmount, setTipAmount] = useState(0);
  const [customTip, setCustomTip] = useState("");
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);

  const handleSetupPayment = () => {
    onOpenChange(false);
    setTimeout(() => navigate("/payment-profile"), 100);
  };

  const { data: payOptions, isLoading, error } = useQuery<PayOptions>({
    queryKey: [`/api/spending/${spendingId}/pay-options`],
    enabled: open && !!spendingId,
  });

  useEffect(() => {
    const helperSeen = localStorage.getItem("hndld_pay_helper_seen");
    if (helperSeen) setShowHelper(false);
  }, []);

  const dismissHelper = () => {
    localStorage.setItem("hndld_pay_helper_seen", "true");
    setShowHelper(false);
  };

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      toast({ description: "Copied." });
      setTimeout(() => setCopiedField(null), 2000);
    } catch (e) {
      toast({ variant: "destructive", description: "Failed to copy" });
    }
  };

  const openVenmo = () => {
    if (!payOptions?.venmo.username) return;
    
    const amount = (totalAmount / 100).toFixed(2);
    const note = encodeURIComponent(payOptions.note);
    const username = payOptions.venmo.username;
    
    toast({ description: "Opening Venmo..." });
    
    const webFallback = `https://venmo.com/${username}?txn=pay&amount=${amount}&note=${note}`;
    
    if (isMobileDevice()) {
      const deepLink = `venmo://paycharge?txn=pay&recipients=${username}&amount=${amount}&note=${note}`;
      
      const timeout = setTimeout(() => {
        window.open(webFallback, "_blank");
      }, 1500);
      
      window.location.href = deepLink;
      
      window.addEventListener("blur", () => {
        clearTimeout(timeout);
      }, { once: true });
    } else {
      window.open(webFallback, "_blank");
    }
  };

  const formatAmount = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  const noPaymentMethodsConfigured = payOptions && 
    !payOptions.venmo.enabled && 
    !payOptions.zelle.enabled && 
    !payOptions.cashApp?.enabled && 
    !payOptions.paypal?.enabled;

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

  const totalAmount = (payOptions?.amount || 0) + tipAmount;

  const openCashApp = () => {
    if (!payOptions?.cashApp?.cashtag) return;
    
    const amount = (totalAmount / 100).toFixed(2);
    toast({ description: "Opening Cash App..." });
    
    const url = `https://cash.app/$${payOptions.cashApp.cashtag}/${amount}`;
    window.open(url, "_blank");
  };

  const openPayPal = () => {
    if (!payOptions?.paypal?.handle) return;
    
    const amount = (totalAmount / 100).toFixed(2);
    toast({ description: "Opening PayPal..." });
    
    const url = `https://paypal.me/${payOptions.paypal.handle}/${amount}`;
    window.open(url, "_blank");
  };

  const handleMarkAsPaid = async (method?: string) => {
    setIsMarkingPaid(true);
    try {
      await apiRequest("PATCH", `/api/spending/${spendingId}/status`, { 
        status: "PAYMENT_SENT",
        tipAmount: tipAmount,
        paymentMethodUsed: method || selectedMethod,
      });
      toast({ description: "Marked as paid. Thank you." });
      onPaymentSent?.();
      onOpenChange(false);
      setTipAmount(0);
      setCustomTip("");
    } catch (e: any) {
      toast({ variant: "destructive", description: e.message || "Failed to mark as paid" });
    } finally {
      setIsMarkingPaid(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent 
        className="max-h-[85vh]"
        style={{ maxHeight: "calc(100vh - env(safe-area-inset-top) - 16px)" }}
      >
        <DrawerHeader className="border-b">
          <DrawerTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Pay Now
          </DrawerTitle>
          {vendorName && (
            <p className="text-sm text-muted-foreground">{vendorName}</p>
          )}
        </DrawerHeader>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : error || !payOptions ? (
            <div className="text-center py-6">
              <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">Unable to load payment options</p>
            </div>
          ) : noPaymentMethodsConfigured ? (
            <div className="text-center py-8 space-y-4">
              <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto" />
              <div>
                <p className="font-medium">Payment method not set up yet</p>
                {userProfile?.role === "ASSISTANT" ? (
                  <>
                    <p className="text-sm text-muted-foreground mt-1">
                      Set up your payment profile to enable Pay Now.
                    </p>
                    <Button 
                      className="mt-4" 
                      onClick={handleSetupPayment}
                      data-testid="button-setup-payment"
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Set Up Payment Profile
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground mt-1">
                    Please contact your assistant to set up payment options.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <>
              {showHelper && (
                <div className="bg-muted/50 rounded-lg p-3 text-sm">
                  <p className="text-muted-foreground">
                    Venmo opens pre-filled. Zelle copies details.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-auto p-0 text-xs"
                    onClick={dismissHelper}
                  >
                    Got it
                  </Button>
                </div>
              )}

              <div className="bg-primary/10 rounded-lg p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  {tipAmount > 0 ? "Total" : "Amount"}
                </p>
                <p className="text-3xl font-bold" data-testid="text-pay-amount">
                  {formatAmount(totalAmount)}
                </p>
                {tipAmount > 0 && (
                  <p className="text-sm text-green-600 mt-1">
                    {formatAmount(payOptions.amount)} + {formatAmount(tipAmount)} tip
                  </p>
                )}
                <Badge variant="outline" className="mt-2" data-testid="badge-pay-ref">
                  Ref: {payOptions.ref}
                </Badge>
              </div>

              {userProfile?.role === "CLIENT" && (
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Heart className="w-5 h-5 text-pink-500" />
                    <Label className="font-medium">Add a tip (optional)</Label>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {TIP_PRESETS.map((preset) => (
                      <Button
                        key={preset}
                        variant={tipAmount === preset && !customTip ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleTipPreset(preset)}
                      >
                        {preset === 0 ? "No tip" : formatAmount(preset)}
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
              )}

              <p className="text-sm text-center text-muted-foreground" data-testid="text-pay-to">
                {payOptions.display.payToLine}
              </p>

              {payOptions.venmo.enabled && (
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <SiVenmo className="w-5 h-5 text-blue-500" />
                      <span className="font-medium">Venmo</span>
                    </div>
                    {payOptions.preferredMethod === "VENMO" && (
                      <Badge variant="secondary" className="text-xs">Preferred</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    @{payOptions.venmo.username}
                  </p>
                  <Button 
                    className="w-full" 
                    onClick={openVenmo}
                    data-testid="button-open-venmo"
                  >
                    {isMobileDevice() ? (
                      <Smartphone className="w-4 h-4 mr-2" />
                    ) : (
                      <ExternalLink className="w-4 h-4 mr-2" />
                    )}
                    {isMobileDevice() ? "Open Venmo App" : "Open Venmo"}
                  </Button>
                </div>
              )}

              {payOptions.zelle.enabled && (
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-5 h-5 text-purple-500" />
                      <span className="font-medium">Zelle</span>
                    </div>
                    {payOptions.preferredMethod === "ZELLE" && (
                      <Badge variant="secondary" className="text-xs">Preferred</Badge>
                    )}
                  </div>
                  
                  <p className="text-xs text-muted-foreground">
                    Pay in your bank's Zelle, then tap "I paid".
                  </p>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 bg-muted/50 rounded p-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">Recipient</p>
                        <p className="text-sm font-medium truncate">{payOptions.zelle.recipient}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyToClipboard(payOptions.zelle.recipient!, "recipient")}
                        data-testid="button-copy-recipient"
                      >
                        {copiedField === "recipient" ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>

                    <div className="flex items-center justify-between gap-2 bg-muted/50 rounded p-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">Amount</p>
                        <p className="text-sm font-medium">{formatAmount(totalAmount)}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyToClipboard(formatAmount(totalAmount), "amount")}
                        data-testid="button-copy-amount"
                      >
                        {copiedField === "amount" ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                    
                    <div className="flex items-center justify-between gap-2 bg-muted/50 rounded p-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">Note</p>
                        <p className="text-sm truncate">{payOptions.zelle.note}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyToClipboard(payOptions.zelle.note, "note")}
                        data-testid="button-copy-note"
                      >
                        {copiedField === "note" ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {payOptions.cashApp?.enabled && (
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-5 h-5 text-green-500" />
                      <span className="font-medium">Cash App</span>
                    </div>
                    {payOptions.preferredMethod === "CASHAPP" && (
                      <Badge variant="secondary" className="text-xs">Preferred</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    ${payOptions.cashApp.cashtag}
                  </p>
                  <Button 
                    className="w-full" 
                    onClick={openCashApp}
                    data-testid="button-open-cashapp"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open Cash App
                  </Button>
                </div>
              )}

              {payOptions.paypal?.enabled && (
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-5 h-5 text-blue-600" />
                      <span className="font-medium">PayPal</span>
                    </div>
                    {payOptions.preferredMethod === "PAYPAL" && (
                      <Badge variant="secondary" className="text-xs">Preferred</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    paypal.me/{payOptions.paypal.handle}
                  </p>
                  <Button 
                    className="w-full" 
                    onClick={openPayPal}
                    data-testid="button-open-paypal"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open PayPal
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        <DrawerFooter 
          className="border-t gap-2"
          style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
        >
          {payOptions && !noPaymentMethodsConfigured && (
            <Button 
              onClick={() => handleMarkAsPaid()} 
              disabled={isMarkingPaid}
              data-testid="button-mark-paid"
            >
              <Check className="w-4 h-4 mr-2" />
              {isMarkingPaid ? "Marking..." : "I paid"}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-close-pay">
            Close
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
