import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Camera, X, Check, RotateCcw, ImagePlus, Upload, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface PhotoCaptureProps {
  onPhotoCapture: (file: File) => void;
  disabled?: boolean;
  buttonVariant?: "default" | "outline" | "ghost" | "secondary";
  buttonSize?: "default" | "sm" | "lg" | "icon";
  showLabel?: boolean;
}

export function PhotoCapture({
  onPhotoCapture,
  disabled = false,
  buttonVariant = "outline",
  buttonSize = "sm",
  showLabel = true,
}: PhotoCaptureProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      setStream(mediaStream);
      setShowCamera(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      }, 100);
    } catch (err) {
      console.error("Camera access error:", err);
      toast({
        title: "Camera unavailable",
        description: "Using file picker instead",
        variant: "destructive",
      });
      fileInputRef.current?.click();
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setCapturedImage(null);
    setShowCamera(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      setCapturedImage(dataUrl);
    }
  };

  const confirmPhoto = () => {
    if (!capturedImage) return;

    fetch(capturedImage)
      .then((res) => res.blob())
      .then((blob) => {
        const file = new File([blob], `photo_${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        onPhotoCapture(file);
        stopCamera();
        toast({ title: "Photo captured" });
      });
  };

  const retakePhoto = () => {
    setCapturedImage(null);
  };

  const switchCamera = async () => {
    const newMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(newMode);

    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: newMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        console.error("Camera switch error:", err);
      }
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onPhotoCapture(file);
      toast({ title: "Photo added" });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleButtonClick = () => {
    if ("mediaDevices" in navigator && "getUserMedia" in navigator.mediaDevices) {
      startCamera();
    } else {
      fileInputRef.current?.click();
    }
  };

  return (
    <>
      <Button
        type="button"
        variant={buttonVariant}
        size={buttonSize}
        onClick={handleButtonClick}
        disabled={disabled}
        aria-label={showLabel ? undefined : "Capture photo"}
        data-testid="button-capture-photo"
      >
        <Camera className="h-4 w-4" aria-hidden="true" />
        {showLabel && <span className="ml-1">Photo</span>}
      </Button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileInput}
        aria-label="Upload photo from device"
      />

      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

      <Dialog open={showCamera} onOpenChange={(open) => !open && stopCamera()}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle>Take Photo</DialogTitle>
          </DialogHeader>

          <div className="relative bg-black aspect-[4/3]">
            {capturedImage ? (
              <img
                src={capturedImage}
                alt="Captured photo preview"
                className="w-full h-full object-contain"
              />
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-contain"
                aria-label="Camera viewfinder"
              />
            )}
          </div>

          <div className="flex items-center justify-center gap-4 p-4">
            {capturedImage ? (
              <>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={retakePhoto}
                  data-testid="button-retake"
                >
                  <RotateCcw className="h-5 w-5 mr-2" aria-hidden="true" />
                  Retake
                </Button>
                <Button
                  size="lg"
                  onClick={confirmPhoto}
                  data-testid="button-confirm-photo"
                >
                  <Check className="h-5 w-5 mr-2" aria-hidden="true" />
                  Use Photo
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={switchCamera}
                  aria-label="Switch camera"
                  data-testid="button-switch-camera"
                >
                  <RotateCcw className="h-5 w-5" aria-hidden="true" />
                </Button>
                <Button
                  size="lg"
                  className="rounded-full w-16 h-16"
                  onClick={capturePhoto}
                  aria-label="Take photo"
                  data-testid="button-shutter"
                >
                  <Camera className="h-8 w-8" aria-hidden="true" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={stopCamera}
                  aria-label="Close camera"
                  data-testid="button-close-camera"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function QuickPhotoButton({
  onPhotoCapture,
  className,
}: {
  onPhotoCapture: (file: File) => void;
  className?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onPhotoCapture(file);
      toast({ title: "Photo added" });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handleClick}
        className={className}
        aria-label="Add photo"
        data-testid="button-quick-photo"
      >
        <ImagePlus className="h-5 w-5" aria-hidden="true" />
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileInput}
        aria-label="Upload photo from device"
      />
    </>
  );
}
