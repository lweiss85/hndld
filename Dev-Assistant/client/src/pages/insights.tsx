import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  CheckCircle,
  Clock, 
  DollarSign,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageTransition } from "@/components/juice";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartPie,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";

const PERIOD_OPTIONS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "1y", label: "Last year" },
];

const CATEGORY_COLORS = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#84CC16",
];

interface DashboardStats {
  tasksCompleted: number;
  tasksCompletedChange: number;
  timeSaved: number;
  timeSavedChange: number;
  moneyManaged: number;
  moneyManagedChange: number;
  responseTime: number;
  responseTimeChange: number;
}

interface TaskBreakdown {
  category: string;
  count: number;
  percentage: number;
}

interface SpendingBreakdown {
  category: string;
  amount: number;
  percentage: number;
}

interface TimelinePoint {
  date: string;
  tasksCompleted: number;
  spending: number;
  updates: number;
}

function StatCard({
  title,
  value,
  change,
  icon: Icon,
  format = "number",
  positive = true,
}: {
  title: string;
  value: number;
  change: number;
  icon: React.ElementType;
  format?: "number" | "time" | "currency";
  positive?: boolean;
}) {
  const formattedValue = () => {
    switch (format) {
      case "time":
        const hours = Math.floor(value / 60);
        const mins = value % 60;
        return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      case "currency":
        return `$${(value / 100).toLocaleString()}`;
      default:
        return value.toLocaleString();
    }
  };

  const changeIsPositive = positive ? change > 0 : change < 0;
  const changeColor = changeIsPositive 
    ? "text-emerald-600" 
    : change < 0 
    ? "text-red-600" 
    : "text-muted-foreground";

  return (
    <Card data-testid={`stat-card-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground truncate">{title}</p>
            <p className="text-2xl font-bold mt-1">{formattedValue()}</p>
            <div className={cn("flex items-center gap-1 mt-1 text-sm flex-wrap", changeColor)}>
              {change > 0 ? (
                <TrendingUp className="h-3 w-3 shrink-0" />
              ) : change < 0 ? (
                <TrendingDown className="h-3 w-3 shrink-0" />
              ) : (
                <Minus className="h-3 w-3 shrink-0" />
              )}
              <span>{Math.abs(change).toFixed(1)}%</span>
              <span className="text-muted-foreground">vs prev</span>
            </div>
          </div>
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="px-4 py-6 space-y-6 max-w-6xl mx-auto">
      <Skeleton className="h-8 w-40" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-24" />
      <Skeleton className="h-64" />
    </div>
  );
}

export default function Analytics() {
  const [period, setPeriod] = useState("30d");

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/analytics/stats", { period }],
  });

  const { data: taskBreakdown } = useQuery<TaskBreakdown[]>({
    queryKey: ["/api/analytics/task-breakdown", { period }],
  });

  const { data: spendingBreakdown } = useQuery<SpendingBreakdown[]>({
    queryKey: ["/api/analytics/spending-breakdown", { period }],
  });

  const { data: timeline } = useQuery<TimelinePoint[]>({
    queryKey: ["/api/analytics/timeline", { period }],
  });

  if (statsLoading) {
    return <AnalyticsSkeleton />;
  }

  const timelineFiltered = timeline?.filter((_, i) => {
    if (period === "7d") return true;
    if (period === "30d") return i % 2 === 0;
    if (period === "90d") return i % 7 === 0;
    return i % 30 === 0;
  }) || [];

  return (
    <PageTransition>
      <div className="px-4 py-6 space-y-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">Analytics</h1>
            <p className="text-sm text-muted-foreground">
              See the value your assistant brings
            </p>
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40" data-testid="select-period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Tasks Completed"
            value={stats?.tasksCompleted || 0}
            change={stats?.tasksCompletedChange || 0}
            icon={CheckCircle}
          />
          <StatCard
            title="Time Saved"
            value={stats?.timeSaved || 0}
            change={stats?.timeSavedChange || 0}
            icon={Clock}
            format="time"
          />
          <StatCard
            title="Money Managed"
            value={stats?.moneyManaged || 0}
            change={stats?.moneyManagedChange || 0}
            icon={DollarSign}
            format="currency"
          />
          <StatCard
            title="Avg Response"
            value={stats?.responseTime || 0}
            change={stats?.responseTimeChange || 0}
            icon={Zap}
            positive={false}
          />
        </div>

        <Card className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <Clock className="h-8 w-8 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-medium">
                  You've saved approximately{" "}
                  <span className="text-primary font-bold">
                    {Math.floor((stats?.timeSaved || 0) / 60)} hours
                  </span>{" "}
                  this period
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  That's time you've spent with family, at work, or doing what you love.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Activity Over Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timelineFiltered}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 11 }}
                      tickFormatter={(val) => {
                        const d = new Date(val);
                        return `${d.getMonth() + 1}/${d.getDate()}`;
                      }}
                    />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="tasksCompleted"
                      stackId="1"
                      stroke="#3B82F6"
                      fill="#3B82F6"
                      fillOpacity={0.6}
                      name="Tasks"
                    />
                    <Area
                      type="monotone"
                      dataKey="updates"
                      stackId="2"
                      stroke="#10B981"
                      fill="#10B981"
                      fillOpacity={0.4}
                      name="Updates"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tasks by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                {taskBreakdown && taskBreakdown.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartPie>
                      <Pie
                        data={taskBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={80}
                        dataKey="count"
                        nameKey="category"
                        label={({ category, percentage }) => 
                          `${category} (${percentage.toFixed(0)}%)`
                        }
                        labelLine={false}
                      >
                        {taskBreakdown.map((_, idx) => (
                          <Cell key={idx} fill={CATEGORY_COLORS[idx % CATEGORY_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </RechartPie>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    No task data for this period
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {spendingBreakdown && spendingBreakdown.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Spending by Category
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={spendingBreakdown} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(val) => `$${(val / 100).toFixed(0)}`} />
                    <YAxis dataKey="category" type="category" tick={{ fontSize: 11 }} width={100} />
                    <Tooltip 
                      formatter={(val: number) => [`$${(val / 100).toFixed(2)}`, "Amount"]}
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Bar dataKey="amount" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PageTransition>
  );
}
