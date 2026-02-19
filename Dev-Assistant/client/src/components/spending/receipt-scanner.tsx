import { useState, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Camera, Upload, Loader2, CheckCircle2, X, ScanLine } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { triggerHaptic } from "@/components/juice";

interface ExtractedReceipt {
  vendor?: string;
  date?: string;
  total?: number;
  category?: string;
  items?: Array<{ description: string; amount: number }>;
  taxAmount?: number;
  paymentMethod?: string;
  confidence: number;
}

interface ScanResult {
  extracted: ExtractedReceipt;
  imageSize: number;
  imageName: string;
}

const CATEGORIES = [
  "Groceries",
  "Household",
  "Utilities",
  "Maintenance",
  "Services",
  "Kids",
  "Pets",
  "Entertainment",
  "Other",
];

type ScanStep = "upload" | "scanning" | "review";

interface ReceiptScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReceiptScanner({ open, onOpenChange }: ReceiptScannerProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<ScanStep>("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  const [editVendor, setEditVendor] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editCategory, setEditCategory] = useState("Other");
  const [editDate, setEditDate] = useState("");
  const [editNote, setEditNote] = useState("");

  const resetState = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setStep("upload");
    setSelectedFile(null);
    setPreviewUrl(null);
    setScanResult(null);
    setEditVendor("");
    setEditAmount("");
    setEditCategory("Other");
    setEditDate("");
    setEditNote("");
  }, [previewUrl]);

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const scanMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("receipt", file);
      const res = await fetch("/api/v1/receipts/scan", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Scan failed" }));
        throw new Error(err.error || "Scan failed");
      }
      return res.json() as Promise<ScanResult>;
    },
    onSuccess: (data) => {
      setScanResult(data);
      const e = data.extracted;
      setEditVendor(e.vendor || "");
      setEditAmount(e.total ? (e.total / 100).toFixed(2) : "");
      setEditCategory(e.category || "Other");
      setEditDate(e.date || new Date().toISOString().split("T")[0]);
      setEditNote("");
      setStep("review");
      triggerHaptic("light");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        description: error.message || "Failed to scan receipt",
      });
      setStep("upload");
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error("No receipt image");
      const formData = new FormData();
      formData.append("receipt", selectedFile);
      formData.append("vendor", editVendor);
      formData.append("amount", String(Math.round(parseFloat(editAmount) * 100)));
      formData.append("category", editCategory);
      formData.append("date", editDate);
      formData.append("note", editNote || `Scanned receipt from ${editVendor}`);

      const res = await fetch("/api/v1/receipts/confirm", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error || "Failed to save");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ description: "Receipt added to spending" });
      triggerHaptic("medium");
      handleClose();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        description: error.message || "Failed to save receipt",
      });
    },
  });

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setStep("scanning");
    scanMutation.mutate(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    e.target.value = "";
  };

  const isValidAmount = editAmount && !isNaN(parseFloat(editAmount)) && parseFloat(editAmount) > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(v); }}>
      <DialogContent className="max-w-md mx-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5" aria-hidden="true" />
            Scan Receipt
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Take a photo or upload a receipt image. The data will be extracted automatically.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-24 flex flex-col gap-2"
                onClick={() => cameraInputRef.current?.click()}
              >
                <Camera className="h-6 w-6" aria-hidden="true" />
                <span className="text-sm">Camera</span>
              </Button>
              <Button
                variant="outline"
                className="h-24 flex flex-col gap-2"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-6 w-6" aria-hidden="true" />
                <span className="text-sm">Upload</span>
              </Button>
            </div>

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleInputChange}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              className="hidden"
              onChange={handleInputChange}
            />
          </div>
        )}

        {step === "scanning" && (
          <div className="flex flex-col items-center gap-4 py-8">
            {previewUrl && (
              <div className="relative w-full max-h-48 overflow-hidden rounded-lg">
                <img
                  src={previewUrl}
                  alt="Receipt preview"
                  className="w-full h-auto object-contain max-h-48 opacity-50"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-background/80 backdrop-blur-sm rounded-full p-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                </div>
              </div>
            )}
            <p className="text-sm text-muted-foreground animate-pulse">
              Scanning receipt...
            </p>
          </div>
        )}

        {step === "review" && scanResult && (
          <div className="space-y-4">
            {previewUrl && (
              <div className="w-full max-h-32 overflow-hidden rounded-lg border">
                <img
                  src={previewUrl}
                  alt="Receipt"
                  className="w-full h-auto object-contain max-h-32"
                />
              </div>
            )}

            {scanResult.extracted.confidence > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3 w-3 text-green-500" aria-hidden="true" />
                {Math.round(scanResult.extracted.confidence * 100)}% confident
              </div>
            )}

            <div className="space-y-3">
              <div>
                <Label htmlFor="receipt-vendor">Vendor</Label>
                <Input
                  id="receipt-vendor"
                  value={editVendor}
                  onChange={(e) => setEditVendor(e.target.value)}
                  placeholder="Store name"
                />
              </div>

              <div>
                <Label htmlFor="receipt-amount">Amount ($)</Label>
                <Input
                  id="receipt-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div>
                <Label htmlFor="receipt-category">Category</Label>
                <Select value={editCategory} onValueChange={setEditCategory}>
                  <SelectTrigger id="receipt-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="receipt-date">Date</Label>
                <Input
                  id="receipt-date"
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="receipt-note">Note (optional)</Label>
                <Input
                  id="receipt-note"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="Add a note..."
                />
              </div>

              {scanResult.extracted.items && scanResult.extracted.items.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground">Detected items</Label>
                  <div className="mt-1 rounded-lg border p-2 space-y-1 max-h-24 overflow-y-auto">
                    {scanResult.extracted.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="truncate mr-2">{item.description}</span>
                        <span className="font-mono shrink-0">
                          ${(item.amount / 100).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => {
                  resetState();
                }}
              >
                <X className="h-4 w-4 mr-1" aria-hidden="true" />
                Cancel
              </Button>
              <Button
                onClick={() => confirmMutation.mutate()}
                disabled={!isValidAmount || confirmMutation.isPending}
              >
                {confirmMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-1" aria-hidden="true" />
                )}
                Add to Spending
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
