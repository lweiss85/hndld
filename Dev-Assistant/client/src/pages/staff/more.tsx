import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  User,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { Link } from "wouter";
import { useUser } from "@/lib/user-context";

export default function StaffMore() {
  const { userProfile } = useUser();

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  return (
    <div className="px-4 py-6 space-y-6 max-w-4xl mx-auto pb-24">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">More</h1>
        <p className="text-muted-foreground text-sm">
          Settings and account
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-foreground">
                Staff Member
              </p>
              <p className="text-sm text-muted-foreground">
                Staff
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <Link href="/profile">
          <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-muted-foreground" />
                  <span className="text-foreground">Profile Settings</span>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="pt-4">
        <Button 
          variant="outline" 
          className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>

      <div className="text-center text-xs text-muted-foreground pt-4">
        <p>hndld Staff Portal</p>
        <p className="mt-1">Version 1.0.0</p>
      </div>
    </div>
  );
}
