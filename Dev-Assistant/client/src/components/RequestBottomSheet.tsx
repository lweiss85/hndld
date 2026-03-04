import { useEffect, useRef } from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { SmartRequestInput } from "@/components/smart-request-input";
import { QuickRequestButtons } from "@/components/quick-request-buttons";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface RequestBottomSheetProps {
  open: boolean;
  onClose: () => void;
}

export function RequestBottomSheet({ open, onClose }: RequestBottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      requestAnimationFrame(() => {
        const textarea = sheetRef.current?.querySelector("textarea");
        if (textarea) textarea.focus();
      });
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const createRequestMutation = useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      category: string;
      urgency: string;
      dueAt?: Date;
      location?: string;
    }) => {
      return apiRequest("POST", "/api/requests", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
      toast({
        title: "Request sent",
        description: "Your assistant will see this shortly",
      });
      onClose();
    },
  });

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.y > 80) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0"
            style={{ backgroundColor: "rgba(20,33,61,0.4)", backdropFilter: "blur(4px)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          <motion.div
            ref={sheetRef}
            className="absolute bottom-0 left-0 right-0 bg-card rounded-t-2xl shadow-xl flex flex-col"
            style={{ maxHeight: "75vh" }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
          >
            <div className="flex justify-center pt-3 pb-2" data-no-longpress>
              <div className="w-9 h-1 rounded-full bg-muted-foreground/30" />
            </div>

            <div className="px-5 pb-2">
              <h2 className="text-lg font-display font-medium text-foreground">
                New Request
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-5">
              <SmartRequestInput
                onSubmit={(data) => createRequestMutation.mutate(data)}
                isSubmitting={createRequestMutation.isPending}
                placeholder="What do you need help with?"
              />

              <div>
                <p className="text-sm text-muted-foreground mb-3">Quick requests</p>
                <QuickRequestButtons onRequestCreated={onClose} />
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
