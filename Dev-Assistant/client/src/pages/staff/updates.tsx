import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { 
  MessageSquare,
  Plus,
  Send,
} from "lucide-react";
import { format } from "date-fns";
import { triggerHaptic } from "@/components/juice";
import type { Update } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { PullToRefreshIndicator } from "@/components/pull-to-refresh";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function UpdatesSkeleton() {
  return (
    <div className="px-4 py-6 space-y-4 max-w-4xl mx-auto">
      <Skeleton className="h-8 w-32" />
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    </div>
  );
}

function NewUpdateDialog({ 
  open, 
  onOpenChange 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
}) {
  const [text, setText] = useState("");
  const { toast } = useToast();

  const createUpdateMutation = useMutation({
    mutationFn: async (data: { text: string }) => {
      const res = await apiRequest("POST", "/api/updates", {
        text: data.text,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/updates"] });
      triggerHaptic("medium");
      toast({
        title: "Update posted",
        description: "Your update has been shared",
      });
      setText("");
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Failed to post update",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!text.trim()) return;
    createUpdateMutation.mutate({ text: text.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Post an Update</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Textarea
            placeholder="Share what you're working on or any notes..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            className="resize-none"
          />
          <div className="flex justify-end gap-2">
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!text.trim() || createUpdateMutation.isPending}
            >
              <Send className="h-4 w-4 mr-2" />
              Post
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function StaffUpdates() {
  const [showNewUpdate, setShowNewUpdate] = useState(false);

  const { data: updates, isLoading } = useQuery<Update[]>({
    queryKey: ["/api/updates"],
  });

  const { isRefreshing, pullDistance, threshold, progress } = usePullToRefresh({
    onRefresh: async () => {
      triggerHaptic("medium");
      await queryClient.invalidateQueries({ queryKey: ["/api/updates"] });
    },
  });

  if (isLoading) {
    return <UpdatesSkeleton />;
  }

  const myUpdates = updates || [];

  return (
    <div>
      <PullToRefreshIndicator 
        isRefreshing={isRefreshing} 
        pullDistance={pullDistance} 
        threshold={threshold}
        progress={progress}
      />
      <div className="px-4 py-6 space-y-6 max-w-4xl mx-auto pb-24">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Updates</h1>
            <p className="text-muted-foreground text-sm">
              Your posted updates
            </p>
          </div>
          <Button onClick={() => setShowNewUpdate(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Update
          </Button>
        </div>

        {myUpdates.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="pt-6 text-center">
              <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No updates yet</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Post an update to share what you're working on
              </p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => setShowNewUpdate(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Post your first update
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {myUpdates.map((update) => (
              <Card key={update.id}>
                <CardContent className="p-4">
                  <p className="text-foreground whitespace-pre-wrap">
                    {update.text}
                  </p>
                  <p className="text-xs text-muted-foreground mt-3">
                    {format(new Date(update.createdAt!), "MMM d, yyyy 'at' h:mm a")}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <NewUpdateDialog 
          open={showNewUpdate} 
          onOpenChange={setShowNewUpdate} 
        />
      </div>
    </div>
  );
}
