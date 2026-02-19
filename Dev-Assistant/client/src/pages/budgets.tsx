import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Plus, TrendingUp, TrendingDown, DollarSign, AlertTriangle, Pencil, Trash2, ChevronLeft, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

interface BudgetStatus {
  id: string;
  category: string;
  budgetAmountCents: number;
  period: string;
  startDate: string;
  alertThreshold: number | null;
  isActive: boolean;
  notes: string | null;
  spentCents: number;
  remainingCents: number;
  percentUsed: number;
  periodStart: string;
  periodEnd: string;
}

interface HistoryMonth {
  month: string;
  spentCents: number;
}

interface HistoryData {
  category: string;
  budgetAmountCents: number | null;
  period: string | null;
  history: HistoryMonth[];
}

function formatCents(cents: number): string {
  return `$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function getStatusColor(percent: number): string {
  if (percent >= 100) return "text-red-600 dark:text-red-400";
  if (percent >= 90) return "text-red-500 dark:text-red-400";
  if (percent >= 70) return "text-amber-500 dark:text-amber-400";
  return "text-emerald-600 dark:text-emerald-400";
}

function getProgressColor(percent: number): string {
  if (percent >= 100) return "bg-red-500";
  if (percent >= 90) return "bg-red-400";
  if (percent >= 70) return "bg-amber-400";
  return "bg-emerald-500";
}

function getBadgeVariant(percent: number): "destructive" | "secondary" | "default" {
  if (percent >= 90) return "destructive";
  if (percent >= 70) return "secondary";
  return "default";
}

const CATEGORIES = [
  "Groceries", "Dining", "Transportation", "Utilities", "Entertainment",
  "Healthcare", "Education", "Shopping", "Home Maintenance", "Childcare",
  "Pet Care", "Travel", "Subscriptions", "Personal Care", "Gifts",
  "Cleaning", "Landscaping", "Security", "Insurance", "Other"
];

export default function Budgets() {
  const [showForm, setShowForm] = useState(false);
  const [editBudget, setEditBudget] = useState<BudgetStatus | null>(null);
  const [historyCategory, setHistoryCategory] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: budgetStatuses = [], isLoading } = useQuery<BudgetStatus[]>({
    queryKey: ["/api/v1/budgets/status"],
  });

  const { data: historyData } = useQuery<HistoryData>({
    queryKey: [`/api/v1/budgets/${encodeURIComponent(historyCategory ?? "")}/history`],
    enabled: !!historyCategory,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/v1/budgets", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/budgets/status"] });
      setShowForm(false);
      toast({ title: "Budget created" });
    },
    onError: () => toast({ title: "Failed to create budget", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/v1/budgets/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/budgets/status"] });
      setEditBudget(null);
      toast({ title: "Budget updated" });
    },
    onError: () => toast({ title: "Failed to update budget", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/v1/budgets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/budgets/status"] });
      toast({ title: "Budget removed" });
    },
    onError: () => toast({ title: "Failed to remove budget", variant: "destructive" }),
  });

  const totalBudget = budgetStatuses.reduce((s, b) => s + b.budgetAmountCents, 0);
  const totalSpent = budgetStatuses.reduce((s, b) => s + b.spentCents, 0);
  const overBudgetCount = budgetStatuses.filter(b => b.percentUsed >= 100).length;

  if (historyCategory && historyData) {
    const maxSpent = Math.max(...historyData.history.map(h => h.spentCents), historyData.budgetAmountCents || 0, 1);
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setHistoryCategory(null)}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold">{historyCategory}</h1>
              <p className="text-xs text-muted-foreground">Spending History</p>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {historyData.budgetAmountCents && (
            <div className="text-sm text-muted-foreground">
              {historyData.period} budget: {formatCents(historyData.budgetAmountCents)}
            </div>
          )}

          <Card>
            <CardContent className="pt-6">
              <div className="space-y-3">
                {historyData.history.map((month) => {
                  const barWidth = Math.max((month.spentCents / maxSpent) * 100, 2);
                  const overBudget = historyData.budgetAmountCents ? month.spentCents > historyData.budgetAmountCents : false;
                  return (
                    <div key={month.month} className="flex items-center gap-3">
                      <div className="w-20 text-xs text-muted-foreground shrink-0">{month.month}</div>
                      <div className="flex-1 relative h-7">
                        <div
                          className={cn(
                            "h-full rounded-md transition-all",
                            overBudget ? "bg-red-400/80" : "bg-primary/60"
                          )}
                          style={{ width: `${barWidth}%` }}
                        />
                        {historyData.budgetAmountCents && (
                          <div
                            className="absolute top-0 bottom-0 border-r-2 border-dashed border-muted-foreground/40"
                            style={{ left: `${(historyData.budgetAmountCents / maxSpent) * 100}%` }}
                          />
                        )}
                      </div>
                      <div className={cn("w-20 text-xs text-right font-medium", overBudget ? "text-red-500" : "")}>
                        {formatCents(month.spentCents)}
                      </div>
                    </div>
                  );
                })}
              </div>
              {historyData.budgetAmountCents && (
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="w-4 border-t-2 border-dashed border-muted-foreground/40" />
                  Budget line ({formatCents(historyData.budgetAmountCents)})
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Budgets</h1>
            <p className="text-xs text-muted-foreground">Track spending against limits</p>
          </div>
          <Dialog open={showForm} onOpenChange={setShowForm}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Budget</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Budget</DialogTitle>
              </DialogHeader>
              <BudgetForm
                onSubmit={(data) => createMutation.mutate(data)}
                isLoading={createMutation.isPending}
                existingCategories={budgetStatuses.map(b => b.category)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {budgetStatuses.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-3 text-center">
                <DollarSign className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <div className="text-sm font-semibold">{formatCents(totalBudget)}</div>
                <div className="text-[10px] text-muted-foreground">Total Budget</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <TrendingUp className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <div className="text-sm font-semibold">{formatCents(totalSpent)}</div>
                <div className="text-[10px] text-muted-foreground">Total Spent</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <AlertTriangle className={cn("h-4 w-4 mx-auto mb-1", overBudgetCount > 0 ? "text-red-500" : "text-muted-foreground")} />
                <div className="text-sm font-semibold">{overBudgetCount}</div>
                <div className="text-[10px] text-muted-foreground">Over Budget</div>
              </CardContent>
            </Card>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading budgets...</div>
        ) : budgetStatuses.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <DollarSign className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground mb-4">No budgets set up yet</p>
              <Button onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4 mr-1" /> Create Your First Budget
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {budgetStatuses.map((budget) => (
              <Card key={budget.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{budget.category}</span>
                        <Badge variant={getBadgeVariant(budget.percentUsed)} className="text-[10px] px-1.5 py-0">
                          {budget.percentUsed}%
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground capitalize">{budget.period}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setHistoryCategory(budget.category)}
                      >
                        <BarChart3 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setEditBudget(budget)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => {
                          if (confirm("Remove this budget?")) deleteMutation.mutate(budget.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="relative mb-2">
                    <div className="h-3 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", getProgressColor(budget.percentUsed))}
                        style={{ width: `${Math.min(budget.percentUsed, 100)}%` }}
                      />
                    </div>
                    {budget.alertThreshold && budget.alertThreshold < 100 && (
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-muted-foreground/30"
                        style={{ left: `${budget.alertThreshold}%` }}
                        title={`Alert at ${budget.alertThreshold}%`}
                      />
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className={getStatusColor(budget.percentUsed)}>
                      {formatCents(budget.spentCents)} spent
                    </span>
                    <span className="text-muted-foreground">
                      {budget.remainingCents >= 0
                        ? `${formatCents(budget.remainingCents)} remaining`
                        : `${formatCents(Math.abs(budget.remainingCents))} over`}
                    </span>
                    <span className="text-muted-foreground font-medium">
                      {formatCents(budget.budgetAmountCents)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!editBudget} onOpenChange={(open) => { if (!open) setEditBudget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Budget</DialogTitle>
          </DialogHeader>
          {editBudget && (
            <BudgetForm
              initial={editBudget}
              onSubmit={(data) => updateMutation.mutate({ id: editBudget.id, ...data })}
              isLoading={updateMutation.isPending}
              existingCategories={[]}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BudgetForm({
  initial,
  onSubmit,
  isLoading,
  existingCategories,
}: {
  initial?: BudgetStatus;
  onSubmit: (data: any) => void;
  isLoading: boolean;
  existingCategories: string[];
}) {
  const [category, setCategory] = useState(initial?.category ?? "");
  const [customCategory, setCustomCategory] = useState("");
  const [amount, setAmount] = useState(initial ? (initial.budgetAmountCents / 100).toString() : "");
  const [period, setPeriod] = useState(initial?.period ?? "monthly");
  const [threshold, setThreshold] = useState(initial?.alertThreshold?.toString() ?? "80");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const isCustom = category === "__custom__";
  const availableCategories = CATEGORIES.filter(c => !existingCategories.includes(c));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalCategory = isCustom ? customCategory : category;
    if (!finalCategory || !amount) return;

    onSubmit({
      category: finalCategory,
      budgetAmountCents: Math.round(parseFloat(amount) * 100),
      period,
      startDate: initial?.startDate ?? new Date().toISOString().split("T")[0],
      alertThreshold: parseInt(threshold) || 80,
      notes: notes || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!initial && (
        <div>
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {availableCategories.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
              <SelectItem value="__custom__">Custom...</SelectItem>
            </SelectContent>
          </Select>
          {isCustom && (
            <Input
              className="mt-2"
              placeholder="Enter category name"
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
            />
          )}
        </div>
      )}

      <div>
        <Label>Budget Amount ($)</Label>
        <Input
          type="number"
          step="0.01"
          min="0"
          placeholder="500.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </div>

      <div>
        <Label>Period</Label>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="quarterly">Quarterly</SelectItem>
            <SelectItem value="annual">Annual</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Alert at % spent</Label>
        <Input
          type="number"
          min="1"
          max="200"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
        />
      </div>

      <div>
        <Label>Notes (optional)</Label>
        <Input
          placeholder="e.g. Includes takeout and coffee"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Saving..." : initial ? "Update Budget" : "Create Budget"}
      </Button>
    </form>
  );
}
