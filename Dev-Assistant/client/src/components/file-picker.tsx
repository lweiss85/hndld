import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Plus,
  Upload,
  Search,
  File,
  FileText,
  Image as ImageIcon,
  Video,
  X,
  Check,
  Link2,
  Camera,
} from "lucide-react";
import { format } from "date-fns";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PhotoCapture } from "@/components/photo-capture";

const FILE_CATEGORIES = ["ALL", "RECEIPT", "DOCUMENT", "PHOTO", "VIDEO", "OTHER"];

interface FileItem {
  id: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  category: string;
  publicUrl: string;
  uploadedAt: string;
  linkedCount: number;
}

interface FilePickerProps {
  entityType: string;
  entityId: string;
  onFilesChanged?: () => void;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return ImageIcon;
  if (mimeType.startsWith("video/")) return Video;
  if (mimeType === "application/pdf") return FileText;
  return File;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FilePicker({ entityType, entityId, onFilesChanged }: FilePickerProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showPickerDialog, setShowPickerDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [isUploading, setIsUploading] = useState(false);

  const { data: linkedFiles, refetch: refetchLinked } = useQuery<FileItem[]>({
    queryKey: ["/api/files/entity", entityType, entityId],
    queryFn: async () => {
      const res = await fetch(`/api/files/entity/${entityType}/${entityId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch files");
      return res.json();
    },
  });

  const { data: libraryData, isLoading: libraryLoading } = useQuery<{
    files: FileItem[];
    total: number;
  }>({
    queryKey: ["/api/files", categoryFilter, "picker"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (categoryFilter !== "ALL") params.set("category", categoryFilter);
      params.set("limit", "100");
      const res = await fetch(`/api/files?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch files");
      return res.json();
    },
    enabled: showPickerDialog,
  });

  const linkMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const res = await fetch(`/api/files/${fileId}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ entityType, entityId }),
      });
      if (!res.ok) throw new Error("Failed to link file");
      return res.json();
    },
    onSuccess: () => {
      refetchLinked();
      onFilesChanged?.();
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const res = await fetch(`/api/files/${fileId}/link/${entityType}/${entityId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to unlink file");
      return res.json();
    },
    onSuccess: () => {
      refetchLinked();
      onFilesChanged?.();
      toast({ title: "File removed" });
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", "OTHER");
      formData.append("linkTo", JSON.stringify({ entityType, entityId }));

      const res = await fetch("/api/files/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");

      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      refetchLinked();
      onFilesChanged?.();
      toast({ title: "File uploaded and attached" });
    } catch (err) {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleLinkSelected = async () => {
    const filesToLink = Array.from(selectedFiles);
    for (const fileId of filesToLink) {
      await linkMutation.mutateAsync(fileId);
    }
    setSelectedFiles(new Set());
    setShowPickerDialog(false);
    toast({ title: `${filesToLink.length} file(s) attached` });
  };

  const toggleFileSelection = (fileId: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const linkedFileIds = new Set(linkedFiles?.map((f) => f.id) || []);
  const availableFiles =
    libraryData?.files?.filter(
      (f) =>
        !linkedFileIds.has(f.id) &&
        f.filename.toLowerCase().includes(searchQuery.toLowerCase())
    ) || [];

  return (
    <div className="space-y-3">
      {linkedFiles && linkedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {linkedFiles.map((file) => {
            const Icon = getFileIcon(file.mimeType);
            const isImage = file.mimeType.startsWith("image/");

            return (
              <div
                key={file.id}
                className="group relative rounded-md border bg-muted/50 p-2 flex items-center gap-2"
                data-testid={`attached-file-${file.id}`}
              >
                {isImage ? (
                  <img
                    src={file.publicUrl}
                    alt={file.filename}
                    className="h-8 w-8 rounded object-cover"
                  />
                ) : (
                  <Icon className="h-5 w-5 text-muted-foreground" />
                )}
                <span className="text-sm truncate max-w-[120px]">{file.filename}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => unlinkMutation.mutate(file.id)}
                      data-testid={`button-remove-file-${file.id}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Remove file</TooltipContent>
                </Tooltip>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowPickerDialog(true)}
          data-testid="button-pick-file"
        >
          <Link2 className="h-4 w-4 mr-1" />
          Attach File
        </Button>
        <PhotoCapture
          onPhotoCapture={async (file) => {
            setIsUploading(true);
            try {
              const formData = new FormData();
              formData.append("file", file);
              formData.append("category", "PHOTO");
              formData.append("linkTo", JSON.stringify({ entityType, entityId }));

              const res = await fetch("/api/files/upload", {
                method: "POST",
                credentials: "include",
                body: formData,
              });

              if (!res.ok) throw new Error("Upload failed");

              queryClient.invalidateQueries({ queryKey: ["/api/files"] });
              refetchLinked();
              onFilesChanged?.();
              toast({ title: "Photo captured and attached" });
            } catch (err) {
              toast({ title: "Failed to capture photo", variant: "destructive" });
            } finally {
              setIsUploading(false);
            }
          }}
          disabled={isUploading}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          data-testid="button-upload-new"
        >
          <Upload className="h-4 w-4 mr-1" />
          {isUploading ? "Uploading..." : "Upload"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileUpload}
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
        />
      </div>

      <Dialog open={showPickerDialog} onOpenChange={setShowPickerDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Attach Files</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-picker"
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-32" data-testid="select-picker-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FILE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat === "ALL" ? "All" : cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="max-h-64 overflow-y-auto space-y-1">
              {libraryLoading ? (
                <>
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </>
              ) : availableFiles.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No files available to attach
                </p>
              ) : (
                availableFiles.map((file) => {
                  const Icon = getFileIcon(file.mimeType);
                  const isSelected = selectedFiles.has(file.id);

                  return (
                    <div
                      key={file.id}
                      className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
                        isSelected ? "bg-primary/10 border border-primary" : "hover-elevate"
                      }`}
                      onClick={() => toggleFileSelection(file.id)}
                      data-testid={`picker-file-${file.id}`}
                    >
                      <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0">
                        {file.mimeType.startsWith("image/") ? (
                          <img
                            src={file.publicUrl}
                            alt={file.filename}
                            className="object-cover w-full h-full rounded"
                          />
                        ) : (
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(file.fileSize)}
                        </p>
                      </div>
                      {isSelected && (
                        <Check className="h-4 w-4 text-primary shrink-0" />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPickerDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleLinkSelected}
              disabled={selectedFiles.size === 0 || linkMutation.isPending}
              data-testid="button-confirm-attach"
            >
              Attach {selectedFiles.size > 0 && `(${selectedFiles.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AttachedFilesPreview({
  entityType,
  entityId,
}: {
  entityType: string;
  entityId: string;
}) {
  const { data: files } = useQuery<FileItem[]>({
    queryKey: ["/api/files/entity", entityType, entityId],
    queryFn: async () => {
      const res = await fetch(`/api/files/entity/${entityType}/${entityId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch files");
      return res.json();
    },
  });

  if (!files || files.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      <File className="h-3 w-3 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">{files.length}</span>
    </div>
  );
}
