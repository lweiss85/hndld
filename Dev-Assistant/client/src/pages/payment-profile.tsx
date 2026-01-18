import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  ArrowLeft,
  CreditCard,
  DollarSign,
  Eye,
  Save,
} from "lucide-react";
import { SiVenmo } from "react-icons/si";
import { Link, useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/lib/user-context";

interface HouseholdPaymentSettings {
  override: {
    id: string;
    householdId: string;
    useOrgDefaults: boolean;
    venmoUsername: string | null;
    zelleRecipient: string | null;
    cashAppCashtag: string | null;
    paypalMeHandle: string | null;
    defaultPaymentMethod: string | null;
    payNoteTemplate: string | null;
  } | null;
  orgProfile: {
    id: string;
    venmoUsername: string | null;
    zelleRecipient: string | null;
    cashAppCashtag: string | null;
    paypalMeHandle: string | null;
    defaultPaymentMethod: string;
    payNoteTemplate: string;
  } | null;
}

const TOKEN_CHIPS = ["{ref}", "{category}", "{date}", "{vendor}", "{amount}"];
const DEFAULT_TEMPLATE = "hndld • Reimbursement {ref} • {category} • {date}";

function PaymentProfileSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

export default function PaymentProfilePage() {
  const { userProfile } = useUser();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (userProfile && userProfile.role === "CLIENT") {
      toast({ description: "Payment details are set by your assistant." });
      navigate("/pay");
    }
  }, [userProfile, navigate, toast]);
  
  const [venmoUsername, setVenmoUsername] = useState("");
  const [zelleRecipient, setZelleRecipient] = useState("");
  const [cashAppCashtag, setCashAppCashtag] = useState("");
  const [paypalMeHandle, setPaypalMeHandle] = useState("");
  const [defaultMethod, setDefaultMethod] = useState<"VENMO" | "ZELLE" | "CASH_APP" | "PAYPAL">("VENMO");
  const [noteTemplate, setNoteTemplate] = useState(DEFAULT_TEMPLATE);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: settings, isLoading } = useQuery<HouseholdPaymentSettings>({
    queryKey: ["/api/household/payment-settings"],
    enabled: userProfile?.role === "ASSISTANT",
  });

  useEffect(() => {
    if (settings) {
      const override = settings.override;
      const org = settings.orgProfile;
      
      setVenmoUsername(override?.venmoUsername || org?.venmoUsername || "");
      setZelleRecipient(override?.zelleRecipient || org?.zelleRecipient || "");
      setCashAppCashtag(override?.cashAppCashtag || org?.cashAppCashtag || "");
      setPaypalMeHandle(override?.paypalMeHandle || org?.paypalMeHandle || "");
      setDefaultMethod((override?.defaultPaymentMethod || org?.defaultPaymentMethod || "VENMO") as "VENMO" | "ZELLE" | "CASH_APP" | "PAYPAL");
      setNoteTemplate(override?.payNoteTemplate || org?.payNoteTemplate || DEFAULT_TEMPLATE);
      setHasChanges(false);
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: async (data: {
      venmoUsername?: string;
      zelleRecipient?: string;
      cashAppCashtag?: string;
      paypalMeHandle?: string;
      defaultPaymentMethod?: string;
      payNoteTemplate?: string;
    }) => {
      return apiRequest("PUT", "/api/household/payment-settings", {
        ...data,
        useOrgDefaults: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/household/payment-settings"] });
      toast({ description: "Payment profile saved." });
      setHasChanges(false);
    },
    onError: (error: any) => {
      toast({ 
        variant: "destructive", 
        description: error.message || "Failed to save payment profile" 
      });
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      venmoUsername,
      zelleRecipient,
      cashAppCashtag,
      paypalMeHandle,
      defaultPaymentMethod: defaultMethod,
      payNoteTemplate: noteTemplate,
    });
  };

  const handleFieldChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setter(e.target.value);
    setHasChanges(true);
  };

  const insertToken = (token: string) => {
    setNoteTemplate(prev => prev + " " + token);
    setHasChanges(true);
  };

  const previewNote = noteTemplate
    .replace(/{ref}/g, "HN-ABC123")
    .replace(/{category}/g, "Groceries")
    .replace(/{date}/g, new Date().toLocaleDateString())
    .replace(/{vendor}/g, "Whole Foods")
    .replace(/{amount}/g, "$42.50");

  if (!userProfile) {
    return (
      <div className="container max-w-2xl mx-auto p-4">
        <PaymentProfileSkeleton />
      </div>
    );
  }

  if (userProfile.role !== "ASSISTANT") {
    return (
      <div className="container max-w-2xl mx-auto">
        <div className="flex items-center gap-3 p-4 border-b sticky top-0 bg-background z-10">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold">Payment Profile</h1>
          </div>
        </div>
        <div className="p-8 text-center">
          <DollarSign className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="font-medium text-lg mb-2">Payment Settings</h2>
          <p className="text-muted-foreground">
            Your assistant manages payment settings. Please contact them if you have questions about payment methods.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl mx-auto pb-40">
      <div className="flex items-center gap-3 p-4 border-b sticky top-0 bg-background z-10">
        <Link href="/">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-lg font-semibold" data-testid="text-page-title">Payment Profile</h1>
          <p className="text-sm text-muted-foreground">How clients reimburse you</p>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {isLoading ? (
          <PaymentProfileSkeleton />
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5" />
                  Payment Methods
                </CardTitle>
                <CardDescription>
                  Add your payment details so clients can reimburse you
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="venmo" className="flex items-center gap-2">
                    <SiVenmo className="w-4 h-4 text-blue-500" />
                    Venmo Username
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                    <Input
                      id="venmo"
                      placeholder="username"
                      value={venmoUsername}
                      onChange={handleFieldChange(setVenmoUsername)}
                      className="pl-8"
                      data-testid="input-venmo-username"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Your Venmo username without the @ symbol
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="zelle" className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-purple-500" />
                    Zelle Email or Phone
                  </Label>
                  <Input
                    id="zelle"
                    placeholder="email@example.com or (555) 123-4567"
                    value={zelleRecipient}
                    onChange={handleFieldChange(setZelleRecipient)}
                    data-testid="input-zelle-recipient"
                  />
                  <p className="text-xs text-muted-foreground">
                    The email or phone number linked to your Zelle account
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cashapp" className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-green-500" />
                    Cash App Cashtag
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      id="cashapp"
                      placeholder="cashtag"
                      value={cashAppCashtag}
                      onChange={handleFieldChange(setCashAppCashtag)}
                      className="pl-8"
                      data-testid="input-cashapp-cashtag"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Your Cash App cashtag without the $ symbol
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="paypal" className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-blue-600" />
                    PayPal.me Handle
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">paypal.me/</span>
                    <Input
                      id="paypal"
                      placeholder="handle"
                      value={paypalMeHandle}
                      onChange={handleFieldChange(setPaypalMeHandle)}
                      className="pl-20"
                      data-testid="input-paypal-handle"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Your PayPal.me handle (letters and numbers only)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Default Payment Method</Label>
                  <Select
                    value={defaultMethod}
                    onValueChange={(v: "VENMO" | "ZELLE" | "CASH_APP" | "PAYPAL") => {
                      setDefaultMethod(v);
                      setHasChanges(true);
                    }}
                  >
                    <SelectTrigger data-testid="select-default-method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VENMO">Venmo (preferred)</SelectItem>
                      <SelectItem value="ZELLE">Zelle (preferred)</SelectItem>
                      <SelectItem value="CASH_APP">Cash App (preferred)</SelectItem>
                      <SelectItem value="PAYPAL">PayPal (preferred)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="w-5 h-5" />
                  Payment Note Template
                </CardTitle>
                <CardDescription>
                  Customize the note that appears on payment requests
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-1">
                  {TOKEN_CHIPS.map((token) => (
                    <Badge
                      key={token}
                      variant="secondary"
                      className="cursor-pointer"
                      onClick={() => insertToken(token)}
                      data-testid={`chip-token-${token.replace(/[{}]/g, "")}`}
                    >
                      {token}
                    </Badge>
                  ))}
                </div>

                <Textarea
                  value={noteTemplate}
                  onChange={handleFieldChange(setNoteTemplate)}
                  placeholder="Enter payment note template..."
                  rows={3}
                  data-testid="textarea-note-template"
                />

                <div className="p-3 bg-muted rounded-md">
                  <p className="text-xs text-muted-foreground mb-1">Preview:</p>
                  <p className="text-sm font-medium" data-testid="text-note-preview">{previewNote}</p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {!isLoading && (
        <div className="fixed bottom-[calc(var(--hndld-bottom-pad,5.5rem)+env(safe-area-inset-bottom))] left-0 right-0 p-4 bg-background border-t">
          <div className="container max-w-2xl mx-auto">
            <Button
              className="w-full"
              size="lg"
              onClick={handleSave}
              disabled={updateMutation.isPending || !hasChanges}
              data-testid="button-save-profile"
            >
              {updateMutation.isPending ? (
                "Saving..."
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Payment Profile
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
