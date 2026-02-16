import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, versionedUrl } from "@/lib/queryClient";
import { Home, Users, CheckCircle, XCircle, Clock } from "lucide-react";

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [accepted, setAccepted] = useState(false);

  const { data: inviteInfo, isLoading, error } = useQuery({
    queryKey: ["/api/invites", token, "info"],
    queryFn: async () => {
      const response = await fetch(versionedUrl(`/api/invites/${token}/info`));
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to fetch invite");
      }
      return response.json();
    },
    enabled: !!token,
  });

  const acceptMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/invites/${token}/accept`, {}),
    onSuccess: (data: any) => {
      setAccepted(true);
      toast({ title: "Welcome!", description: "You've joined the household successfully." });
      localStorage.setItem("activeHouseholdId", data.householdId);
      setTimeout(() => setLocation("/"), 1500);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to accept invite", variant: "destructive" });
    },
  });

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <CardTitle>Invalid Invite</CardTitle>
            <CardDescription>
              {(error as Error).message || "This invite link is invalid or has expired."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              className="w-full" 
              variant="outline"
              onClick={() => setLocation("/")}
              data-testid="button-go-home"
            >
              <Home className="h-4 w-4 mr-2" />
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
            <CardTitle>Welcome!</CardTitle>
            <CardDescription>
              You've successfully joined {inviteInfo?.householdName}. Redirecting...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Users className="h-12 w-12 text-primary mx-auto mb-4" />
            <CardTitle>Join {inviteInfo?.householdName}</CardTitle>
            <CardDescription>
              You've been invited to join as a {inviteInfo?.role?.toLowerCase()}.
              Please sign in to accept this invitation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              className="w-full" 
              onClick={() => window.location.href = `/api/login?returnTo=/join/${token}`}
              data-testid="button-sign-in-join"
            >
              Sign In to Join
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Users className="h-12 w-12 text-primary mx-auto mb-4" />
          <CardTitle>Join {inviteInfo?.householdName}</CardTitle>
          <CardDescription>
            You've been invited to join as a <span className="font-medium">{inviteInfo?.role?.toLowerCase()}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Expires: {inviteInfo?.expiresAt ? new Date(inviteInfo.expiresAt).toLocaleDateString() : "N/A"}</span>
          </div>
          
          <Button 
            className="w-full" 
            onClick={() => acceptMutation.mutate()}
            disabled={acceptMutation.isPending}
            data-testid="button-accept-invite"
          >
            {acceptMutation.isPending ? "Joining..." : "Accept Invitation"}
          </Button>
          
          <Button 
            variant="outline" 
            className="w-full"
            onClick={() => setLocation("/")}
            data-testid="button-decline-invite"
          >
            Decline
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
