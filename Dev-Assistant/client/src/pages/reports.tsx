import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DollarSign,
  TrendingUp,
  FileText,
  Download,
  BarChart3,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Receipt,
  Users,
  PieChart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageTransition } from "@/components/juice";

interface CategoryData {
  category: string | null;
  total: number;
  count: number;
}

interface VendorData {
  vendor: string | null;
  total: number;
  count: number;
}

interface MonthlyData {
  month: string;
  total: number;
  count: number;
}

interface AnnualReport {
  year: number;
  summary: {
    totalSpending: number;
    categoryCount: number;
    vendorCount: number;
    transactionCount: number;
    deductibleTotal: number;
    vendorsRequiring1099: number;
  };
  byCategory: CategoryData[];
  byVendor: VendorData[];
  vendorsOver600: VendorData[];
  monthlyTrend: MonthlyData[];
  potentiallyDeductible: CategoryData[];
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function ReportSkeleton() {
  return (
    <div className="px-4 py-6 space-y-4 max-w-4xl mx-auto" aria-busy="true">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-6 w-64" />
      <div className="grid grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function Reports() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  const { data: report, isLoading } = useQuery<AnnualReport>({
    queryKey: ["/api/v1/reports/annual", selectedYear],
    queryFn: async () => {
      const res = await fetch(`/api/v1/reports/annual/${selectedYear}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load report");
      return res.json();
    },
  });

  const downloadPDF = () => {
    window.open(`/api/v1/reports/annual/${selectedYear}/pdf`, "_blank");
  };

  const downloadCSV = () => {
    window.open(`/api/v1/reports/annual/${selectedYear}/csv`, "_blank");
  };

  if (isLoading) return <ReportSkeleton />;

  const maxMonthly = report
    ? Math.max(...MONTH_LABELS.map((_, i) => {
        const key = `${selectedYear}-${String(i + 1).padStart(2, "0")}`;
        const entry = report.monthlyTrend.find((t) => t.month === key);
        return entry?.total || 0;
      }), 1)
    : 1;

  const maxCategory = report
    ? Math.max(...report.byCategory.map((c) => c.total), 1)
    : 1;

  return (
    <PageTransition>
      <div className="px-4 py-6 space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Annual Report</h1>
            <p className="text-muted-foreground mt-1">
              Financial overview for tax preparation
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedYear((y) => y - 1)}
              disabled={selectedYear <= currentYear - 4}
              aria-label="Previous year"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Select
              value={String(selectedYear)}
              onValueChange={(v) => setSelectedYear(Number(v))}
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedYear((y) => y + 1)}
              disabled={selectedYear >= currentYear}
              aria-label="Next year"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {report && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <DollarSign className="h-3.5 w-3.5" aria-hidden="true" />
                    Total Spent
                  </div>
                  <p className="text-xl font-semibold">
                    {formatCents(report.summary.totalSpending)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <Receipt className="h-3.5 w-3.5" aria-hidden="true" />
                    Transactions
                  </div>
                  <p className="text-xl font-semibold">
                    {report.summary.transactionCount.toLocaleString()}
                  </p>
                </CardContent>
              </Card>
              <Card className={cn(
                report.summary.deductibleTotal > 0 && "border-green-200 dark:border-green-800"
              )}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <TrendingUp className="h-3.5 w-3.5 text-green-600" aria-hidden="true" />
                    Deductible
                  </div>
                  <p className="text-xl font-semibold text-green-700 dark:text-green-400">
                    {formatCents(report.summary.deductibleTotal)}
                  </p>
                </CardContent>
              </Card>
              <Card className={cn(
                report.summary.vendorsRequiring1099 > 0 && "border-amber-200 dark:border-amber-800"
              )}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                    1099 Vendors
                  </div>
                  <p className="text-xl font-semibold">
                    {report.summary.vendorsRequiring1099}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Paid $600+</p>
                </CardContent>
              </Card>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={downloadPDF}>
                <FileText className="h-4 w-4 mr-1" aria-hidden="true" />
                Download PDF
              </Button>
              <Button variant="outline" size="sm" onClick={downloadCSV}>
                <Download className="h-4 w-4 mr-1" aria-hidden="true" />
                Export CSV
              </Button>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" aria-hidden="true" />
                  Monthly Spending
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-1 h-40">
                  {MONTH_LABELS.map((label, i) => {
                    const key = `${selectedYear}-${String(i + 1).padStart(2, "0")}`;
                    const entry = report.monthlyTrend.find((t) => t.month === key);
                    const amount = entry?.total || 0;
                    const height = maxMonthly > 0 ? (amount / maxMonthly) * 100 : 0;
                    const isCurrentMonth =
                      selectedYear === currentYear && i === new Date().getMonth();

                    return (
                      <div
                        key={label}
                        className="flex-1 flex flex-col items-center gap-1"
                      >
                        <div className="w-full flex items-end justify-center h-32">
                          <div
                            className={cn(
                              "w-full max-w-6 rounded-t transition-all",
                              isCurrentMonth
                                ? "bg-primary"
                                : amount > 0
                                  ? "bg-primary/40"
                                  : "bg-muted"
                            )}
                            style={{ height: `${Math.max(height, 2)}%` }}
                            title={`${label}: ${formatCents(amount)}`}
                          />
                        </div>
                        <span className="text-[9px] text-muted-foreground">
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <PieChart className="h-4 w-4" aria-hidden="true" />
                  By Category
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {report.byCategory.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No spending data for {selectedYear}
                  </p>
                ) : (
                  report.byCategory.map((cat) => {
                    const pct =
                      report.summary.totalSpending > 0
                        ? (cat.total / report.summary.totalSpending) * 100
                        : 0;
                    const isDeductible =
                      cat.category &&
                      [
                        "Maintenance",
                        "Utilities",
                        "Services",
                        "Insurance",
                        "Home Office",
                        "Home Improvement",
                      ].includes(cat.category);

                    return (
                      <div key={cat.category || "none"} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span>{cat.category || "Uncategorized"}</span>
                            {isDeductible && (
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 border-green-300 text-green-700 dark:border-green-700 dark:text-green-400"
                              >
                                Deductible
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground">
                              {cat.count} items
                            </span>
                            <span className="font-medium tabular-nums">
                              {formatCents(cat.total)}
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              isDeductible ? "bg-green-500" : "bg-primary/60"
                            )}
                            style={{
                              width: `${(cat.total / maxCategory) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {report.vendorsOver600.length > 0 && (
              <Card className="border-amber-200 dark:border-amber-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    1099 Reporting — Vendors Paid $600+
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground mb-3">
                    These vendors may require 1099-MISC or 1099-NEC filing. Consult
                    your tax professional.
                  </p>
                  <div className="space-y-2">
                    {report.vendorsOver600.map((v) => (
                      <div
                        key={v.vendor}
                        className="flex items-center justify-between py-2 border-b last:border-0"
                      >
                        <div>
                          <p className="font-medium text-sm">{v.vendor}</p>
                          <p className="text-xs text-muted-foreground">
                            {v.count} transactions
                          </p>
                        </div>
                        <span className="font-semibold tabular-nums">
                          {formatCents(v.total)}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4" aria-hidden="true" />
                  Top Vendors
                </CardTitle>
              </CardHeader>
              <CardContent>
                {report.byVendor.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No vendor data for {selectedYear}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {report.byVendor.slice(0, 15).map((v, i) => (
                      <div
                        key={v.vendor || i}
                        className="flex items-center justify-between py-1.5 text-sm"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs text-muted-foreground w-5 text-right shrink-0">
                            {i + 1}.
                          </span>
                          <span className="truncate">
                            {v.vendor || "Unknown"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs text-muted-foreground">
                            {v.count}x
                          </span>
                          <span className="font-medium tabular-nums">
                            {formatCents(v.total)}
                          </span>
                        </div>
                      </div>
                    ))}
                    {report.byVendor.length > 15 && (
                      <p className="text-xs text-muted-foreground text-center pt-2">
                        + {report.byVendor.length - 15} more vendors
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <p className="text-[10px] text-muted-foreground text-center pb-4">
              This report is for informational purposes only and does not
              constitute tax advice. Please consult a qualified tax professional.
            </p>
          </>
        )}
      </div>
    </PageTransition>
  );
}
