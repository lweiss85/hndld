import { useAuth } from "@/hooks/use-auth";
import { useUser } from "@/lib/user-context";
import { useTheme } from "@/lib/theme-provider";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Moon, Sun, LogOut, UserCircle, BarChart3, Send, FolderOpen, Store, CalendarCheck, Search, ArrowLeftRight, Bell, Check, Repeat } from "lucide-react";
import { IconSpending, IconAlert, IconMessages, IconHome } from "@/components/icons/hndld-icons";
import { useActiveServiceType, ServiceType } from "@/hooks/use-active-service-type";
import { GlobalSearchDialog } from "@/components/global-search";
import { Link, useLocation } from "wouter";
import { useState, useEffect, useCallback } from "react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { triggerHaptic } from "@/components/juice";

interface Household {
  id: string;
  name: string;
  userRole: string;
}

export function Header() {
  const { user, logout } = useAuth();
  const { activeRole, setActiveRole, canSwitchRoles } = useUser();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const [, setLoc] = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const {
    activeServiceType,
    setActiveServiceType,
    hasMultipleServices,
    availableServiceTypes,
  } = useActiveServiceType();

  const [activeHouseholdId, setActiveHouseholdId] = useState<string | null>(
    localStorage.getItem("activeHouseholdId")
  );

  const { data: households } = useQuery<Household[]>({
    queryKey: ["/api/households/mine"],
  });

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (households && households.length > 0 && !activeHouseholdId) {
      const firstHousehold = households[0].id;
      setActiveHouseholdId(firstHousehold);
      localStorage.setItem("activeHouseholdId", firstHousehold);
    }
  }, [households, activeHouseholdId]);

  const switchHousehold = (householdId: string) => {
    setActiveHouseholdId(householdId);
    localStorage.setItem("activeHouseholdId", householdId);
    queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    queryClient.invalidateQueries({ queryKey: ["/api/today"] });
    queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
    queryClient.invalidateQueries({ queryKey: ["/api/updates"] });
    queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
    queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
    queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
    queryClient.invalidateQueries({ queryKey: ["/api/spending"] });
    queryClient.invalidateQueries({ queryKey: ["/api/access-items"] });
    queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
    queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    queryClient.invalidateQueries({ queryKey: ["/api/insights"] });
    triggerHaptic("medium");
    toast({
      title: "Household switched",
      description: `Now managing: ${households?.find(h => h.id === householdId)?.name}`,
    });
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setSearchOpen(true);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const initials = user
    ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase() || "U"
    : "?";

  const unreadCount = unreadData?.count || 0;
  const hasNotifications = unreadCount > 0;

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-background/70 backdrop-blur-2xl border-b border-border/20" role="banner">
        <div className="flex h-14 items-center justify-between px-5 max-w-4xl mx-auto">
          <Link href="/">
            <img
              src="/hndldlogo.png"
              alt="hndld"
              className="h-6 w-auto"
              data-testid="text-app-title"
              style={theme === "dark" ? { filter: "brightness(0) invert(1)" } : undefined}
            />
          </Link>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full h-9 w-9"
              onClick={() => setSearchOpen(true)}
              aria-label="Search"
              data-testid="button-search"
            >
              <Search className="h-4 w-4 text-muted-foreground" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full relative" aria-label="Account menu" data-testid="button-user-menu">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || "User"} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  {hasNotifications && (
                    <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-hndld-gold-500 rounded-full border-2 border-background" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="font-normal pb-3">
                  <p className="text-sm font-medium">{user?.firstName} {user?.lastName}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                {households && households.length > 1 && (
                  <>
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                      Household
                    </DropdownMenuLabel>
                    {households.map((household) => (
                      <DropdownMenuItem
                        key={household.id}
                        onClick={() => switchHousehold(household.id)}
                        className="flex items-center justify-between cursor-pointer"
                        data-testid={`household-option-${household.id}`}
                      >
                        <div className="flex flex-col">
                          <span className="font-medium">{household.name}</span>
                          <span className="text-xs text-muted-foreground capitalize">
                            {household.userRole?.toLowerCase().replace("_", " ")}
                          </span>
                        </div>
                        {household.id === activeHouseholdId && (
                          <Check className="h-4 w-4 text-primary" aria-hidden="true" />
                        )}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                  </>
                )}

                {canSwitchRoles && (
                  <>
                    <DropdownMenuItem
                      className="gap-2 cursor-pointer"
                      onClick={() => setActiveRole(activeRole === "ASSISTANT" ? "CLIENT" : "ASSISTANT")}
                      data-testid="menu-item-switch-role"
                    >
                      <ArrowLeftRight className="h-4 w-4" />
                      Switch to {activeRole === "ASSISTANT" ? "Client" : "Assistant"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}

                {hasMultipleServices && (
                  <>
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                      Service Mode
                    </DropdownMenuLabel>
                    {availableServiceTypes.map((st: ServiceType) => (
                      <DropdownMenuItem
                        key={st}
                        onClick={() => { setActiveServiceType(st); triggerHaptic("light"); }}
                        className="flex items-center justify-between cursor-pointer"
                        data-testid={`service-option-${st.toLowerCase()}`}
                      >
                        <span>{st === "CLEANING" ? "Cleaning" : "Personal Assistant"}</span>
                        {st === activeServiceType && (
                          <Check className="h-4 w-4 text-primary" aria-hidden="true" />
                        )}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                  </>
                )}

                <DropdownMenuItem
                  className="gap-2 cursor-pointer"
                  onClick={() => { setLoc("/notifications"); }}
                  data-testid="menu-item-notifications"
                >
                  <Bell className="h-4 w-4" />
                  Notifications
                  {hasNotifications && (
                    <Badge className="ml-auto" variant="secondary">{unreadCount}</Badge>
                  )}
                </DropdownMenuItem>

                <Link href="/profile">
                  <DropdownMenuItem className="gap-2 cursor-pointer" data-testid="menu-item-profile">
                    <UserCircle className="h-4 w-4" />
                    Profile
                  </DropdownMenuItem>
                </Link>
                <Link href="/messages">
                  <DropdownMenuItem className="gap-2 cursor-pointer" data-testid="menu-item-messages">
                    <IconMessages size={16} />
                    Messages
                  </DropdownMenuItem>
                </Link>

                {activeRole === "CLIENT" ? (
                  <>
                    <Link href="/requests">
                      <DropdownMenuItem className="gap-2 cursor-pointer">
                        <Send className="h-4 w-4" />
                        Requests
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/house">
                      <DropdownMenuItem className="gap-2 cursor-pointer">
                        <IconHome size={16} />
                        House Profile
                      </DropdownMenuItem>
                    </Link>
                  </>
                ) : (
                  <Link href="/files">
                    <DropdownMenuItem className="gap-2 cursor-pointer">
                      <FolderOpen className="h-4 w-4" />
                      Files
                    </DropdownMenuItem>
                  </Link>
                )}

                <Link href="/emergency">
                  <DropdownMenuItem className="gap-2 cursor-pointer" data-testid="menu-item-emergency">
                    <IconAlert size={16} />
                    Emergency
                  </DropdownMenuItem>
                </Link>
                <Link href="/insights">
                  <DropdownMenuItem className="gap-2 cursor-pointer" data-testid="menu-item-insights">
                    <BarChart3 className="h-4 w-4" />
                    Insights
                  </DropdownMenuItem>
                </Link>
                <Link href="/marketplace">
                  <DropdownMenuItem className="gap-2 cursor-pointer" data-testid="menu-item-marketplace">
                    <Store className="h-4 w-4" />
                    Marketplace
                  </DropdownMenuItem>
                </Link>
                <Link href="/my-bookings">
                  <DropdownMenuItem className="gap-2 cursor-pointer" data-testid="menu-item-bookings">
                    <CalendarCheck className="h-4 w-4" />
                    My Bookings
                  </DropdownMenuItem>
                </Link>
                {activeRole === "ASSISTANT" && (
                  <Link href="/billing">
                    <DropdownMenuItem className="gap-2 cursor-pointer" data-testid="menu-item-billing">
                      <IconSpending size={16} />
                      Billing
                    </DropdownMenuItem>
                  </Link>
                )}

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  className="gap-2 cursor-pointer"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  data-testid="menu-item-theme"
                >
                  {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  {theme === "dark" ? "Light Mode" : "Dark Mode"}
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="gap-2 text-destructive focus:text-destructive"
                  onClick={() => logout()}
                  data-testid="menu-item-logout"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
