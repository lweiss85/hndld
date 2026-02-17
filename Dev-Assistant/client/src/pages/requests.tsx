import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Plus, 
  Clock, 
  MessageSquare,
  Tag,
  AlertTriangle,
  CheckCircle2,
  X,
  Image as ImageIcon
} from "lucide-react";
import { format } from "date-fns";
import { DateTimePicker } from "@/components/date-time-picker";
import type { Request as RequestType, InsertRequest } from "@shared/schema";
import { queryClient, apiRequest, versionedUrl } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { QuickRequestButtons } from "@/components/quick-request-buttons";
import { PhotoCapture } from "@/components/photo-capture";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { PullToRefreshIndicator } from "@/components/pull-to-refresh";
import { PageTransition, triggerHaptic } from "@/components/juice";
import { RequestStatusTimeline } from "@/components/status-timeline";

const CATEGORIES = [
  { value: "HOUSEHOLD", label: "Household" },
  { value: "ERRANDS", label: "Errands" },
  { value: "MAINTENANCE", label: "Maintenance" },
  { value: "GROCERIES", label: "Groceries" },
  { value: "KIDS", label: "Kids" },
  { value: "PETS", label: "Pets" },
  { value: "EVENTS", label: "Events" },
  { value: "OTHER", label: "Other" },
];

const URGENCY_LEVELS = [
  { value: "LOW", label: "Low", color: "text-green-600" },
  { value: "MEDIUM", label: "Medium", color: "text-amber-600" },
  { value: "HIGH", label: "High", color: "text-red-600" },
];

function RequestsSkeleton() {
  return (
    <div className="px-4 py-6 space-y-4 max-w-4xl mx-auto" aria-busy="true">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-12 w-full" />
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-24" />
      ))}
    </div>
  );
}

export default function Requests() {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newRequest, setNewRequest] = useState<Partial<InsertRequest>>({
    title: "",
    description: "",
    category: "OTHER",
    urgency: "MEDIUM",
  });
  const [pendingPhotos, setPendingPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);

  const { data: requests, isLoading } = useQuery<RequestType[]>({
    queryKey: ["/api/requests"],
  });

  const { isRefreshing, pullDistance, threshold, progress } = usePullToRefresh({
    onRefresh: async () => {
      triggerHaptic("medium");
      await queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
    },
  });

  const createRequestMutation = useMutation({
    mutationFn: async (data: Partial<InsertRequest>) => {
      return apiRequest("POST", "/api/requests", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
      setShowCreateDialog(false);
      setNewRequest({
        title: "",
        description: "",
        category: "OTHER",
        urgency: "MEDIUM",
      });
      setPendingPhotos([]);
      toast({
        title: "Request sent",
        description: "Your assistant will see this shortly",
      });
    },
  });

  const handlePhotoCapture = (file: File) => {
    const preview = URL.createObjectURL(file);
    setPendingPhotos((prev) => [...prev, { file, preview }]);
  };

  const removePhoto = (index: number) => {
    setPendingPhotos((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmitRequest = async () => {
    if (!newRequest.title) return;
    
    setIsUploadingPhotos(true);
    try {
      const imageUrls: string[] = [];
      
      for (const photo of pendingPhotos) {
        const formData = new FormData();
        formData.append("file", photo.file);
        formData.append("category", "PHOTO");
        
        const res = await fetch(versionedUrl("/api/files/upload"), {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        
        if (res.ok) {
          const data = await res.json();
          imageUrls.push(data.publicUrl);
        }
      }
      
      await createRequestMutation.mutateAsync({
        ...newRequest,
        images: imageUrls,
      });
    } catch (err) {
      toast({ title: "Failed to submit request", variant: "destructive" });
    } finally {
      setIsUploadingPhotos(false);
    }
  };

  if (isLoading) return <RequestsSkeleton />;

  return (
    <PageTransition className="relative">
      <PullToRefreshIndicator
        pullDistance={pullDistance}
        threshold={threshold}
        isRefreshing={isRefreshing}
        progress={progress}
      />
    <div className="px-4 py-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Requests</h1>
      </div>

      <Button 
        size="lg" 
        className="w-full h-14 text-base font-semibold"
        onClick={() => setShowCreateDialog(true)}
        data-testid="button-ask"
      >
        <Plus className="h-5 w-5 mr-2" aria-hidden="true" />
        Ask for Something
      </Button>

      <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-4 py-3">
        <Clock className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
        <span>Your assistant typically responds within <span className="font-medium text-foreground">2 hours</span> during business hours</span>
      </div>

      <QuickRequestButtons onRequestCreated={() => queryClient.invalidateQueries({ queryKey: ["/api/requests"] })} />

      {requests?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <MessageSquare className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          </div>
          <h3 className="font-medium text-lg mb-1">No requests yet</h3>
          <p className="text-sm text-muted-foreground">
            Tap the button above to ask for something
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Pending requests */}
          {(requests?.filter(r => !r.taskId).length ?? 0) > 0 && (
            <div className="space-y-3" aria-label="Pending requests list">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Pending Requests
              </h2>
              {requests?.filter(r => !r.taskId).map((request) => (
                <Card key={request.id} data-testid={`card-request-${request.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium">{request.title}</h3>
                        {request.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                            {request.description}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">
                            <Tag className="h-3 w-3 mr-1" aria-hidden="true" />
                            {request.category}
                          </Badge>
                        </div>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        Pending
                      </Badge>
                    </div>
                    <div className="pt-3 border-t">
                      <RequestStatusTimeline 
                        createdAt={request.createdAt!} 
                        acceptedAt={null}
                        compact 
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          
          {/* Accepted requests */}
          {(requests?.filter(r => r.taskId).length ?? 0) > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                Accepted
              </h2>
              {requests?.filter(r => r.taskId).map((request) => (
                <Card key={request.id} className="border-success/30 bg-success/5" data-testid={`card-request-${request.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" aria-hidden="true" />
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium">{request.title}</h3>
                          {request.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                              {request.description}
                            </p>
                          )}
                          <p className="text-xs text-success mt-2">
                            Your assistant added this to the task list
                          </p>
                        </div>
                      </div>
                      <Badge variant="default" className="shrink-0 bg-success hover:bg-success">
                        In Progress
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Input
                placeholder="What do you need?"
                value={newRequest.title || ""}
                onChange={(e) => setNewRequest({ ...newRequest, title: e.target.value })}
                className="text-base"
                data-testid="input-request-title"
              />
            </div>
            
            <div>
              <Textarea
                placeholder="Add more details (optional)..."
                value={newRequest.description || ""}
                onChange={(e) => setNewRequest({ ...newRequest, description: e.target.value })}
                rows={3}
                data-testid="input-request-description"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Category</label>
              <Select
                value={newRequest.category || "OTHER"}
                onValueChange={(value) => setNewRequest({ ...newRequest, category: value as any })}
              >
                <SelectTrigger data-testid="select-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Urgency</label>
              <div className="flex gap-2">
                {URGENCY_LEVELS.map((level) => (
                  <Button
                    key={level.value}
                    variant={newRequest.urgency === level.value ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setNewRequest({ ...newRequest, urgency: level.value as any })}
                    data-testid={`button-urgency-${level.value.toLowerCase()}`}
                  >
                    {level.value === "HIGH" && <AlertTriangle className="h-3 w-3 mr-1" aria-hidden="true" />}
                    {level.label}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Due Date (optional)</label>
              <DateTimePicker
                value={newRequest.dueAt ? new Date(newRequest.dueAt as any) : null}
                onChange={(date) => {
                  setNewRequest({ 
                    ...newRequest, 
                    dueAt: date as any
                  });
                }}
                placeholder="Tap to select date & time"
                data-testid="input-due-date"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Photos (optional)</label>
              <div className="space-y-3">
                {pendingPhotos.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {pendingPhotos.map((photo, index) => (
                      <div key={index} className="relative group">
                        <img
                          src={photo.preview}
                          alt={`Photo ${index + 1}`}
                          className="h-16 w-16 rounded-md object-cover border"
                        />
                        <button
                          type="button"
                          onClick={() => removePhoto(index)}
                          className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label={`Remove photo ${index + 1}`}
                          data-testid={`button-remove-photo-${index}`}
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <PhotoCapture onPhotoCapture={handlePhotoCapture} />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                setPendingPhotos([]);
              }}
              data-testid="button-cancel-request"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitRequest}
              disabled={!newRequest.title || createRequestMutation.isPending || isUploadingPhotos}
              data-testid="button-submit-request"
            >
              {isUploadingPhotos ? "Uploading..." : createRequestMutation.isPending ? "Sending..." : "Send Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PageTransition>
  );
}
