import { useState } from "react";
import { HandledIllustration } from "@/components/illustrations";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { 
  Plus, 
  MessageSquare,
  X,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import type { Update, Comment, InsertUpdate } from "@shared/schema";
import { queryClient, apiRequest, versionedUrl } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/lib/user-context";
import { PageTransition, StaggeredList, triggerHaptic } from "@/components/juice";
import { UpdateCard } from "@/components/updates/UpdateCard";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { PullToRefreshIndicator } from "@/components/pull-to-refresh";
import { PhotoCapture } from "@/components/photo-capture";
import { useActiveServiceType } from "@/hooks/use-active-service-type";
import { withServiceType } from "@/lib/serviceUrl";

interface UpdateWithComments extends Update {
  comments?: Comment[];
}

function UpdatesSkeleton() {
  return (
    <div className="px-4 py-6 space-y-4 max-w-4xl mx-auto" aria-busy="true">
      <Skeleton className="h-8 w-40" />
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-48" />
      ))}
    </div>
  );
}

export default function Updates() {
  const { toast } = useToast();
  const { activeRole } = useUser();
  const { activeServiceType } = useActiveServiceType();
  const [selectedUpdate, setSelectedUpdate] = useState<UpdateWithComments | null>(null);
  const [newComment, setNewComment] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newUpdate, setNewUpdate] = useState<Partial<InsertUpdate>>({
    text: "",
  });
  const [uploadedImages, setUploadedImages] = useState<{ url: string; id: string }[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const updatesUrl = withServiceType("/api/updates", activeServiceType);

  const { data: updates, isLoading } = useQuery<UpdateWithComments[]>({
    queryKey: [updatesUrl],
  });

  const handlePhotoUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", "OTHER");
      
      const response = await fetch(versionedUrl("/api/files/upload"), {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Upload failed");
      }
      
      const uploadedFile = await response.json();
      const imageUrl = uploadedFile.publicUrl || uploadedFile.storagePath;
      setUploadedImages(prev => [...prev, { url: imageUrl, id: uploadedFile.id }]);
      triggerHaptic("light");
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const removeImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
  };

  const createUpdateMutation = useMutation({
    mutationFn: async (data: Partial<InsertUpdate>) => {
      return apiRequest("POST", "/api/updates", { ...data, images: uploadedImages.map(img => img.url), serviceType: activeServiceType });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [updatesUrl] });
      setShowCreateDialog(false);
      setNewUpdate({ text: "" });
      setUploadedImages([]);
      toast({
        title: "Update posted",
        description: "Your update is now visible to the household",
      });
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async ({ entityId, text }: { entityId: string; text: string }) => {
      return apiRequest("POST", "/api/comments", {
        entityType: "UPDATE",
        entityId,
        text,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [updatesUrl] });
      setNewComment("");
    },
  });

  const { isRefreshing, pullDistance, threshold, progress } = usePullToRefresh({
    onRefresh: async () => {
      triggerHaptic("medium");
      await queryClient.invalidateQueries({ queryKey: [updatesUrl] });
    },
  });

  if (isLoading) return <UpdatesSkeleton />;

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
        <h1 className="font-display text-3xl font-light tracking-tight" data-testid="text-page-title">Updates</h1>
        {(activeRole === "ASSISTANT" || (activeRole === "STAFF" && activeServiceType === "CLEANING")) && (
          <Button size="sm" onClick={() => setShowCreateDialog(true)} data-testid="button-create-update">
            <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
            Post
          </Button>
        )}
      </div>

      {updates?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <HandledIllustration size={56} className="mb-5 opacity-40" />
          <h3 className="font-display text-xl font-light tracking-tight text-foreground mb-1.5">You're all caught up</h3>
          <p className="text-sm text-muted-foreground max-w-[300px] leading-relaxed">
            New updates and conversations will appear here.
          </p>
        </div>
      ) : (
        <StaggeredList className="space-y-4" aria-label="Updates list">
          {updates?.map((update) => (
            <UpdateCard
              key={update.id}
              update={update}
              onCommentClick={setSelectedUpdate}
            />
          ))}
        </StaggeredList>
      )}

      <Dialog open={!!selectedUpdate} onOpenChange={() => setSelectedUpdate(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Comments</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-3">
            {selectedUpdate?.comments?.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No comments yet. Share your thoughts.
              </p>
            )}
            {selectedUpdate?.comments?.map((comment) => (
              <div key={comment.id} className="p-3 rounded-md bg-muted/50">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium">User</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(comment.createdAt!), "MMM d, h:mm a")}
                  </span>
                </div>
                <p className="text-sm">{comment.text}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-2 border-t">
            <Textarea
              placeholder="Write a comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="text-sm resize-none"
              rows={2}
              data-testid="input-comment"
            />
            <Button
              size="icon"
              onClick={() => {
                if (selectedUpdate && newComment.trim()) {
                  addCommentMutation.mutate({
                    entityId: selectedUpdate.id,
                    text: newComment,
                  });
                }
              }}
              disabled={!newComment.trim() || addCommentMutation.isPending}
              aria-label="Add comment"
              data-testid="button-add-comment"
            >
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        setShowCreateDialog(open);
        if (!open) {
          setUploadedImages([]);
          setNewUpdate({ text: "" });
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Post Update</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="What's the update?"
              value={newUpdate.text || ""}
              onChange={(e) => setNewUpdate({ ...newUpdate, text: e.target.value })}
              rows={4}
              className="text-base"
              data-testid="input-update-text"
            />
            
            {uploadedImages.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {uploadedImages.map((img, index) => (
                  <div key={img.id} className="relative aspect-square">
                    <img 
                      src={img.url} 
                      alt={`Uploaded photo ${index + 1}`} 
                      className="w-full h-full object-cover rounded-md"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      className="absolute top-1 right-1 p-1"
                      onClick={() => removeImage(index)}
                      aria-label={`Remove photo ${index + 1}`}
                      data-testid={`button-remove-image-${index}`}
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <PhotoCapture
                onPhotoCapture={handlePhotoUpload}
                disabled={isUploading}
                buttonVariant="outline"
                buttonSize="sm"
                showLabel
              />
              {isUploading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Uploading...
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => createUpdateMutation.mutate(newUpdate)}
              disabled={!newUpdate.text || createUpdateMutation.isPending}
              className="w-full"
              data-testid="button-post-update"
            >
              Post Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PageTransition>
  );
}
