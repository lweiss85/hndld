import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  CalendarDays, 
  CheckCircle2, 
  Star,
  ChevronRight,
  Plus,
  Sparkles
} from "lucide-react";
import { format, isPast } from "date-fns";
import { Link } from "wouter";
import { PageTransition, StaggeredList } from "@/components/juice";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CleaningVisit {
  id: string;
  scheduledAt: string;
  completedAt?: string;
  status: string;
  notes?: string;
  rating?: number;
  cleanerName?: string;
  addonsRequested?: string[];
  totalPriceInCents?: number;
}

function ScheduleSkeleton() {
  return (
    <div className="px-4 py-6 space-y-4 max-w-4xl mx-auto">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-6 w-32" />
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-24" />
      ))}
    </div>
  );
}

export default function Schedule() {
  const { toast } = useToast();

  const { data: visits, isLoading } = useQuery<CleaningVisit[]>({
    queryKey: ["/api/cleaning/visits"],
  });

  const requestExtraMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/requests", {
        title: "Request Extra Cleaning Visit",
        description: "I would like to schedule an additional cleaning visit.",
        category: "HOUSEHOLD",
        urgency: "MEDIUM",
      });
    },
    onSuccess: () => {
      toast({
        title: "Request sent",
        description: "Your cleaning team will reach out to schedule.",
      });
    },
  });

  if (isLoading) return <ScheduleSkeleton />;

  const now = new Date();
  const upcomingVisits = visits
    ?.filter(v => !isPast(new Date(v.scheduledAt)) && v.status !== "COMPLETED")
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()) || [];
  const pastVisits = visits
    ?.filter(v => v.status === "COMPLETED" || isPast(new Date(v.scheduledAt)))
    .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()) || [];
  const nextVisit = upcomingVisits[0];

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  return (
    <PageTransition>
      <div className="px-4 py-6 space-y-6 max-w-4xl mx-auto pb-24">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Schedule</h1>
        </div>

        {nextVisit ? (
          <Card className="overflow-hidden">
            <div className="bg-gradient-to-br from-primary/10 to-primary/5 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Next Cleaning</p>
                  <p className="text-2xl font-bold">
                    {format(new Date(nextVisit.scheduledAt), "EEEE")}
                  </p>
                  <p className="text-lg text-muted-foreground">
                    {format(new Date(nextVisit.scheduledAt), "MMMM d, yyyy")}
                  </p>
                  <p className="text-sm font-medium mt-2">
                    {format(new Date(nextVisit.scheduledAt), "h:mm a")}
                  </p>
                </div>
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <CalendarDays className="h-8 w-8 text-primary" />
                </div>
              </div>
              
              {nextVisit.cleanerName && (
                <p className="text-sm text-muted-foreground mt-4">
                  Cleaner: <span className="font-medium text-foreground">{nextVisit.cleanerName}</span>
                </p>
              )}
              
              <div className="flex gap-2 mt-4">
                <Button asChild className="flex-1">
                  <Link href="/addons">
                    <Sparkles className="h-4 w-4 mr-2" />
                    Add Services
                  </Link>
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-6 text-center">
              <CalendarDays className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
              <h3 className="font-medium mb-1">No upcoming cleanings</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Request a cleaning to get started
              </p>
              <Button 
                onClick={() => requestExtraMutation.mutate()}
                disabled={requestExtraMutation.isPending}
              >
                <Plus className="h-4 w-4 mr-2" />
                Request Cleaning
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-3">
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={() => requestExtraMutation.mutate()}
            disabled={requestExtraMutation.isPending}
          >
            <Plus className="h-4 w-4 mr-2" />
            Book Extra
          </Button>
          <Button variant="outline" className="flex-1" asChild>
            <Link href="/messages">
              <ChevronRight className="h-4 w-4 mr-2" />
              Message Team
            </Link>
          </Button>
        </div>

        {upcomingVisits.length > 1 && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Upcoming ({upcomingVisits.length - 1} more)
            </h2>
            <StaggeredList className="space-y-2">
              {upcomingVisits.slice(1).map((visit) => (
                <Card key={visit.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                          <CalendarDays className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium">
                            {format(new Date(visit.scheduledAt), "EEE, MMM d")}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(visit.scheduledAt), "h:mm a")}
                          </p>
                        </div>
                      </div>
                      <Badge variant="secondary">Scheduled</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </StaggeredList>
          </div>
        )}

        {pastVisits.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Past Cleanings
            </h2>
            <StaggeredList className="space-y-2">
              {pastVisits.slice(0, 10).map((visit) => (
                <Card key={visit.id} className="opacity-80">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                          <p className="font-medium">
                            {format(new Date(visit.scheduledAt), "EEE, MMM d, yyyy")}
                          </p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            {visit.rating && (
                              <span className="flex items-center gap-1">
                                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                                {visit.rating}
                              </span>
                            )}
                            {visit.cleanerName && (
                              <span>{visit.cleanerName}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      {visit.totalPriceInCents && (
                        <span className="text-sm font-medium">
                          {formatPrice(visit.totalPriceInCents)}
                        </span>
                      )}
                    </div>
                    {visit.notes && (
                      <p className="text-sm text-muted-foreground mt-2 pl-13">
                        {visit.notes}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </StaggeredList>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
