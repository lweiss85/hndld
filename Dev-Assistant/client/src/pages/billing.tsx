import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  CreditCard, 
  Check, 
  Star,
  FileText,
  ExternalLink,
  Sparkles
} from "lucide-react";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PlanDetails {
  id: string;
  name: string;
  price: number;
  priceId?: string;
  interval: "month" | "year";
  features: string[];
  householdLimit: number;
  seats: number;
  recommended?: boolean;
}

interface Subscription {
  plan: string;
  status: string;
  demoMode: boolean;
  currentPeriodEnd?: string;
}

interface Invoice {
  id: string;
  amount: number;
  status: string;
  billingDate?: string;
  paidAt?: string;
  invoiceUrl?: string;
}

function BillingSkeleton() {
  return (
    <div className="px-4 py-6 space-y-6 max-w-4xl mx-auto">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-32 w-full" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    </div>
  );
}

export default function Billing() {
  const { toast } = useToast();

  const { data: plansData, isLoading: plansLoading } = useQuery<{ plans: PlanDetails[]; demoMode: boolean }>({
    queryKey: ["/api/billing/plans"],
  });

  const { data: subscription, isLoading: subLoading } = useQuery<Subscription>({
    queryKey: ["/api/billing/subscription"],
  });

  const { data: invoices } = useQuery<Invoice[]>({
    queryKey: ["/api/billing/invoices"],
  });

  const checkoutMutation = useMutation({
    mutationFn: async (planId: string) => {
      const result = await apiRequest("POST", "/api/billing/checkout", {
        planId,
        successUrl: window.location.origin + "/billing?success=true",
        cancelUrl: window.location.origin + "/billing?canceled=true",
      });
      return result.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to start checkout. Please try again.",
        variant: "destructive",
      });
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const result = await apiRequest("POST", "/api/billing/portal", {
        returnUrl: window.location.href,
      });
      return result.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
  });

  if (plansLoading || subLoading) return <BillingSkeleton />;

  const plans = plansData?.plans || [];
  const demoMode = plansData?.demoMode || subscription?.demoMode;
  const currentPlan = plans.find((p) => p.id === subscription?.plan) || plans[0];

  const formatPrice = (cents: number) => {
    if (cents === 0) return "Free";
    return `$${(cents / 100).toFixed(0)}`;
  };

  return (
    <div className="px-4 py-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Billing</h1>
        {demoMode && (
          <Badge variant="secondary" data-testid="badge-demo-mode">
            <Sparkles className="h-3 w-3 mr-1" />
            Demo Mode
          </Badge>
        )}
      </div>

      <Card data-testid="card-current-plan">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Current Plan
          </CardTitle>
          <CardDescription>
            {subscription?.status === "ACTIVE" ? "Your subscription is active" : "Manage your subscription"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xl font-semibold">{currentPlan?.name || "Free"}</p>
              <p className="text-sm text-muted-foreground">
                {currentPlan?.householdLimit === 1 
                  ? "1 household" 
                  : `Up to ${currentPlan?.householdLimit} households`}
                {" | "}
                {currentPlan?.seats} {currentPlan?.seats === 1 ? "seat" : "seats"}
              </p>
            </div>
            <Badge variant={subscription?.status === "ACTIVE" ? "default" : "secondary"}>
              {subscription?.status || "ACTIVE"}
            </Badge>
          </div>
          {subscription?.currentPeriodEnd && (
            <p className="text-sm text-muted-foreground">
              Renews on {format(new Date(subscription.currentPeriodEnd), "MMMM d, yyyy")}
            </p>
          )}
        </CardContent>
        <CardFooter>
          <Button 
            variant="outline" 
            onClick={() => portalMutation.mutate()}
            disabled={portalMutation.isPending || subscription?.plan === "FREE"}
            data-testid="button-manage-subscription"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Manage Subscription
          </Button>
        </CardFooter>
      </Card>

      <div>
        <h2 className="text-lg font-semibold mb-4">Available Plans</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {plans.filter(p => p.id !== "ENTERPRISE").map((plan) => (
            <Card 
              key={plan.id} 
              className={plan.recommended ? "border-primary" : ""}
              data-testid={`card-plan-${plan.id}`}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  {plan.recommended && (
                    <Badge variant="default">
                      <Star className="h-3 w-3 mr-1" />
                      Popular
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  <span className="text-2xl font-bold text-foreground">
                    {formatPrice(plan.price)}
                  </span>
                  {plan.price > 0 && <span className="text-muted-foreground">/month</span>}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  variant={plan.id === subscription?.plan ? "secondary" : "default"}
                  disabled={plan.id === subscription?.plan || checkoutMutation.isPending}
                  onClick={() => checkoutMutation.mutate(plan.id)}
                  data-testid={`button-select-${plan.id}`}
                >
                  {plan.id === subscription?.plan ? "Current Plan" : "Select Plan"}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>

      {invoices && invoices.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Invoice History</h2>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {invoices.map((invoice) => (
                  <div 
                    key={invoice.id} 
                    className="flex items-center justify-between p-4"
                    data-testid={`row-invoice-${invoice.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">${(invoice.amount / 100).toFixed(2)}</p>
                        <p className="text-sm text-muted-foreground">
                          {invoice.paidAt 
                            ? format(new Date(invoice.paidAt), "MMM d, yyyy")
                            : "Pending"
                          }
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={invoice.status === "PAID" ? "default" : "secondary"}>
                        {invoice.status}
                      </Badge>
                      {invoice.invoiceUrl && (
                        <Button variant="ghost" size="icon" asChild>
                          <a 
                            href={invoice.invoiceUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            data-testid={`link-invoice-download-${invoice.id}`}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
