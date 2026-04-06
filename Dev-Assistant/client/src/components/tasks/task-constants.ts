import { ShoppingCart, School, Wrench, FileText } from "lucide-react";
import type { Task, TaskChecklistItem } from "@shared/schema";

export const STATUSES = [
  { value: "PLANNED", label: "Planned" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "WAITING_ON_CLIENT", label: "Waiting" },
  { value: "DONE", label: "Done" },
  { value: "CANCELLED", label: "Cancelled" },
];

export const CATEGORIES = [
  { value: "HOUSEHOLD", label: "Household" },
  { value: "ERRANDS", label: "Errands" },
  { value: "MAINTENANCE", label: "Maintenance" },
  { value: "GROCERIES", label: "Groceries" },
  { value: "KIDS", label: "Kids" },
  { value: "PETS", label: "Pets" },
  { value: "EVENTS", label: "Events" },
  { value: "OTHER", label: "Other" },
];

export const STATUS_COLORS: Record<string, string> = {
  PLANNED: "bg-info-muted text-info-muted-foreground",
  IN_PROGRESS: "bg-warning-muted text-warning-muted-foreground",
  WAITING_ON_CLIENT: "bg-warning-muted text-warning-muted-foreground",
  DONE: "bg-success-muted text-success-muted-foreground",
  CANCELLED: "bg-muted text-muted-foreground",
};

export interface TaskWithChecklist extends Task {
  checklistItems?: TaskChecklistItem[];
}

export const DEFAULT_TEMPLATES = [
  { id: "default-groceries", name: "Weekly Groceries", title: "Weekly Grocery Shopping", category: "GROCERIES", urgency: "MEDIUM", icon: "shopping-cart" },
  { id: "default-school", name: "School Pickup", title: "School Pickup", category: "KIDS", urgency: "HIGH", icon: "school" },
  { id: "default-maintenance", name: "Home Maintenance", title: "Home Maintenance Check", category: "MAINTENANCE", urgency: "LOW", icon: "wrench" },
];

export const TEMPLATE_ICONS: Record<string, typeof ShoppingCart> = {
  "shopping-cart": ShoppingCart,
  "school": School,
  "wrench": Wrench,
  "file-text": FileText,
};
