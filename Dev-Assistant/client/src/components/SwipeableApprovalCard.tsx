import { useRef, forwardRef } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  useAnimationControls,
  type PanInfo,
} from "framer-motion";
import { Check, X, DollarSign } from "lucide-react";
import { format } from "date-fns";
import type { Approval } from "@shared/schema";

interface SwipeableApprovalCardProps {
  approval: Approval;
  onApprove: (id: string) => void;
  onDecline: (id: string) => void;
  stackIndex: number;
}

const SWIPE_THRESHOLD = 120;

export const SwipeableApprovalCard = forwardRef<HTMLDivElement, SwipeableApprovalCardProps>(
  function SwipeableApprovalCard({ approval, onApprove, onDecline, stackIndex }, ref) {
    const controls = useAnimationControls();
    const x = useMotionValue(0);
    const dismissed = useRef(false);

    const approveOpacity = useTransform(x, [0, 30, 150], [0, 0, 1]);
    const declineOpacity = useTransform(x, [-150, -30, 0], [1, 0, 0]);
    const rotate = useTransform(x, [-200, 0, 200], [-8, 0, 8]);

    const handleDragEnd = async (_: any, info: PanInfo) => {
      if (dismissed.current) return;

      const offset = info.offset.x;

      if (offset > SWIPE_THRESHOLD) {
        dismissed.current = true;
        if (navigator.vibrate) navigator.vibrate(12);
        await controls.start({
          x: 400,
          opacity: 0,
          transition: { duration: 0.3, ease: "easeOut" },
        });
        onApprove(approval.id);
      } else if (offset < -SWIPE_THRESHOLD) {
        dismissed.current = true;
        if (navigator.vibrate) navigator.vibrate([8, 50, 8]);
        await controls.start({
          x: -400,
          opacity: 0,
          transition: { duration: 0.3, ease: "easeOut" },
        });
        onDecline(approval.id);
      } else {
        controls.start({
          x: 0,
          transition: { type: "spring", stiffness: 500, damping: 30 },
        });
      }
    };

    return (
      <motion.div
        ref={ref}
        layout
        initial={{ scale: 1 - stackIndex * 0.03, y: stackIndex * 2, opacity: 1 }}
        animate={controls}
        exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
        style={{
          x,
          rotate,
          position: stackIndex === 0 ? "relative" : "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10 - stackIndex,
        }}
        drag={stackIndex === 0 ? "x" : false}
        dragConstraints={{ left: -200, right: 200 }}
        dragElastic={0.7}
        onDragEnd={handleDragEnd}
        className="touch-none"
      >
        <div className="relative overflow-hidden rounded-2xl">
          <motion.div
            className="absolute inset-0 flex items-center pl-6 rounded-2xl"
            style={{
              background: "hsl(var(--highlight) / 0.15)",
              opacity: approveOpacity,
            }}
          >
            <div className="flex items-center gap-2 text-highlight">
              <Check className="h-6 w-6" />
              <span className="text-sm font-medium uppercase tracking-wider">
                Approve
              </span>
            </div>
          </motion.div>

          <motion.div
            className="absolute inset-0 flex items-center justify-end pr-6 rounded-2xl"
            style={{
              background: "hsl(var(--muted) / 0.3)",
              opacity: declineOpacity,
            }}
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="text-sm font-medium uppercase tracking-wider">
                Decline
              </span>
              <X className="h-6 w-6" />
            </div>
          </motion.div>

          <div className="relative bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className="font-medium text-foreground leading-tight">
                {approval.title}
              </h3>
              {approval.amount && (
                <span className="text-lg font-display font-medium text-foreground shrink-0">
                  ${(approval.amount / 100).toFixed(2)}
                </span>
              )}
            </div>

            {approval.details && (
              <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                {approval.details}
              </p>
            )}

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {approval.amount && (
                <span className="flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  Reimbursement
                </span>
              )}
              <span>
                {format(new Date(approval.createdAt!), "MMM d, yyyy")}
              </span>
            </div>

            {stackIndex === 0 && (
              <div className="flex justify-between mt-3 pt-3 border-t border-border/30">
                <span className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">
                  ← Decline
                </span>
                <span className="text-[10px] text-highlight/60 uppercase tracking-widest">
                  Approve →
                </span>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  }
);
