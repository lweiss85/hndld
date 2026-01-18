import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusVariant = 
  | "success" 
  | "warning" 
  | "destructive" 
  | "info" 
  | "muted";

interface StatusBadgeProps {
  variant: StatusVariant;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<StatusVariant, string> = {
  success: "bg-success-muted text-success-muted-foreground border-success/20",
  warning: "bg-warning-muted text-warning-muted-foreground border-warning/20",
  destructive: "bg-destructive-muted text-destructive-muted-foreground border-destructive/20",
  info: "bg-info-muted text-info-muted-foreground border-info/20",
  muted: "bg-muted text-muted-foreground border-border",
};

export function StatusBadge({ variant, children, className }: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium border transition-colors",
        variantStyles[variant],
        className
      )}
    >
      {children}
    </Badge>
  );
}

export const STATUS_MAP = {
  PLANNED: "info",
  IN_PROGRESS: "warning", 
  WAITING: "warning",
  DONE: "success",
  COMPLETED: "success",
  APPROVED: "success",
  ACTIVE: "success",
  PENDING: "warning",
  NEEDS_APPROVAL: "warning",
  PAYMENT_SENT: "success",
  REJECTED: "destructive",
  CANCELLED: "muted",
  SUSPENDED: "destructive",
  TRIAL: "warning",
  HIGH: "destructive",
  MEDIUM: "warning",
  LOW: "success",
} as const;

export function getStatusVariant(status: string): StatusVariant {
  return (STATUS_MAP[status as keyof typeof STATUS_MAP] as StatusVariant) || "muted";
}
