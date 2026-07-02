import { useState, useMemo, useRef, useEffect } from "react";
import {
  AreaChart, Area, BarChart, Bar, ComposedChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, Percent, Package, Truck,
  Fuel, BarChart2, Users, MapPin, Calendar, ChevronUp, ChevronDown,
  ChevronsUpDown, Star, Activity, Clock, Zap, Award, Route,
} from "lucide-react";
import {
  useGetDashboardResumo, getGetDashboardResumoQueryKey,
  useGetRevenueByPeriodo, getGetRevenueByPeriodoQueryKey,
  useGetMensalComparativo, getGetMensalComparativoQueryKey,
  useGetDieselByPlaca, getGetDieselByPlacaQueryKey,
  useGetDespesasResumo, getGetDespesasResumoQueryKey,
  useGetDespesasMensal, getGetDespesasMensalQueryKey,
  useGetTopClientes, getGetTopClientesQueryKey,
  useGetTopCidades, getGetTopCidadesQueryKey,
  useGetByTransportadora, getGetByTransportadoraQueryKey,
  useGetFleetPerformance, getGetFleetPerformanceQueryKey,
  useGetUpcomingReceivables, getGetUpcomingReceivablesQueryKey,
  useGetRecentFretes, getGetRecentFretesQueryKey,
  useListFrotas, getListFrotasQueryKey,
  type FleetPerformance,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────────────────────

const YEARS = [2022, 2023, 2024, 2025, 2026, 2027];

const PIE_COLORS = [
  "#0a192f", "#e74c3c", "#2ecc71", "#f39c12", "#3498db",
  "#9b59b6", "#1abc9c", "#e67e22", "#e91e63", "#607d8b",
  "#795548", "#ff5722", "#009688", "#f06292",
];

const CHART_STYLE = {
  contentStyle: {
    backgroundColor: "hsl(var(--card))",
    borderColor: "hsl(var(--border))",
    color: "hsl(var(--foreground))",
    fontSize: 12,
    borderRadius: 8,
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 10) / 10 : 0;
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function urgencyColor(dias: number | null | undefined) {
  if (dias == null) return "text-muted-foreground";
  if (dias <= 2) return "text-red-600 dark:text-red-400";
  if (dias <= 7) return "text-amber-600 dark:text-amber-400";
  return "text-emerald-600 dark:text-emerald-400";
}

function urgencyBadge(dias: number | null | undefined) {
  if (dias == null) return null;
  if (dias === 0) return <Badge variant="destructive">Hoje</Badge>;
  if (dias <= 2) return <Badge variant="destructive">{dias}d</Badge>;
  if (dias <= 7) return <Badge className="bg-amber-500 text-white">{dias}d</Badge>;
  return <Badge variant="outline">{dias}d</Badge>;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-slate-900 px-4 py-3 rounded-lg border shadow-sm">
      <div>
        <h2 className="text-base font-bold text-[#0a192f] dark:text-white">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

function EmptyChart({ message = "Nenhum dado para o período" }: { message?: string }) {
  return (
    <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
      {message}
    </div>
  );
}

interface KpiCardProps {
  title: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  valueColor?: string;
  loading?: boolean;
  trend?: number;
}

function KpiCard({ title, value, sub, icon, valueColor = "text-foreground", loading, trend }: KpiCardProps) {
  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider leading-tight">
              {title}
            </p>
            {loading ? (
              <Skeleton className="h-7 w-24 mt-2" />
            ) : (
              <p className={`text-lg sm:text-xl font-bold mt-1.5 tracking-tight break-all ${valueColor}`}>
                {value}
              </p>
            )}
            {sub && !loading && (
              <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
            )}
            {trend !== undefined && !loading && (
              <div className={`flex items-center gap-1 text-xs mt-1 ${trend >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {Math.abs(trend).toFixed(1)}%
              </div>
            )}
          </div>
          <div className="p-2 rounded-lg bg-[#0a192f]/8 dark:bg-white/5 shrink-0 text-[#0a192f] dark:text-white/70">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type SortDir = "asc" | "desc";

function SortBtn({
  col, sortKey, sortDir, onSort,
}: { col: keyof FleetPerformance; sortKey: keyof FleetPerformance; sortDir: SortDir; onSort: (k: keyof FleetPerformance) => void }) {
  const active = sortKey === col;
  return (
    <button
      onClick={() => onSort(col)}
      className="flex items-center gap-0.5 text-left hover:text-foreground transition-colors"
    >
      {active
        ? sortDir === "desc"
          ? <ChevronDown className="h-3 w-3 text-[#0a192f]" />
          : <ChevronUp className="h-3 w-3 text-[#0a192f]" />
        : <ChevronsUpDown className="h-3 w-3 opacity-40" />
      }
    </button>
  );
}

// ── Fleet Performance Table ───────────────────────────────────────────────────

function FleetRankingTable({ data, loading }: { data?: FleetPerformance[]; loading: boolean }) {
  const [sortKey, setSortKey] = useState<keyof FleetPerformance>("totalReceita");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(col: keyof FleetPerformance) {
    if (sortKey === col) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(col); setSortDir("desc"); }
  }

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      return sortDir === "desc"
        ? (Number(bv) - Number(av))
        : (Number(av) - Number(bv));
    });
  }, [data, sortKey, sortDir]);

  const cols: { label: string; key: keyof FleetPerformance; fmt: (v: FleetPerformance) => string }[] = [
    { label: "Frota",    key: "frota",        fmt: r => r.frota },
    { label: "Receita",  key: "totalReceita", fmt: r => formatCurrency(r.totalReceita) },
    { label: "Despesas", key: "totalCustos",  fmt: r => formatCurrency(r.totalCustos) },
    { label: "Lucro",    key: "lucro",        fmt: r => formatCurrency(r.lucro) },
    { label: "Viagens",  key: "viagens",      fmt: r => String(r.viagens) },
    { label: "KM Total", key: "km",           fmt: r => r.km > 0 ? formatNumber(r.km, 0) + " km" : "—" },
    { label: "R$/KM",    key: "receitaPerKm", fmt: r => r.receitaPerKm != null ? `R$ ${formatNumber(r.receitaPerKm, 2)}` : "—" },
    { label: "Lucro/KM", key: "lucroPerKm",   fmt: r => r.lucroPerKm  != null ? `R$ ${formatNumber(r.lucroPerKm,  2)}` : "—" },
  ];

  if (loading) return <Skeleton className="w-full h-48" />;
  if (!sorted.length) return <p className="text-sm text-muted-foreground py-4">Nenhum dado disponível</p>;

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-xs sm:text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground w-6">#</th>
            {cols.map(c => (
              <th key={c.key} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
                <div className="flex items-center gap-1">
                  {c.label}
                  {c.key !== "frota" && (
                    <SortBtn col={c.key} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.frota} className={`border-t hover:bg-muted/30 transition-colors ${i === 0 && sortKey === "totalReceita" && sortDir === "desc" ? "bg-[#0a192f]/3 dark:bg-white/3" : ""}`}>
              <td className="px-3 py-2 text-muted-foreground font-medium">{i + 1}</td>
              {cols.map(c => {
                const val = c.fmt(r);
                const isLucro = c.key === "lucro" || c.key === "lucroPerKm";
                const color = isLucro
                  ? r.lucro >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
                  : "";
                return (
                  <td key={c.key} className={`px-3 py-2 whitespace-nowrap font-medium ${color}`}>
                    {c.key === "frota" ? <span className="font-bold text-[#0a192f] dark:text-white">{val}</span> : val}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Fleet Comparison ──────────────────────────────────────────────────────────

function FleetComparison({ data }: { data?: FleetPerformance[] }) {
  const frotas = useMemo(() => (data ?? []).map(d => d.frota), [data]);
  const [frotaA, setFrotaA] = useState<string>("");
  const [frotaB, setFrotaB] = useState<string>("");

  const a = data?.find(d => d.frota === frotaA);
  const b = data?.find(d => d.frota === frotaB);

  const metrics: { label: string; keyA: keyof FleetPerformance; fmt: (v: FleetPerformance) => string; higher?: "a" | "b" | "none" }[] = useMemo(() => {
    if (!a || !b) return [];
    return [
      { label: "Receita Total",  keyA: "totalReceita", fmt: r => formatCurrency(r.totalReceita),  higher: a.totalReceita  > b.totalReceita  ? "a" : b.totalReceita  > a.totalReceita  ? "b" : "none" },
      { label: "Total Despesas", keyA: "totalCustos",  fmt: r => formatCurrency(r.totalCustos),   higher: a.totalCustos   < b.totalCustos   ? "a" : b.totalCustos   < a.totalCustos   ? "b" : "none" },
      { label: "Lucro",          keyA: "lucro",        fmt: r => formatCurrency(r.lucro),          higher: a.lucro         > b.lucro         ? "a" : b.lucro         > a.lucro         ? "b" : "none" },
      { label: "Nº Viagens",     keyA: "viagens",      fmt: r => String(r.viagens),                higher: a.viagens       > b.viagens       ? "a" : b.viagens       > a.viagens       ? "b" : "none" },
      { label: "KM Total",       keyA: "km",           fmt: r => r.km > 0 ? formatNumber(r.km, 0) + " km" : "—", higher: a.km > b.km ? "a" : b.km > a.km ? "b" : "none" },
      { label: "Receita/KM",     keyA: "receitaPerKm", fmt: r => r.receitaPerKm != null ? `R$ ${formatNumber(r.receitaPerKm)}` : "—", higher: (a.receitaPerKm ?? 0) > (b.receitaPerKm ?? 0) ? "a" : (b.receitaPerKm ?? 0) > (a.receitaPerKm ?? 0) ? "b" : "none" },
      { label: "Lucro/KM",       keyA: "lucroPerKm",   fmt: r => r.lucroPerKm  != null ? `R$ ${formatNumber(r.lucroPerKm)}`  : "—", higher: (a.lucroPerKm  ?? 0) > (b.lucroPerKm  ?? 0) ? "a" : (b.lucroPerKm  ?? 0) > (a.lucroPerKm  ?? 0) ? "b" : "none" },
    ];
  }, [a, b]);

  if (!frotas.length) return <p className="text-sm text-muted-foreground">Nenhum dado de frota disponível.</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[140px]">
          <Label className="text-xs mb-1 block">Frota A</Label>
          <Select value={frotaA} onValueChange={setFrotaA}>
            <SelectTrigger><SelectValue placeholder="Selecionar frota" /></SelectTrigger>
            <SelectContent>
              {frotas.filter(f => f !== frotaB).map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-[140px]">
          <Label className="text-xs mb-1 block">Frota B</Label>
          <Select value={frotaB} onValueChange={setFrotaB}>
            <SelectTrigger><SelectValue placeholder="Selecionar frota" /></SelectTrigger>
            <SelectContent>
              {frotas.filter(f => f !== frotaA).map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {a && b ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Métrica</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-[#0a192f] dark:text-white">Frota {frotaA}</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-[#2ecc71]">Frota {frotaB}</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map(m => (
                <tr key={m.label} className="border-t hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2 text-xs text-muted-foreground">{m.label}</td>
                  <td className={`px-4 py-2 text-center font-medium text-sm ${m.higher === "a" ? "text-emerald-600 dark:text-emerald-400 font-bold" : ""}`}>
                    {m.fmt(a)}
                    {m.higher === "a" && <Star className="inline h-3 w-3 ml-1 text-emerald-500" />}
                  </td>
                  <td className={`px-4 py-2 text-center font-medium text-sm ${m.higher === "b" ? "text-emerald-600 dark:text-emerald-400 font-bold" : ""}`}>
                    {m.fmt(b)}
                    {m.higher === "b" && <Star className="inline h-3 w-3 ml-1 text-emerald-500" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Selecione duas frotas para comparar.</p>
      )}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export function Dashboard() {
  const currentYear = new Date().getFullYear();
  const [ano, setAno] = useState(currentYear);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [frotaFilter, setFrotaFilter] = useState("__all__");
  const [period, setPeriod] = useState<"diario" | "semanal" | "mensal" | "trimestral" | "anual">("mensal");

  // ── Sticky filter bar detection ────────────────────────────────────────────
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    // Find nearest scrollable ancestor to use as IntersectionObserver root
    let root: Element | null = null;
    let el: HTMLElement | null = sentinel.parentElement;
    while (el && el !== document.documentElement) {
      const { overflowY } = window.getComputedStyle(el);
      if (overflowY === "auto" || overflowY === "scroll") { root = el; break; }
      el = el.parentElement;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsStuck(!entry.isIntersecting),
      { root, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const dateFrom: any = customFrom || `${ano}-01-01`;
  const dateTo:   any = customTo   || `${ano}-12-31`;
  const frotaParam = frotaFilter !== "__all__" ? frotaFilter : undefined;

  function resetDates() { setCustomFrom(""); setCustomTo(""); }

  // ── Data hooks ─────────────────────────────────────────────────────────────
  const { data: resumo,        isLoading: l1 } = useGetDashboardResumo({ dateFrom, dateTo }, { query: { queryKey: getGetDashboardResumoQueryKey({ dateFrom, dateTo }) } });
  const { data: periodoData,   isLoading: l2 } = useGetRevenueByPeriodo({ period, dateFrom, dateTo }, { query: { queryKey: getGetRevenueByPeriodoQueryKey({ period, dateFrom, dateTo }) } });
  const { data: mensalData,    isLoading: l3 } = useGetMensalComparativo({ ano }, { query: { queryKey: getGetMensalComparativoQueryKey({ ano }) } });
  const { data: dieselData,    isLoading: l4 } = useGetDieselByPlaca({ ano }, { query: { queryKey: getGetDieselByPlacaQueryKey({ ano }) } });
  const { data: despResumo,    isLoading: l5 } = useGetDespesasResumo({ ano }, { query: { queryKey: getGetDespesasResumoQueryKey({ ano }) } });
  const { data: despMensal,    isLoading: l6 } = useGetDespesasMensal({ ano }, { query: { queryKey: getGetDespesasMensalQueryKey({ ano }) } });
  const { data: clientesData,  isLoading: l7 } = useGetTopClientes({ dateFrom, dateTo, frota: frotaParam as any }, { query: { queryKey: getGetTopClientesQueryKey({ dateFrom, dateTo, frota: frotaParam as any }) } });
  const { data: cidadesData,   isLoading: l8 } = useGetTopCidades({ dateFrom, dateTo, frota: frotaParam as any }, { query: { queryKey: getGetTopCidadesQueryKey({ dateFrom, dateTo, frota: frotaParam as any }) } });
  const { data: transpData,    isLoading: l9 } = useGetByTransportadora({ dateFrom, dateTo }, { query: { queryKey: getGetByTransportadoraQueryKey({ dateFrom, dateTo }) } });
  const { data: fleetPerf,     isLoading: l10} = useGetFleetPerformance({ dateFrom, dateTo }, { query: { queryKey: getGetFleetPerformanceQueryKey({ dateFrom, dateTo }) } });
  const { data: receivables,   isLoading: l11} = useGetUpcomingReceivables({ query: { queryKey: getGetUpcomingReceivablesQueryKey() } });
  const { data: recentFretes,  isLoading: l12} = useGetRecentFretes({ limit: 10 }, { query: { queryKey: getGetRecentFretesQueryKey({ limit: 10 }) } });
  const { data: frotasList } = useListFrotas({ query: { queryKey: getListFrotasQueryKey() } });

  // ── Computed KPIs ──────────────────────────────────────────────────────────
  const totalReceita   = resumo ? resumo.totalFrete + resumo.totalPedagio : 0;
  const totalDespesas  = despResumo?.totalCustos ?? 0;
  const lucroLiquido   = (despResumo?.totalLucro ?? 0);
  const margem         = despResumo && despResumo.totalFrete > 0
    ? pct(despResumo.totalLucro, despResumo.totalFrete)
    : 0;
  const frotaAtiva     = fleetPerf?.length ?? 0;
  const totalDiesel    = resumo?.totalDiesel ?? 0;
  const totalLitros    = dieselData?.reduce((s, d) => s + d.totalLitros, 0) ?? 0;
  const avgKmL         = dieselData && dieselData.length > 0
    ? dieselData.reduce((s, d) => s + (d.mediaGeral ?? 0), 0) / dieselData.filter(d => d.mediaGeral != null).length
    : 0;
  const totalKm        = dieselData?.reduce((s, d) => s + (d.kmTotal ?? 0), 0) ?? 0;

  // ── Smart Insights ─────────────────────────────────────────────────────────
  const insights = useMemo(() => {
    const list: { label: string; value: string; icon: React.ReactNode; color: string }[] = [];

    if (fleetPerf && fleetPerf.length > 0) {
      const best = fleetPerf[0];
      list.push({ label: "Frota mais rentável", value: `${best.frota} — ${formatCurrency(best.totalReceita)}`, icon: <Award className="h-4 w-4" />, color: "text-emerald-600" });
    }
    if (clientesData && clientesData.length > 0) {
      const top = clientesData[0];
      list.push({ label: "Maior cliente", value: `${truncate(top.cliente, 22)} — ${formatCurrency(top.totalGeral)}`, icon: <Users className="h-4 w-4" />, color: "text-[#0a192f] dark:text-white" });
    }
    if (cidadesData && cidadesData.length > 0) {
      const top = cidadesData[0];
      list.push({ label: "Destino mais servido", value: `${truncate(top.cidade, 22)} — ${top.viagens} viagens`, icon: <MapPin className="h-4 w-4" />, color: "text-blue-600" });
    }
    if (dieselData && dieselData.length > 0) {
      const best = [...dieselData].sort((a, b) => (b.mediaGeral ?? 0) - (a.mediaGeral ?? 0))[0];
      if (best.mediaGeral) {
        list.push({ label: "Melhor eficiência (km/L)", value: `${best.placa} — ${formatNumber(best.mediaGeral, 2)} km/L`, icon: <Fuel className="h-4 w-4" />, color: "text-amber-600" });
      }
    }
    if (despResumo && despResumo.categorias.length > 0) {
      const top = despResumo.categorias[0];
      list.push({ label: "Maior categoria de custo", value: `${top.categoria} — ${formatCurrency(top.valor)}`, icon: <TrendingDown className="h-4 w-4" />, color: "text-red-500" });
    }
    if (resumo) {
      list.push({ label: "Média por viagem", value: formatCurrency(resumo.mediaPorViagem), icon: <Package className="h-4 w-4" />, color: "text-purple-600" });
    }
    if (fleetPerf && fleetPerf.length > 0) {
      const byKmL = [...fleetPerf].sort((a, b) => (b.receitaPerKm ?? 0) - (a.receitaPerKm ?? 0));
      const top = byKmL[0];
      if (top.receitaPerKm) {
        list.push({ label: "Maior receita por KM", value: `${top.frota} — R$ ${formatNumber(top.receitaPerKm, 2)}/km`, icon: <Route className="h-4 w-4" />, color: "text-indigo-600" });
      }
    }

    return list;
  }, [fleetPerf, clientesData, cidadesData, dieselData, despResumo, resumo]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    /* -mt-3 sm:-mt-6 negates the scroll container's p-3/p-6 top padding so
       the filter bar sits flush at y=0, directly below the app header       */
    <div className="space-y-5 -mt-3 sm:-mt-6">

      {/* Sentinel — at y=0 of the scroll container; going out of view signals
          the filter bar is stuck so we can show the elevated shadow         */}
      <div ref={sentinelRef} className="h-px w-full -mb-px pointer-events-none select-none" aria-hidden />

      {/* ── Global Filters (sticky header-style) ───────────────────────── */}
      <div
        className={[
          "sticky top-0 z-50",
          "!mt-0",          /* cancel the space-y-5 gap — filter bar is flush */
          "-mx-3 sm:-mx-6 px-4 sm:px-6",
          "py-2.5",
          "bg-white dark:bg-slate-900",
          "border-b border-border",
          "transition-shadow duration-200",
          isStuck ? "shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)]" : "",
        ].join(" ")}
      >
        <div className="flex flex-wrap items-end gap-3">
          {/* Year */}
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Ano</Label>
            <Select value={ano.toString()} onValueChange={v => { setAno(parseInt(v)); resetDates(); }}>
              <SelectTrigger className="w-[90px] h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEARS.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {/* Custom date from */}
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">De</Label>
            <Input
              type="date"
              className="h-8 w-[140px] text-xs"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
            />
          </div>
          {/* Custom date to */}
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Até</Label>
            <Input
              type="date"
              className="h-8 w-[140px] text-xs"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
            />
          </div>
          {/* Frota filter */}
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Frota</Label>
            <Select value={frotaFilter} onValueChange={setFrotaFilter}>
              <SelectTrigger className="w-[110px] h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                {(frotasList ?? []).map(f => <SelectItem key={f.frota} value={f.frota}>{f.frota}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {/* Reset */}
          {(customFrom || customTo || frotaFilter !== "__all__") && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { resetDates(); setFrotaFilter("__all__"); }}>
              Limpar filtros
            </Button>
          )}
          <div className="ml-auto text-xs text-muted-foreground hidden sm:block">
            {customFrom || customTo
              ? `${customFrom || "—"} → ${customTo || "—"}`
              : `Jan–Dez ${ano}`}
          </div>
        </div>
      </div>

      {/* ── KPI Summary Row ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-3">
        <KpiCard title="Receita Total"       icon={<TrendingUp className="h-5 w-5" />}   value={formatCurrency(totalReceita)}                               valueColor="text-emerald-600" loading={l1} />
        <KpiCard title="Total Despesas"      icon={<TrendingDown className="h-5 w-5" />} value={formatCurrency(totalDespesas)}                              valueColor="text-red-500"     loading={l5} />
        <KpiCard title="Lucro Líquido"       icon={<DollarSign className="h-5 w-5" />}   value={formatCurrency(lucroLiquido)}                               valueColor={lucroLiquido >= 0 ? "text-emerald-600" : "text-red-500"} loading={l5} />
        <KpiCard title="Margem (%)"          icon={<Percent className="h-5 w-5" />}      value={`${formatNumber(margem, 1)}%`}                              valueColor={margem >= 0 ? "text-emerald-600" : "text-red-500"} loading={l5} />
        <KpiCard title="Nº Viagens"          icon={<Package className="h-5 w-5" />}      value={resumo ? String(resumo.totalViagens) : "0"}                 loading={l1} />
        <KpiCard title="Frotas Ativas"       icon={<Truck className="h-5 w-5" />}        value={String(frotaAtiva)}                                         loading={l10} sub="no período" />
        <KpiCard title="Total Diesel"        icon={<Fuel className="h-5 w-5" />}         value={formatCurrency(totalDiesel)}                                valueColor="text-amber-600" loading={l1} />
        <KpiCard title="Média por Viagem"    icon={<BarChart2 className="h-5 w-5" />}    value={resumo ? formatCurrency(resumo.mediaPorViagem) : "—"}        loading={l1} />
      </div>

      {/* ── Revenue Over Time ──────────────────────────────────────────── */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row flex-wrap items-start sm:items-center justify-between gap-2 pb-2">
          <div>
            <CardTitle className="text-sm sm:text-base">Receita por Período</CardTitle>
            <CardDescription>Evolução da receita de fretes</CardDescription>
          </div>
          <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
            <SelectTrigger className="w-[110px] h-8 shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="diario">Diário</SelectItem>
              <SelectItem value="semanal">Semanal</SelectItem>
              <SelectItem value="mensal">Mensal</SelectItem>
              <SelectItem value="trimestral">Trimestral</SelectItem>
              <SelectItem value="anual">Anual</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="h-64 sm:h-72 p-2 sm:p-6 pt-0 sm:pt-0">
          {l2 ? <Skeleton className="w-full h-full" /> : (
            periodoData && periodoData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={periodoData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gFrete" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#0a192f" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#0a192f" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gPedagio" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#2ecc71" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#2ecc71" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="periodo" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} width={52} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip {...CHART_STYLE} formatter={(v: number) => formatCurrency(v)} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="totalPedagio" name="Pedágio" stroke="#2ecc71" fill="url(#gPedagio)" stackId="1" strokeWidth={1.5} />
                  <Area type="monotone" dataKey="totalFrete"   name="Frete"   stroke="#0a192f" fill="url(#gFrete)"   stackId="1" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <EmptyChart />
          )}
        </CardContent>
      </Card>

      {/* ── Revenue vs Expenses | Expense Distribution ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base">Receita vs Despesas vs Lucro</CardTitle>
            <CardDescription>Comparativo mensal ({ano})</CardDescription>
          </CardHeader>
          <CardContent className="h-64 sm:h-72 p-2 sm:p-6 pt-0 sm:pt-0">
            {l6 ? <Skeleton className="w-full h-full" /> : (
              despMensal && despMensal.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={despMensal} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="mes" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} width={52} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                    <Tooltip {...CHART_STYLE} formatter={(v: number) => formatCurrency(v)} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="frete"  name="Receita"  fill="#0a192f" radius={[4,4,0,0]} />
                    <Bar dataKey="custos" name="Despesas" fill="#e74c3c" radius={[4,4,0,0]} />
                    <Line type="monotone" dataKey="lucro" name="Lucro" stroke="#2ecc71" strokeWidth={2.5} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : <EmptyChart />
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base">Despesas por Categoria</CardTitle>
            <CardDescription>Distribuição dos custos ({ano})</CardDescription>
          </CardHeader>
          <CardContent className="h-64 sm:h-72 p-2 sm:p-6 pt-0 sm:pt-0">
            {l5 ? <Skeleton className="w-full h-full" /> : (
              despResumo && despResumo.categorias.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={despResumo.categorias}
                      dataKey="valor"
                      nameKey="categoria"
                      cx="50%"
                      cy="50%"
                      innerRadius="40%"
                      outerRadius="70%"
                      paddingAngle={2}
                    >
                      {despResumo.categorias.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      {...CHART_STYLE}
                      formatter={(v: number, name: string) => [formatCurrency(v), name]}
                    />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <EmptyChart message="Nenhuma despesa para o ano selecionado" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Fleet Performance Ranking ──────────────────────────────────── */}
      <SectionHeader title="Ranking de Frotas" subtitle="Receita, despesas e eficiência por veículo — clique nas colunas para ordenar" />
      <Card className="shadow-sm">
        <CardContent className="p-3 sm:p-5">
          <FleetRankingTable data={fleetPerf} loading={l10} />
        </CardContent>
      </Card>

      {/* ── Top Customers | Top Destinations ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-[#0a192f]" /> Principais Clientes
            </CardTitle>
            <CardDescription>Top 10 por receita de frete</CardDescription>
          </CardHeader>
          <CardContent className="h-64 sm:h-80 p-2 sm:p-6 pt-0 sm:pt-0">
            {l7 ? <Skeleton className="w-full h-full" /> : (
              clientesData && clientesData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={clientesData.map(c => ({ ...c, label: truncate(c.cliente, 18) }))} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                    <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="label" fontSize={10} tickLine={false} axisLine={false} width={110} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip {...CHART_STYLE} formatter={(v: number) => formatCurrency(v)} labelFormatter={l => clientesData.find(c => truncate(c.cliente,18) === l)?.cliente ?? l} />
                    <Bar dataKey="totalFrete"   name="Frete"   stackId="a" fill="#0a192f" />
                    <Bar dataKey="totalPedagio" name="Pedágio" stackId="a" fill="#2ecc71" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyChart />
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-[#0a192f]" /> Destinos Mais Servidos
            </CardTitle>
            <CardDescription>Top 10 cidades por nº de viagens</CardDescription>
          </CardHeader>
          <CardContent className="h-64 sm:h-80 p-2 sm:p-6 pt-0 sm:pt-0">
            {l8 ? <Skeleton className="w-full h-full" /> : (
              cidadesData && cidadesData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cidadesData.map(c => ({ ...c, label: truncate(c.cidade, 18) }))} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                    <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                    <YAxis type="category" dataKey="label" fontSize={10} tickLine={false} axisLine={false} width={110} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip {...CHART_STYLE} formatter={(v: number, name: string) => [name === "viagens" ? v + " viagens" : formatCurrency(v), name === "viagens" ? "Viagens" : "Receita"]} labelFormatter={l => cidadesData.find(c => truncate(c.cidade,18) === l)?.cidade ?? l} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="viagens"    name="Viagens" fill="#3498db" radius={[0,4,4,0]} yAxisId={0} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyChart />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Transport Company Stats ────────────────────────────────────── */}
      {transpData && transpData.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base flex items-center gap-2">
              <Truck className="h-4 w-4 text-[#0a192f]" /> Por Transportadora
            </CardTitle>
            <CardDescription>Receita e viagens por empresa de transporte</CardDescription>
          </CardHeader>
          <CardContent className="p-3 sm:p-5 pt-0">
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Transportadora</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Viagens</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Receita Total</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">% Total</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground w-32">Participação</th>
                  </tr>
                </thead>
                <tbody>
                  {transpData.map((t, i) => (
                    <tr key={i} className="border-t hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2 font-medium">{t.transp}</td>
                      <td className="px-3 py-2 text-right">{t.viagens}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(t.totalGeral)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatNumber(t.pctTotal, 1)}%</td>
                      <td className="px-3 py-2">
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-[#0a192f] rounded-full transition-all" style={{ width: `${t.pctTotal}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Diesel Analytics ───────────────────────────────────────────── */}
      <SectionHeader title="Análise de Diesel" subtitle={`Consumo e eficiência de combustível — ${ano}`} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard title="Total Litros"    icon={<Fuel className="h-5 w-5" />}      value={`${formatNumber(totalLitros, 0)} L`}    loading={l4} />
        <KpiCard title="Custo Diesel"    icon={<DollarSign className="h-5 w-5" />} value={formatCurrency(totalDiesel)}             valueColor="text-amber-600" loading={l1} />
        <KpiCard title="Média KM/L"      icon={<Activity className="h-5 w-5" />}   value={avgKmL > 0 ? `${formatNumber(avgKmL, 2)} km/L` : "—"} loading={l4} />
        <KpiCard title="KM Percorrido"   icon={<Route className="h-5 w-5" />}      value={totalKm > 0 ? `${formatNumber(totalKm, 0)} km` : "—"} loading={l4} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base">Consumo por Frota</CardTitle>
            <CardDescription>Litros abastecidos e valor pago ({ano})</CardDescription>
          </CardHeader>
          <CardContent className="h-64 sm:h-72 p-2 sm:p-6 pt-0 sm:pt-0">
            {l4 ? <Skeleton className="w-full h-full" /> : (
              dieselData && dieselData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={dieselData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="placa" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" />
                    <YAxis yAxisId="l" fontSize={10} tickLine={false} axisLine={false} width={44} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `${v}L`} />
                    <YAxis yAxisId="r" orientation="right" fontSize={10} tickLine={false} axisLine={false} width={52} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                    <Tooltip {...CHART_STYLE} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    <Bar  yAxisId="l" dataKey="totalLitros" name="Litros (L)"     fill="#f39c12" radius={[4,4,0,0]} />
                    <Line yAxisId="r" type="monotone" dataKey="totalPago" name="Valor Pago (R$)" stroke="#c0392b" strokeWidth={2} dot={{ r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : <EmptyChart message="Nenhum dado de diesel para o ano selecionado" />
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base">KM/L por Frota</CardTitle>
            <CardDescription>Eficiência de combustível ({ano})</CardDescription>
          </CardHeader>
          <CardContent className="h-64 sm:h-72 p-2 sm:p-6 pt-0 sm:pt-0">
            {l4 ? <Skeleton className="w-full h-full" /> : (
              dieselData && dieselData.some(d => d.mediaGeral != null) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[...dieselData].sort((a,b) => (b.mediaGeral ?? 0)-(a.mediaGeral ?? 0))} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="placa" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} width={36} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `${v}`} />
                    <Tooltip {...CHART_STYLE} formatter={(v: number) => `${formatNumber(v, 2)} km/L`} />
                    <Bar dataKey="mediaGeral" name="Média KM/L" fill="#2ecc71" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyChart message="Nenhuma média de km/L disponível" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Despesas KPIs + Monthly trend ─────────────────────────────── */}
      <SectionHeader title="Análise de Despesas" subtitle={`Custos operacionais — ${ano}`} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard title="Receita (Despesas)"  icon={<TrendingUp className="h-5 w-5" />}   value={despResumo ? formatCurrency(despResumo.totalFrete)  : "—"} loading={l5} />
        <KpiCard title="Total Custos"        icon={<TrendingDown className="h-5 w-5" />} value={despResumo ? formatCurrency(despResumo.totalCustos) : "—"} valueColor="text-red-500" loading={l5} />
        <KpiCard title="Lucro Operacional"   icon={<DollarSign className="h-5 w-5" />}   value={despResumo ? formatCurrency(despResumo.totalLucro)  : "—"} valueColor={despResumo && despResumo.totalLucro >= 0 ? "text-emerald-600" : "text-red-500"} loading={l5} />
        <KpiCard title="Registros"           icon={<BarChart2 className="h-5 w-5" />}    value={despResumo ? String(despResumo.totalRegistros)      : "0"} loading={l5} />
      </div>

      {/* ── Smart Insights ─────────────────────────────────────────────── */}
      {insights.length > 0 && (
        <>
          <SectionHeader title="Insights Automáticos" subtitle="Destaques gerados automaticamente com base nos dados do período" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {insights.map((ins, i) => (
              <Card key={i} className="shadow-sm hover:shadow-md transition-shadow border-l-4 border-l-[#0a192f]">
                <CardContent className="p-4 flex items-start gap-3">
                  <div className={`mt-0.5 shrink-0 ${ins.color}`}>{ins.icon}</div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{ins.label}</p>
                    <p className="text-sm font-semibold text-foreground mt-0.5 break-words">{ins.value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* ── Upcoming Receivables | Recent Activity ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#0a192f]" /> Próximos Vencimentos
            </CardTitle>
            <CardDescription>Recebíveis nos próximos 30 dias</CardDescription>
          </CardHeader>
          <CardContent className="p-3 sm:p-5 pt-0">
            {l11 ? <Skeleton className="w-full h-40" /> : (
              receivables && receivables.length > 0 ? (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {receivables.map(r => (
                    <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border hover:bg-muted/30 transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold truncate">{r.cliente}</p>
                        <p className="text-[10px] text-muted-foreground">{r.frota} · {r.cidade}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-xs font-bold ${urgencyColor(r.diasFaltando)}`}>{formatCurrency(r.totalGeral)}</p>
                        <div className="flex items-center justify-end gap-1 mt-0.5">
                          <span className="text-[10px] text-muted-foreground">{r.vencimento ? formatDate(r.vencimento) : "—"}</span>
                          {urgencyBadge(r.diasFaltando)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                  <Zap className="h-6 w-6 opacity-30" />
                  <p className="text-sm">Nenhum vencimento nos próximos 30 dias</p>
                </div>
              )
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-[#0a192f]" /> Atividade Recente
            </CardTitle>
            <CardDescription>Últimas 10 entradas de frete</CardDescription>
          </CardHeader>
          <CardContent className="p-3 sm:p-5 pt-0">
            {l12 ? <Skeleton className="w-full h-40" /> : (
              recentFretes && recentFretes.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="pb-2 text-left font-semibold text-muted-foreground">Data</th>
                        <th className="pb-2 text-left font-semibold text-muted-foreground">Cliente</th>
                        <th className="pb-2 text-left font-semibold text-muted-foreground">Frota</th>
                        <th className="pb-2 text-left font-semibold text-muted-foreground">Destino</th>
                        <th className="pb-2 text-right font-semibold text-muted-foreground">Frete</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentFretes.map(f => (
                        <tr key={f.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="py-1.5 text-muted-foreground whitespace-nowrap">{formatDate(f.dataCte)}</td>
                          <td className="py-1.5 max-w-[100px] truncate" title={f.cliente}>{f.cliente}</td>
                          <td className="py-1.5 font-medium text-[#0a192f] dark:text-white whitespace-nowrap">{f.frota}</td>
                          <td className="py-1.5 max-w-[90px] truncate text-muted-foreground" title={f.cidade}>{f.cidade}</td>
                          <td className="py-1.5 text-right font-semibold whitespace-nowrap">{formatCurrency(f.totalGeral)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                  <Clock className="h-6 w-6 opacity-30" />
                  <p className="text-sm">Nenhuma atividade recente</p>
                </div>
              )
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Fleet Comparison ───────────────────────────────────────────── */}
      <SectionHeader title="Comparativo de Frotas" subtitle="Selecione duas frotas para comparar desempenho lado a lado" />
      <Card className="shadow-sm">
        <CardContent className="p-4 sm:p-6">
          <FleetComparison data={fleetPerf} />
        </CardContent>
      </Card>

    </div>
  );
}
