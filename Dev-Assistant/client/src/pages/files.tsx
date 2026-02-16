import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Upload,
  Search,
  Grid,
  List,
  FileText,
  Image as ImageIcon,
  File,
  Video,
  MoreVertical,
  Download,
  Trash2,
  Edit,
  Link2,
  Eye,
  Camera,
} from "lucide-react";
import { format } from "date-fns";
import { queryClient, versionedUrl } from "@/lib/queryClient";
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
  thumbnailPath?: string;
  description?: string;
  tags?: string[];
  uploadedAt: string;
  linkedCount: number;
  viewCount: number;
}

function FilesSkeleton() {
  return (
    <div className="px-4 py-6 space-y-4 max-w-4xl mx-auto">
      <Skeleton className="h-8 w-40" />
      <div className="flex gap-2">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="aspect-square" />
        ))}
      </div>
    </div>
  );
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

export default function Files() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [uploadData, setUploadData] = useState({
    file: null as File | null,
    category: "OTHER",
    description: "",
    tags: "",
  });
  const [isUploading, setIsUploading] = useState(false);

  const { data, isLoading, refetch } = useQuery<{ files: FileItem[]; total: number }>({
    queryKey: ["/api/files", categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (categoryFilter !== "ALL") params.set("category", categoryFilter);
      const res = await fetch(versionedUrl(`/api/files?${params}`), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch files");
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const res = await fetch(versionedUrl(`/api/files/${fileId}`), {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete file");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      toast({ title: "File deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete file", variant: "destructive" });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadData((prev) => ({ ...prev, file }));
      setShowUploadDialog(true);
    }
  };

  const handleUpload = async () => {
    if (!uploadData.file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadData.file);
      formData.append("category", uploadData.category);
      if (uploadData.description) formData.append("description", uploadData.description);
      if (uploadData.tags) {
        const tags = uploadData.tags.split(",").map((t) => t.trim()).filter(Boolean);
        formData.append("tags", JSON.stringify(tags));
      }

      const res = await fetch(versionedUrl("/api/files/upload"), {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");

      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      setShowUploadDialog(false);
      setUploadData({ file: null, category: "OTHER", description: "", tags: "" });
      toast({ title: "File uploaded successfully" });
    } catch (err) {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const filteredFiles =
    data?.files?.filter((f) =>
      f.filename.toLowerCase().includes(searchQuery.toLowerCase())
    ) || [];

  if (isLoading) return <FilesSkeleton />;

  return (
    <div className="px-4 py-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">
          Files
        </h1>
        <div className="flex gap-2">
          <PhotoCapture
            onPhotoCapture={(file) => {
              setUploadData((prev) => ({ ...prev, file, category: "PHOTO" }));
              setShowUploadDialog(true);
            }}
          />
          <Button size="sm" onClick={() => fileInputRef.current?.click()} data-testid="button-upload-file">
            <Upload className="h-4 w-4 mr-1" />
            Upload
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelect}
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-files"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-36" data-testid="select-category-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILE_CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat === "ALL" ? "All Categories" : cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex border rounded-md">
          <Button
            size="icon"
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            onClick={() => setViewMode("grid")}
            data-testid="button-view-grid"
          >
            <Grid className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant={viewMode === "list" ? "secondary" : "ghost"}
            onClick={() => setViewMode("list")}
            data-testid="button-view-list"
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {filteredFiles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <File className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No files yet</p>
            <p className="text-sm text-muted-foreground">
              Upload receipts, documents, and photos
            </p>
          </CardContent>
        </Card>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filteredFiles.map((file) => {
            const Icon = getFileIcon(file.mimeType);
            const isImage = file.mimeType.startsWith("image/");

            return (
              <Card
                key={file.id}
                className="overflow-visible hover-elevate cursor-pointer"
                onClick={() => {
                  setSelectedFile(file);
                  setShowDetailsDialog(true);
                }}
                data-testid={`card-file-${file.id}`}
              >
                <div className="aspect-square relative bg-muted flex items-center justify-center overflow-hidden rounded-t-md">
                  {isImage ? (
                    <img
                      src={file.publicUrl}
                      alt={file.filename}
                      className="object-cover w-full h-full"
                    />
                  ) : (
                    <Icon className="h-12 w-12 text-muted-foreground" />
                  )}
                  {file.linkedCount > 0 && (
                    <Badge className="absolute top-2 right-2" variant="secondary">
                      <Link2 className="h-3 w-3 mr-1" />
                      {file.linkedCount}
                    </Badge>
                  )}
                </div>
                <CardContent className="p-2">
                  <p className="text-sm font-medium truncate">{file.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.fileSize)}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredFiles.map((file) => {
            const Icon = getFileIcon(file.mimeType);

            return (
              <Card
                key={file.id}
                className="overflow-visible hover-elevate"
                onClick={() => {
                  setSelectedFile(file);
                  setShowDetailsDialog(true);
                }}
                data-testid={`row-file-${file.id}`}
              >
                <CardContent className="flex items-center gap-3 p-3">
                  <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                    {file.mimeType.startsWith("image/") ? (
                      <img
                        src={file.publicUrl}
                        alt={file.filename}
                        className="object-cover w-full h-full rounded"
                      />
                    ) : (
                      <Icon className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{file.filename}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatFileSize(file.fileSize)}</span>
                      <span>{format(new Date(file.uploadedAt), "MMM d, yyyy")}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {file.linkedCount > 0 && (
                      <Badge variant="secondary">
                        <Link2 className="h-3 w-3 mr-1" />
                        {file.linkedCount}
                      </Badge>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button size="icon" variant="ghost" data-testid={`button-file-menu-${file.id}`}>
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <a href={file.publicUrl} target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </a>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm("Delete this file?")) {
                              deleteMutation.mutate(file.id);
                            }
                          }}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload File</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {uploadData.file && (
              <div className="flex items-center gap-3 p-3 bg-muted rounded-md">
                <File className="h-8 w-8 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{uploadData.file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatFileSize(uploadData.file.size)}
                  </p>
                </div>
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Category</label>
              <Select
                value={uploadData.category}
                onValueChange={(v) => setUploadData((prev) => ({ ...prev, category: v }))}
              >
                <SelectTrigger data-testid="select-upload-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FILE_CATEGORIES.filter((c) => c !== "ALL").map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Description (optional)</label>
              <Textarea
                placeholder="Add a description..."
                value={uploadData.description}
                onChange={(e) => setUploadData((prev) => ({ ...prev, description: e.target.value }))}
                data-testid="input-upload-description"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Tags (optional)</label>
              <Input
                placeholder="e.g. groceries, march, weekly"
                value={uploadData.tags}
                onChange={(e) => setUploadData((prev) => ({ ...prev, tags: e.target.value }))}
                data-testid="input-upload-tags"
              />
              <p className="text-xs text-muted-foreground mt-1">Separate with commas</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={isUploading} data-testid="button-confirm-upload">
              {isUploading ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>File Details</DialogTitle>
          </DialogHeader>
          {selectedFile && (
            <div className="space-y-4">
              {selectedFile.mimeType.startsWith("image/") && (
                <div className="aspect-video bg-muted rounded-md overflow-hidden">
                  <img
                    src={selectedFile.publicUrl}
                    alt={selectedFile.filename}
                    className="object-contain w-full h-full"
                  />
                </div>
              )}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Name</span>
                  <span className="font-medium">{selectedFile.filename}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Size</span>
                  <span>{formatFileSize(selectedFile.fileSize)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Category</span>
                  <Badge variant="secondary">{selectedFile.category}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Uploaded</span>
                  <span>{format(new Date(selectedFile.uploadedAt), "MMM d, yyyy")}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Linked to</span>
                  <span>{selectedFile.linkedCount} items</span>
                </div>
                {selectedFile.description && (
                  <div>
                    <span className="text-sm text-muted-foreground block mb-1">Description</span>
                    <p>{selectedFile.description}</p>
                  </div>
                )}
                {selectedFile.tags && selectedFile.tags.length > 0 && (
                  <div>
                    <span className="text-sm text-muted-foreground block mb-1">Tags</span>
                    <div className="flex flex-wrap gap-1">
                      {selectedFile.tags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" asChild>
                  <a href={selectedFile.publicUrl} target="_blank" rel="noopener noreferrer">
                    <Eye className="h-4 w-4 mr-2" />
                    Open
                  </a>
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => {
                    if (confirm("Delete this file?")) {
                      deleteMutation.mutate(selectedFile.id);
                      setShowDetailsDialog(false);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
