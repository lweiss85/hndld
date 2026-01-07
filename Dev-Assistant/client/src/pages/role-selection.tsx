import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Briefcase, Users, Home } from "lucide-react";

export default function RoleSelection() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const selectRoleMutation = useMutation({
    mutationFn: async (role: "ASSISTANT" | "CLIENT") => {
      return apiRequest("POST", "/api/user/role", { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-profile"] });
      setLocation("/");
    },
    onError: () => {
      toast({ title: "Failed to set role", variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex flex-col">
      <header className="p-6">
        <h1 className="text-2xl font-bold" data-testid="text-landing-title">hndld</h1>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-20">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 mb-4">
              <Home className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight" data-testid="text-role-heading">
              Welcome to hndld
            </h2>
            <p className="text-muted-foreground text-lg">
              How will you be using the app?
            </p>
          </div>

          <div className="space-y-4">
            <Card 
              className="hover-elevate cursor-pointer border-2 border-transparent hover:border-primary/20"
              onClick={() => selectRoleMutation.mutate("ASSISTANT")}
              data-testid="card-role-assistant"
            >
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Briefcase className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">I'm a Household Assistant</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      I manage households professionally - handling tasks, calendars, vendors, and daily operations for families.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card 
              className="hover-elevate cursor-pointer border-2 border-transparent hover:border-primary/20"
              onClick={() => selectRoleMutation.mutate("CLIENT")}
              data-testid="card-role-client"
            >
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
                    <Users className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">I'm a Family Member</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      I want to stay updated on household tasks, approve items, and communicate with my assistant.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {selectRoleMutation.isPending && (
            <div className="text-center text-muted-foreground">
              Setting up your account...
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
