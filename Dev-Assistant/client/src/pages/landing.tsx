import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Home, CheckSquare, Calendar, Users } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex flex-col">
      <header className="p-6">
        <h1 className="text-2xl font-bold" data-testid="text-landing-title">hndld</h1>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-20">
        <div className="max-w-md w-full space-y-8 text-center">
          <div className="space-y-4">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 mb-4">
              <Home className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight" data-testid="text-hero-heading">
              Your Household, Simplified
            </h2>
            <p className="text-muted-foreground text-lg">
              Coordinate tasks, approvals, and updates with your household assistant in one seamless app.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Card className="border-0 bg-card/50">
              <CardContent className="p-4 flex flex-col items-center gap-2">
                <CheckSquare className="h-6 w-6 text-primary" />
                <span className="text-sm font-medium">Quick Approvals</span>
              </CardContent>
            </Card>
            <Card className="border-0 bg-card/50">
              <CardContent className="p-4 flex flex-col items-center gap-2">
                <Calendar className="h-6 w-6 text-primary" />
                <span className="text-sm font-medium">Calendar Sync</span>
              </CardContent>
            </Card>
            <Card className="border-0 bg-card/50">
              <CardContent className="p-4 flex flex-col items-center gap-2">
                <Users className="h-6 w-6 text-primary" />
                <span className="text-sm font-medium">Team Updates</span>
              </CardContent>
            </Card>
            <Card className="border-0 bg-card/50">
              <CardContent className="p-4 flex flex-col items-center gap-2">
                <Home className="h-6 w-6 text-primary" />
                <span className="text-sm font-medium">Vendor Mgmt</span>
              </CardContent>
            </Card>
          </div>

          <div className="pt-4">
            <Button 
              size="lg" 
              className="w-full text-base font-semibold h-12"
              onClick={() => window.location.href = "/api/login"}
              data-testid="button-login"
            >
              Get Started
            </Button>
            <p className="text-xs text-muted-foreground mt-3">
              Sign in with Google, GitHub, or email
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
