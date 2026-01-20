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
import { Moon, Sun, LogOut, UserCircle, CreditCard, BarChart3, AlertTriangle, MessageCircle, MoreHorizontal, Send, FolderOpen, Building2 } from "lucide-react";
import { NotificationCenter } from "@/components/notification-center";
import { GlobalSearchTrigger } from "@/components/global-search";
import { HouseholdSwitcher } from "@/components/household-switcher";
import { ServiceSwitcher } from "@/components/service-switcher";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "wouter";

export function Header() {
  const { user, logout } = useAuth();
  const { activeRole, setActiveRole, canSwitchRoles } = useUser();
  const { theme, setTheme } = useTheme();

  const initials = user
    ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase() || "U"
    : "?";

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur-sm">
      <div className="flex h-14 items-center justify-between gap-4 px-4 max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <Link href="/">
            <h1 className="text-xl font-semibold tracking-tight cursor-pointer hover:opacity-80 transition-opacity" data-testid="text-app-title">
              hndld
            </h1>
          </Link>
          <HouseholdSwitcher />
          <ServiceSwitcher />
          {canSwitchRoles && (
            <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-muted/50">
              <span className={`text-xs font-medium ${activeRole === "CLIENT" ? "text-foreground" : "text-muted-foreground"}`}>
                Client
              </span>
              <Switch
                checked={activeRole === "ASSISTANT"}
                onCheckedChange={(checked) => setActiveRole(checked ? "ASSISTANT" : "CLIENT")}
                data-testid="switch-role-toggle"
              />
              <span className={`text-xs font-medium ${activeRole === "ASSISTANT" ? "text-foreground" : "text-muted-foreground"}`}>
                Assistant
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <GlobalSearchTrigger />
          <NotificationCenter />
          
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" data-testid="button-more-menu">
                    <MoreHorizontal className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>More options</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>More</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {activeRole === "CLIENT" ? (
                <>
                  <Link href="/requests">
                    <DropdownMenuItem className="gap-2 cursor-pointer">
                      <Send className="h-4 w-4" />
                      Requests
                    </DropdownMenuItem>
                  </Link>
                  <Link href="/files">
                    <DropdownMenuItem className="gap-2 cursor-pointer">
                      <FolderOpen className="h-4 w-4" />
                      Files
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
                <>
                  <Link href="/messages">
                    <DropdownMenuItem className="gap-2 cursor-pointer">
                      <MessageCircle className="h-4 w-4" />
                      Messages
                    </DropdownMenuItem>
                  </Link>
                  <Link href="/files">
                    <DropdownMenuItem className="gap-2 cursor-pointer">
                      <FolderOpen className="h-4 w-4" />
                      Files
                    </DropdownMenuItem>
                  </Link>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                data-testid="button-theme-toggle"
              >
                {theme === "dark" ? (
                  <Sun className="h-5 w-5" />
                ) : (
                  <Moon className="h-5 w-5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{theme === "dark" ? "Light mode" : "Dark mode"}</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full" data-testid="button-user-menu">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || "User"} />
                      <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Account</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium">{user?.firstName} {user?.lastName}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
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
  );
}
