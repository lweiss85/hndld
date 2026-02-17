import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";

interface LuxuryCardProps {
  children: React.ReactNode;
  className?: string;
}

export function LuxuryCard({ children, className }: LuxuryCardProps) {
  return (
    <div
      className={cn(
        "bg-card rounded-2xl p-5 shadow-sm border border-card-border",
        "transition-[transform,box-shadow] duration-200",
        "hover:shadow-md hover:-translate-y-0.5",
        className
      )}
    >
      {children}
    </div>
  );
}

interface SectionHeaderProps {
  title: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  className?: string;
}

export function SectionHeader({ title, action, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between gap-4 mb-3", className)}>
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      {action && (
        action.href ? (
          <Link
            href={action.href}
            className="text-xs font-medium text-primary hover:underline"
            data-testid={`link-${title.toLowerCase().replace(/\s+/g, '-')}-action`}
          >
            {action.label}
          </Link>
        ) : (
          <button
            onClick={action.onClick}
            className="text-xs font-medium text-primary hover:underline"
            data-testid={`button-${title.toLowerCase().replace(/\s+/g, '-')}-action`}
          >
            {action.label}
          </button>
        )
      )}
    </div>
  );
}

interface ItemRowProps {
  title: string;
  meta?: string;
  location?: string;
  urgency?: "HIGH" | "MEDIUM" | "LOW";
  onClick?: () => void;
  className?: string;
}

export function ItemRow({ title, meta, location, urgency, onClick, className }: ItemRowProps) {
  const urgencyColors = {
    HIGH: "bg-destructive",
    MEDIUM: "bg-warning", 
    LOW: "bg-muted-foreground",
  };

  return (
    <div
      className={cn(
        "flex items-start gap-3 py-3 border-b border-border/50 last:border-0",
        onClick && "cursor-pointer hover-elevate",
        className
      )}
      onClick={onClick}
      data-testid="item-row"
    >
      {urgency && (
        <div className="flex items-center gap-2 shrink-0 pt-1">
          <span className={cn("w-2 h-2 rounded-full", urgencyColors[urgency])} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{title}</p>
        {(meta || location) && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {meta}{meta && location && " • "}{location}
          </p>
        )}
      </div>
      {urgency && (
        <span className="text-xs text-muted-foreground shrink-0 pt-0.5">
          {urgency === "HIGH" ? "High" : urgency === "MEDIUM" ? "Med" : "Low"}
        </span>
      )}
    </div>
  );
}

interface UrgencyDotProps {
  level: "HIGH" | "MEDIUM" | "LOW";
  showLabel?: boolean;
  className?: string;
}

export function UrgencyDot({ level, showLabel = false, className }: UrgencyDotProps) {
  const colors = {
    HIGH: "bg-destructive",
    MEDIUM: "bg-warning",
    LOW: "bg-muted-foreground",
  };
  const labels = {
    HIGH: "High",
    MEDIUM: "Med",
    LOW: "Low",
  };

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <span className={cn("w-2 h-2 rounded-full", colors[level])} />
      {showLabel && (
        <span className="text-xs text-muted-foreground">{labels[level]}</span>
      )}
    </div>
  );
}

interface QuickActionPillProps {
  icon: React.ReactNode;
  label: string;
  badge?: number;
  href?: string;
  onClick?: () => void;
  variant?: "default" | "primary";
}

export function QuickActionPill({ icon, label, badge, href, onClick, variant = "default" }: QuickActionPillProps) {
  const baseClasses = cn(
    "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors",
    variant === "primary" 
      ? "bg-primary text-primary-foreground" 
      : "bg-card text-foreground border border-border hover-elevate"
  );

  const content = (
    <>
      {icon}
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0 min-w-[1.25rem] h-5">
          {badge}
        </Badge>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={baseClasses} data-testid={`pill-${label.toLowerCase()}`}>
        {content}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className={baseClasses} data-testid={`pill-${label.toLowerCase()}`}>
      {content}
    </button>
  );
}

interface SkeletonCardProps {
  className?: string;
  lines?: number;
}

export function SkeletonCard({ className, lines = 3 }: SkeletonCardProps) {
  return (
    <div className={cn("bg-surface2 rounded-2xl p-5 skeleton-shimmer", className)}>
      <div className="h-5 w-2/3 bg-muted rounded mb-4" />
      <div className="space-y-2.5">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="h-3.5 bg-muted rounded"
            style={{ width: `${85 - i * 15}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 py-3 skeleton-shimmer", className)}>
      <div className="w-2 h-2 rounded-full bg-muted shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-4 w-3/4 bg-muted rounded" />
        <div className="h-3 w-1/2 bg-muted rounded" />
      </div>
    </div>
  );
}

interface EmptyStateAction {
  label: string;
  onClick?: () => void;
  href?: string;
}

interface EmptyStateProps {
  illustration?: React.ReactNode;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  className?: string;
}

export function EmptyState({ illustration, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 text-center", className)}>
      {illustration && (
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <div className="w-8 h-8 text-muted-foreground">
            {illustration}
          </div>
        </div>
      )}
      <h3 className="font-medium text-lg mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-[280px]">{description}</p>
      )}
      {action && (
        action.href ? (
          <Link 
            href={action.href} 
            className="mt-4 text-sm font-medium text-primary hover:underline"
            data-testid="empty-state-action"
          >
            {action.label}
          </Link>
        ) : action.onClick ? (
          <button 
            onClick={action.onClick}
            className="mt-4 text-sm font-medium text-primary hover:underline"
            data-testid="empty-state-action"
          >
            {action.label}
          </button>
        ) : null
      )}
    </div>
  );
}
