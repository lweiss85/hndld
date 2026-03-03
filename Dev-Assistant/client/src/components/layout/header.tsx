import { useAuth } from "@/hooks/use-auth";
import { useUser } from "@/lib/user-context";
import { useTheme } from "@/lib/theme-provider";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Moon, Sun, LogOut, UserCircle, CreditCard, BarChart3, AlertTriangle, MessageCircle, Send, FolderOpen, Building2, Store, CalendarCheck, Search, ArrowLeftRight } from "lucide-react";
import { NotificationCenter } from "@/components/notification-center";
import { GlobalSearchDialog } from "@/components/global-search";
import { HouseholdSwitcher } from "@/components/household-switcher";
import { Link } from "wouter";
import { useState, useEffect, useCallback } from "react";

export function Header() {
  const { user, logout } = useAuth();
  const { activeRole, setActiveRole, canSwitchRoles } = useUser();
  const { theme, setTheme } = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);

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

  return (
    <>
      <header className="sticky top-0 z-40 w-full" role="banner">
        <div className="flex h-14 items-center justify-between px-4 max-w-4xl mx-auto">
          <HouseholdSwitcher />

          <div className="flex items-center gap-2">
            <NotificationCenter />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu" data-testid="button-user-menu">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || "User"} />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium">{user?.firstName} {user?.lastName}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

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

                <DropdownMenuItem
                  className="gap-2 cursor-pointer"
                  onClick={() => setSearchOpen(true)}
                  data-testid="menu-item-search"
                >
                  <Search className="h-4 w-4" />
                  Search
                </DropdownMenuItem>

                <Link href="/profile">
                  <DropdownMenuItem className="gap-2 cursor-pointer" data-testid="menu-item-profile">
                    <UserCircle className="h-4 w-4" />
                    Profile
                  </DropdownMenuItem>
                </Link>
                <Link href="/messages">
                  <DropdownMenuItem className="gap-2 cursor-pointer" data-testid="menu-item-messages">
                    <MessageCircle className="h-4 w-4" />
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
                        <Building2 className="h-4 w-4" />
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
                    <AlertTriangle className="h-4 w-4" />
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
                      <CreditCard className="h-4 w-4" />
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
