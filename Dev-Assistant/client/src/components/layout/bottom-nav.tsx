import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useUser } from "@/lib/user-context";
import { usePendingInvoices } from "@/hooks/usePendingInvoices";
import { useActiveServiceType } from "@/hooks/use-active-service-type";
import { motion } from "framer-motion";
import { MoreHorizontal } from "lucide-react";
import {
  IconHome,
  IconSchedule,
  IconMessages,
  IconProfile,
  IconSpending,
  IconTasks,
  IconClock,
  IconSparkle,
  IconSettings,
  IconComplete,
  type HndldIconProps,
} from "@/components/icons/hndld-icons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PayNowSheet } from "@/components/pay-now-sheet";

interface NavItem {
  path: string;
  icon: React.FC<HndldIconProps>;
  label: string;
}

const clientTabs: NavItem[] = [
  { path: "/", icon: IconHome, label: "Home" },
  { path: "/updates", icon: IconMessages, label: "Inbox" },
  { path: "/approvals", icon: IconComplete, label: "Approve" },
  { path: "/pay", icon: IconSpending, label: "Pay" },
];

const cleaningClientTabs: NavItem[] = [
  { path: "/", icon: IconHome, label: "Home" },
  { path: "/schedule", icon: IconSchedule, label: "Visits" },
  { path: "/addons", icon: IconSparkle, label: "Add-ons" },
  { path: "/pay", icon: IconSpending, label: "Pay" },
];

const assistantTabs: NavItem[] = [
  { path: "/", icon: IconClock, label: "Today" },
  { path: "/tasks", icon: IconTasks, label: "Tasks" },
  { path: "/calendar", icon: IconSchedule, label: "Calendar" },
  { path: "/spending", icon: IconSpending, label: "Money" },
  { path: "/house", icon: IconHome, label: "House" },
];

const staffTabs: NavItem[] = [
  { path: "/", icon: IconClock, label: "Today" },
  { path: "/jobs", icon: IconTasks, label: "Jobs" },
  { path: "/updates", icon: IconMessages, label: "Updates" },
  { path: "/more", icon: IconSettings, label: "More" },
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
        className="fixed bottom-0 left-0 right-0 z-50 bg-card/70 backdrop-blur-2xl border-t border-border/30"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        data-testid="bottom-nav"
        role="navigation"
        aria-label="Main navigation"
      >
        {hasUnpaidInvoices && pendingInvoices && (
          <div className="px-4 py-2.5">
            <Button
              onClick={() => setShowPaySheet(true)}
              className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground shadow-md font-medium text-sm tracking-wide rounded-xl"
              data-testid="button-pay-now-cta"
            >
              <span className="hndld-amount">{formatAmount(pendingInvoices.totalAmount)}</span>
              <span className="ml-2 text-primary-foreground/60">due</span>
              {pendingInvoices.count > 1 && (
                <Badge variant="secondary" className="ml-2 bg-white/15 text-white border-0 text-[10px]">
                  {pendingInvoices.count}
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
            const TabIcon = tab.icon;
            
            return (
              <button
                key={tab.path}
                onClick={() => handleTabClick(tab.path)}
                role="tab"
                aria-selected={isActive}
                aria-label={tab.label}
                className="relative flex flex-col items-center justify-center gap-0.5 py-1.5 flex-1 min-w-[64px] min-h-[44px] transition-colors duration-200"
                data-testid={`button-nav-${tab.label.toLowerCase().replace(/\s+/g, '-')}`}
                data-tour={`nav-${tab.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-1 left-1/2 -translate-x-1/2 h-0.5 w-5 rounded-full"
                    style={{ backgroundColor: "hsl(var(--hndld-gold-500))" }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className={cn(
                  "relative z-10 hndld-nav-icon",
                  isActive && "active"
                )}>
                  <TabIcon
                    size={20}
                    accentColor={isActive ? "#C9A96E" : "currentColor"}
                    className={isActive ? "text-foreground" : "text-muted-foreground/60"}
                    aria-hidden="true"
                  />
                </span>
                <span className={cn(
                  "relative z-10 text-[10px] whitespace-nowrap mt-0.5",
                  isActive ? "font-semibold text-foreground" : "font-normal text-muted-foreground/60"
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
