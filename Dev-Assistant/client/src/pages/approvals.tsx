import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { 
  Check, 
  CheckCircle,
  X, 
  MessageSquare, 
  DollarSign, 
  Link as LinkIcon,
  Image as ImageIcon,
  Plus,
  Receipt,
  ArrowRight
} from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";
import type { Approval, Comment, InsertApproval, SpendingItem } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/lib/user-context";
import { QuickReactions } from "@/components/quick-reactions";
import { PageTransition, StaggeredList, triggerHaptic } from "@/components/juice";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { PullToRefreshIndicator } from "@/components/pull-to-refresh";
import { useActiveServiceType } from "@/hooks/use-active-service-type";
import { withServiceType } from "@/lib/serviceUrl";

interface ApprovalWithComments extends Approval {
  comments?: Comment[];
}

function ApprovalsSkeleton() {
  return (
    <div className="px-4 py-6 space-y-4 max-w-4xl mx-auto">
      <Skeleton className="h-8 w-40" />
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-40" />
      ))}
    </div>
  );
}

export default function Approvals() {
  const { toast } = useToast();
  const { activeRole } = useUser();
  const { activeServiceType } = useActiveServiceType();
  const [selectedApproval, setSelectedApproval] = useState<ApprovalWithComments | null>(null);
  const [newComment, setNewComment] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newApproval, setNewApproval] = useState<Partial<InsertApproval>>({
    title: "",
    details: "",
    amount: undefined,
  });

  const approvalsUrl = withServiceType("/api/approvals", activeServiceType);
  const spendingUrl = withServiceType("/api/spending", activeServiceType);

  const { data: approvals, isLoading } = useQuery<ApprovalWithComments[]>({
    queryKey: [approvalsUrl],
  });

  const { data: spending } = useQuery<SpendingItem[]>({
    queryKey: [spendingUrl],
    enabled: activeRole === "CLIENT",
  });

  const { isRefreshing, pullDistance, threshold, progress } = usePullToRefresh({
    onRefresh: async () => {
      triggerHaptic("medium");
      await queryClient.invalidateQueries({ queryKey: [approvalsUrl] });
    },
  });

  const pendingPaymentsCount = spending?.filter(s => 
    s.status === "NEEDS_APPROVAL" || s.status === "APPROVED"
  ).length || 0;

  const updateApprovalMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "APPROVED" | "DECLINED" }) => {
      return apiRequest("PATCH", `/api/approvals/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [approvalsUrl] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      setSelectedApproval(null);
      toast({
        title: "Success",
        description: "Approval updated",
      });
    },
  });

  const createApprovalMutation = useMutation({
    mutationFn: async (data: Partial<InsertApproval>) => {
      return apiRequest("POST", "/api/approvals", { ...data, serviceType: activeServiceType });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [approvalsUrl] });
      setShowCreateDialog(false);
      setNewApproval({ title: "", details: "", amount: undefined });
      toast({
        title: "Success",
        description: "Approval request created",
      });
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async ({ entityId, text }: { entityId: string; text: string }) => {
      return apiRequest("POST", "/api/comments", {
        entityType: "APPROVAL",
        entityId,
        text,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [approvalsUrl] });
      setNewComment("");
    },
  });

  if (isLoading) return <ApprovalsSkeleton />;

  const pendingApprovals = approvals?.filter(a => a.status === "PENDING") || [];
  const pastApprovals = approvals?.filter(a => a.status !== "PENDING") || [];

  return (
    <PageTransition className="relative">
      <PullToRefreshIndicator
        pullDistance={pullDistance}
        threshold={threshold}
        isRefreshing={isRefreshing}
        progress={progress}
      />
    <div className="px-4 py-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4 animate-fade-in-up">
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Approvals</h1>
        {activeRole === "ASSISTANT" && (
          <Button size="sm" onClick={() => setShowCreateDialog(true)} data-testid="button-create-approval">
            <Plus className="h-4 w-4 mr-1" />
            New
          </Button>
        )}
      </div>

      {activeRole === "CLIENT" && pendingPaymentsCount > 0 && (
        <Link href="/spending">
          <Card className="hover-elevate cursor-pointer bg-primary/5 border-primary/20" data-testid="card-money-shortcut">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Receipt className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Payments waiting</p>
                    <p className="text-sm text-muted-foreground">
                      {pendingPaymentsCount} item{pendingPaymentsCount !== 1 ? "s" : ""} need attention
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{pendingPaymentsCount}</Badge>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      )}

      {pendingApprovals.length === 0 && pastApprovals.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle className="w-12 h-12 text-green-500 mb-3" />
            <p className="font-medium">All caught up.</p>
            <p className="text-sm text-muted-foreground">Everything's hndld.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {pendingApprovals.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Pending ({pendingApprovals.length})
              </h2>
              <StaggeredList className="space-y-3">
              {pendingApprovals.map((approval) => (
                <Card 
                  key={approval.id} 
                  className="hover-elevate cursor-pointer rounded-2xl"
                  onClick={() => setSelectedApproval(approval)}
                  data-testid={`card-approval-${approval.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium truncate">{approval.title}</h3>
                        {approval.details && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                            {approval.details}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          {approval.amount && (
                            <span className="flex items-center gap-1">
                              <DollarSign className="h-3 w-3" />
                              {(approval.amount / 100).toFixed(2)}
                            </span>
                          )}
                          {(approval.links as string[])?.length > 0 && (
                            <span className="flex items-center gap-1">
                              <LinkIcon className="h-3 w-3" />
                              {(approval.links as string[]).length}
                            </span>
                          )}
                          {(approval.images as string[])?.length > 0 && (
                            <span className="flex items-center gap-1">
                              <ImageIcon className="h-3 w-3" />
                              {(approval.images as string[]).length}
                            </span>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-amber-600 border-amber-500/30 shrink-0">
                        Pending
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
              </StaggeredList>
            </div>
          )}

          {pastApprovals.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Past
              </h2>
              {pastApprovals.map((approval) => (
                <Card 
                  key={approval.id} 
                  className="opacity-75 rounded-2xl"
                  onClick={() => setSelectedApproval(approval)}
                  data-testid={`card-approval-${approval.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium truncate">{approval.title}</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(approval.updatedAt!), "MMM d, yyyy")}
                        </p>
                      </div>
                      <Badge 
                        variant={approval.status === "APPROVED" ? "default" : "destructive"}
                        className="shrink-0"
                      >
                        {approval.status === "APPROVED" ? "Approved" : "Declined"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog open={!!selectedApproval} onOpenChange={() => setSelectedApproval(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedApproval?.title}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {selectedApproval?.amount && (
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-muted-foreground" />
                <span className="text-2xl font-bold">
                  ${(selectedApproval.amount / 100).toFixed(2)}
                </span>
              </div>
            )}

            {selectedApproval?.details && (
              <p className="text-sm text-muted-foreground">{selectedApproval.details}</p>
            )}

            {(selectedApproval?.images as string[])?.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {(selectedApproval?.images as string[])?.map((img, i) => (
                  <img 
                    key={i} 
                    src={img} 
                    alt="" 
                    className="rounded-md w-full aspect-square object-cover"
                  />
                ))}
              </div>
            )}

            {selectedApproval?.status === "PENDING" && (
              <div className="flex gap-2">
                <Button 
                  className="flex-1" 
                  onClick={() => updateApprovalMutation.mutate({ 
                    id: selectedApproval.id, 
                    status: "APPROVED" 
                  })}
                  disabled={updateApprovalMutation.isPending}
                  data-testid="button-approve"
                >
                  <Check className="h-4 w-4 mr-1" />
                  Approve
                </Button>
                <Button 
                  variant="destructive" 
                  className="flex-1"
                  onClick={() => updateApprovalMutation.mutate({ 
                    id: selectedApproval.id, 
                    status: "DECLINED" 
                  })}
                  disabled={updateApprovalMutation.isPending}
                  data-testid="button-decline"
                >
                  <X className="h-4 w-4 mr-1" />
                  Decline
                </Button>
              </div>
            )}

            {selectedApproval && selectedApproval.status !== "PENDING" && (
              <div className="pt-2">
                <label className="text-sm font-medium mb-2 block">Reactions</label>
                <QuickReactions entityType="APPROVAL" entityId={selectedApproval.id} />
              </div>
            )}

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Comments
              </h4>
              <div className="space-y-2 mb-3">
                {selectedApproval?.comments?.length === 0 && (
                  <p className="text-sm text-muted-foreground">No comments yet</p>
                )}
                {selectedApproval?.comments?.map((comment) => (
                  <div key={comment.id} className="p-2 rounded-md bg-muted/50 text-sm">
                    {comment.text}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Textarea
                  placeholder="Add a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="text-sm resize-none"
                  rows={2}
                  data-testid="input-comment"
                />
                <Button
                  size="icon"
                  onClick={() => {
                    if (selectedApproval && newComment.trim()) {
                      addCommentMutation.mutate({
                        entityId: selectedApproval.id,
                        text: newComment,
                      });
                    }
                  }}
                  disabled={!newComment.trim() || addCommentMutation.isPending}
                  data-testid="button-add-comment"
                >
                  <MessageSquare className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request Approval</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Input
                placeholder="Title"
                value={newApproval.title || ""}
                onChange={(e) => setNewApproval({ ...newApproval, title: e.target.value })}
                data-testid="input-approval-title"
              />
            </div>
            <div>
              <Textarea
                placeholder="Details..."
                value={newApproval.details || ""}
                onChange={(e) => setNewApproval({ ...newApproval, details: e.target.value })}
                rows={3}
                data-testid="input-approval-details"
              />
            </div>
            <div>
              <Input
                type="number"
                placeholder="Amount (optional)"
                value={newApproval.amount ? (newApproval.amount / 100).toString() : ""}
                onChange={(e) => setNewApproval({ 
                  ...newApproval, 
                  amount: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : undefined 
                })}
                data-testid="input-approval-amount"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => createApprovalMutation.mutate(newApproval)}
              disabled={!newApproval.title || createApprovalMutation.isPending}
              data-testid="button-submit-approval"
            >
              Submit for Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PageTransition>
  );
}
