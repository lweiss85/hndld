import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useUser } from "@/lib/user-context";
import { usePendingInvoices } from "@/hooks/usePendingInvoices";
import { useActiveServiceType } from "@/hooks/use-active-service-type";
import { 
  Calendar, 
  CheckSquare, 
  ClipboardList, 
  Home, 
  Building2, 
  Clock,
  FileText,
  Mail,
  Receipt,
  CreditCard,
  Briefcase,
  MoreHorizontal,
  CalendarDays,
  Camera,
  Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PayNowSheet } from "@/components/pay-now-sheet";

interface NavItem {
  path: string;
  icon: React.ReactNode;
  label: string;
}

const clientTabs: NavItem[] = [
  { path: "/", icon: <Home className="h-5 w-5" aria-hidden="true" />, label: "Home" },
  { path: "/updates", icon: <FileText className="h-5 w-5" aria-hidden="true" />, label: "Updates" },
  { path: "/approvals", icon: <CheckSquare className="h-5 w-5" aria-hidden="true" />, label: "Approvals" },
  { path: "/pay", icon: <CreditCard className="h-5 w-5" aria-hidden="true" />, label: "Pay" },
  { path: "/messages", icon: <Mail className="h-5 w-5" aria-hidden="true" />, label: "Messages" },
];

const cleaningClientTabs: NavItem[] = [
  { path: "/", icon: <Home className="h-5 w-5" aria-hidden="true" />, label: "Home" },
  { path: "/schedule", icon: <CalendarDays className="h-5 w-5" aria-hidden="true" />, label: "Schedule" },
  { path: "/addons", icon: <Sparkles className="h-5 w-5" aria-hidden="true" />, label: "Add-ons" },
  { path: "/pay", icon: <CreditCard className="h-5 w-5" aria-hidden="true" />, label: "Pay" },
  { path: "/messages", icon: <Mail className="h-5 w-5" aria-hidden="true" />, label: "Messages" },
];

const assistantTabs: NavItem[] = [
  { path: "/", icon: <Clock className="h-5 w-5" aria-hidden="true" />, label: "Today" },
  { path: "/tasks", icon: <ClipboardList className="h-5 w-5" aria-hidden="true" />, label: "Tasks" },
  { path: "/calendar", icon: <Calendar className="h-5 w-5" aria-hidden="true" />, label: "Calendar" },
  { path: "/spending", icon: <Receipt className="h-5 w-5" aria-hidden="true" />, label: "Money" },
  { path: "/house", icon: <Building2 className="h-5 w-5" aria-hidden="true" />, label: "House" },
];

const staffTabs: NavItem[] = [
  { path: "/", icon: <Clock className="h-5 w-5" aria-hidden="true" />, label: "Today" },
  { path: "/jobs", icon: <Briefcase className="h-5 w-5" aria-hidden="true" />, label: "Jobs" },
  { path: "/updates", icon: <FileText className="h-5 w-5" aria-hidden="true" />, label: "Updates" },
  { path: "/more", icon: <MoreHorizontal className="h-5 w-5" aria-hidden="true" />, label: "More" },
];

export function BottomNav() {
  const [location, navigate] = useLocation();
  const { activeRole } = useUser();
  const { activeServiceType } = useActiveServiceType();
  const { data: pendingInvoices } = usePendingInvoices();
  const [showPaySheet, setShowPaySheet] = useState(false);

  const tabs = activeRole === "ASSISTANT" 
    ? assistantTabs 
    : activeRole === "STAFF" 
      ? staffTabs 
      : activeServiceType === "CLEANING"
        ? cleaningClientTabs
        : clientTabs;
  const hasUnpaidInvoices = activeRole === "CLIENT" && pendingInvoices && pendingInvoices.count > 0;

  useEffect(() => {
    if (hasUnpaidInvoices) {
      document.documentElement.style.setProperty("--hndld-bottom-pad", "8rem");
    } else {
      document.documentElement.style.setProperty("--hndld-bottom-pad", "5rem");
    }
  }, [hasUnpaidInvoices]);

  const [, setLocation] = useLocation();

  const handleTabClick = (path: string) => {
    if (navigator.vibrate) {
      navigator.vibrate(8);
    }
    setLocation(path);
  };

  const formatAmount = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  return (
    <>
      <nav 
        className="fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-t border-border/50 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        data-testid="bottom-nav"
        role="navigation"
        aria-label="Main navigation"
      >
        {hasUnpaidInvoices && pendingInvoices && (
          <div className="px-4 py-2 animate-in slide-in-from-bottom-2 fade-in duration-300">
            <Button
              onClick={() => setShowPaySheet(true)}
              className="w-full h-12 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/25 font-semibold text-base"
              data-testid="button-pay-now-cta"
            >
              <CreditCard className="h-5 w-5 mr-2" aria-hidden="true" />
              Pay {formatAmount(pendingInvoices.totalAmount)}
              {pendingInvoices.count > 1 && (
                <Badge variant="secondary" className="ml-2 bg-white/20 text-white border-0">
                  {pendingInvoices.count} invoices
                </Badge>
              )}
            </Button>
          </div>
        )}
        
        <div 
          className="flex items-center justify-around h-14 px-1 overflow-x-auto scrollbar-hide"
          role="tablist"
        >
          {tabs.map((tab) => {
            const isActive = location === tab.path || 
              (tab.path !== "/" && location.startsWith(tab.path));
            
            return (
              <button
                key={tab.path}
                onClick={() => handleTabClick(tab.path)}
                role="tab"
                aria-selected={isActive}
                aria-label={tab.label}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-0.5 py-1.5 flex-1 min-w-[64px] min-h-[44px] transition-all duration-200",
                  isActive ? "text-foreground" : "text-muted-foreground"
                )}
                data-testid={`button-nav-${tab.label.toLowerCase().replace(/\s+/g, '-')}`}
                data-tour={`nav-${tab.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {isActive && (
                  <div className="absolute inset-1 bg-primary/10 rounded-xl" />
                )}
                <span className={cn(
                  "relative z-10 transition-transform duration-200",
                  isActive && "scale-110"
                )}>
                  {tab.icon}
                </span>
                <span className={cn(
                  "relative z-10 text-[10px] whitespace-nowrap",
                  isActive ? "font-semibold" : "font-normal"
                )}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {hasUnpaidInvoices && pendingInvoices?.latestInvoiceId && (
        <PayNowSheet
          open={showPaySheet}
          onOpenChange={setShowPaySheet}
          spendingId={pendingInvoices.latestInvoiceId}
          vendorName={pendingInvoices.latestInvoiceTitle || "Invoice"}
        />
      )}
    </>
  );
}
