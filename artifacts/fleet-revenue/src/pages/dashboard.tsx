import { useMemo, useState } from "react";
import { 
  useGetDashboardSummary, 
  getGetDashboardSummaryQueryKey,
  useGetRevenueByPeriod,
  getGetRevenueByPeriodQueryKey,
  useGetRevenueByTruck,
  getGetRevenueByTruckQueryKey,
  useGetAnnualPerformance,
  getGetAnnualPerformanceQueryKey,
  useGetExpensesComparison,
  getGetExpensesComparisonQueryKey
} from "@workspace/api-client-react";
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, ComposedChart
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary({}, {
    query: { queryKey: getGetDashboardSummaryQueryKey({}) }
  });

  const { data: periodData, isLoading: loadingPeriod } = useGetRevenueByPeriod(
    { period: "monthly" }, 
    { query: { queryKey: getGetRevenueByPeriodQueryKey({ period: "monthly" }) } }
  );

  const { data: truckData, isLoading: loadingTruck } = useGetRevenueByTruck({}, {
    query: { queryKey: getGetRevenueByTruckQueryKey({}) }
  });

  const { data: expensesData, isLoading: loadingExpenses } = useGetExpensesComparison({}, {
    query: { queryKey: getGetExpensesComparisonQueryKey({}) }
  });

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Gross Revenue" value={summary ? formatCurrency(summary.grossRevenue) : "$0"} loading={loadingSummary} />
        <KpiCard title="Total Expenses" value={summary ? formatCurrency(summary.totalExpenses) : "$0"} loading={loadingSummary} />
        <KpiCard title="Net Profit" value={summary ? formatCurrency(summary.netProfit) : "$0"} loading={loadingSummary} />
        <KpiCard title="Profit Margin" value={summary ? `${summary.profitMargin.toFixed(1)}%` : "0%"} loading={loadingSummary} />
        <KpiCard title="Total Trips" value={summary?.totalTrips.toString() || "0"} loading={loadingSummary} />
        <KpiCard title="Avg Rev/Trip" value={summary ? formatCurrency(summary.avgRevenuePerTrip) : "$0"} loading={loadingSummary} />
        <KpiCard title="Best Truck" value={summary?.bestTruck || "-"} loading={loadingSummary} />
        <KpiCard title="Worst Truck" value={summary?.worstTruck || "-"} loading={loadingSummary} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Revenue Over Time</CardTitle>
            <CardDescription>Monthly revenue trends</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            {loadingPeriod ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={periodData || []} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="period" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val/1000}k`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorRevenue)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue by Truck</CardTitle>
            <CardDescription>Top performing vehicles</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            {loadingTruck ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={truckData?.slice(0, 10) || []} layout="vertical" margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val/1000}k`} />
                  <YAxis type="category" dataKey="truckId" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Legend />
                  <Bar dataKey="totalRevenue" name="Revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="netProfit" name="Profit" fill="hsl(var(--chart-3))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Expenses vs Revenue</CardTitle>
            <CardDescription>Monthly breakdown</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            {loadingExpenses ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={expensesData || []} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val/1000}k`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Legend />
                  <Bar dataKey="fuelCost" name="Fuel" stackId="a" fill="hsl(var(--chart-4))" />
                  <Bar dataKey="otherExpenses" name="Other Exp" stackId="a" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ title, value, loading }: { title: string, value: string, loading?: boolean }) {
  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="text-sm font-medium text-muted-foreground tracking-tight">{title}</h3>
        {loading ? (
          <Skeleton className="h-8 w-24 mt-2" />
        ) : (
          <p className="text-2xl font-bold mt-1 tracking-tight text-foreground">{value}</p>
        )}
      </CardContent>
    </Card>
  );
}
