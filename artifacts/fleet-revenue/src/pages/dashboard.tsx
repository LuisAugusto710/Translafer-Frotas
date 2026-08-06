import { useState, useMemo, useEffect, useRef } from "react";
import {
  AreaChart, Area, BarChart, Bar, ComposedChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, Percent, Package, Truck,
  Fuel, BarChart2, Users, MapPin, Calendar, ChevronUp, ChevronDown,
  ChevronsUpDown, Star, Activity, Clock, Zap, Award, Route, Wrench,
  CheckCircle2, AlertTriangle, XCircle,
} from "lucide-react";
import {
  useGetDashboardResumo, getGetDashboardResumoQueryKey,
  useGetRevenueByPeriodo, getGetRevenueByPeriodoQueryKey,
  useGetMensalComparativo, getGetMensalComparativoQueryKey,
  useGetDieselByPlaca, getGetDieselByPlacaQueryKey,
  useGetDespesasResumo, getGetDespesasResumoQueryKey,
  useGetDespesasMensal, getGetDespesasMensalQueryKey,
  useGetDespesasMotoristaAjudante, getGetDespesasMotoristaAjudanteQueryKey,
  useGetTopClientes, getGetTopClientesQueryKey,
  useGetTopCidades, getGetTopCidadesQueryKey,
  useGetByTransportadora, getGetByTransportadoraQueryKey,
  useGetFleetPerformance, getGetFleetPerformanceQueryKey,
  useGetUpcomingReceivables, getGetUpcomingReceivablesQueryKey,
  useGetRecentFretes, getGetRecentFretesQueryKey,
  useListFrotas, getListFrotasQueryKey,
  useGetManutencaoPreventiva, getGetManutencaoPreventivaQueryKey,
  useGetAvailableYears, getGetAvailableYearsQueryKey,
  useGetAvailableMonths, getGetAvailableMonthsQueryKey,
  type FleetPerformance,
  type ManutencaoPreventivaItem,
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

const THIS_YEAR = new Date().getFullYear();

// ── Period filter types ───────────────────────────────────────────────────────
type PeriodMode = "custom" | "month" | "quarter" | "semester" | "year";

const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MONTHS_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

/** Compute dateFrom/dateTo from a period mode + year + sub-selection */
function computePeriodDates(
  mode: PeriodMode,
  year: number,
  subValue: string, // month (1-12), quarter (1-4), semester (1-2), or unused for year/custom
): { dateFrom: string; dateTo: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (mode === "month") {
    const m = parseInt(subValue) || 1; // subValue is 1-based month number (1-12)
    const lastDay = new Date(year, m, 0).getDate();
    return { dateFrom: `${year}-${pad(m)}-01`, dateTo: `${year}-${pad(m)}-${pad(lastDay)}` };
  }
  if (mode === "quarter") {
    const q = parseInt(subValue); // 1-4
    const startMonth = (q - 1) * 3 + 1;
    const endMonth   = startMonth + 2;
    const lastDay    = new Date(year, endMonth, 0).getDate();
    return { dateFrom: `${year}-${pad(startMonth)}-01`, dateTo: `${year}-${pad(endMonth)}-${pad(lastDay)}` };
  }
  if (mode === "semester") {
    const s = parseInt(subValue); // 1 or 2
    return s === 1
      ? { dateFrom: `${year}-01-01`, dateTo: `${year}-06-30` }
      : { dateFrom: `${year}-07-01`, dateTo: `${year}-12-31` };
  }
  // year or custom
  return { dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` };
}

const PIE_COLORS = [
  "#2563eb", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6",
  "#06b6d4", "#f97316", "#ec4899", "#14b8a6", "#64748b",
  "#a855f7", "#84cc16", "#0891b2", "#fb923c",
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
  return total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
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
        <h2 className="text-base font-bold text-foreground">{title}</h2>
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
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider leading-tight">
              {title}
            </p>
            {loading ? (
              <Skeleton className="h-7 w-24 mt-2" />
            ) : (
              <p className={`font-bold mt-1.5 tracking-tight leading-tight whitespace-nowrap ${valueColor}`}
               style={{ fontSize: "clamp(11px, 2.8vw, 15px)" }}>
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
          <div className="p-2 rounded-lg bg-primary/8 dark:bg-primary/10 shrink-0 text-primary dark:text-primary/80">
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
          ? <ChevronDown className="h-3 w-3 text-primary" />
          : <ChevronUp className="h-3 w-3 text-primary" />
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
            <tr key={r.frota} className={`border-t hover:bg-muted/30 transition-colors ${i === 0 && sortKey === "totalReceita" && sortDir === "desc" ? "bg-primary/5 dark:bg-primary/5" : ""}`}>
              <td className="px-3 py-2 text-muted-foreground font-medium">{i + 1}</td>
              {cols.map(c => {
                const val = c.fmt(r);
                const isLucro = c.key === "lucro" || c.key === "lucroPerKm";
                const color = isLucro
                  ? r.lucro >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
                  : "";
                return (
                  <td key={c.key} className={`px-3 py-2 whitespace-nowrap font-medium ${color}`}>
                    {c.key === "frota" ? <span className="font-bold text-foreground">{val}</span> : val}
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
                <th className="px-4 py-2 text-left text-xs font-semibold text-chart-1">Frota {frotaA}</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-chart-3">Frota {frotaB}</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map(m => (
                <tr key={m.label} className="border-t hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2 text-xs text-muted-foreground">{m.label}</td>
                  <td className={`px-4 py-2 font-medium text-sm ${m.higher === "a" ? "text-emerald-600 dark:text-emerald-400 font-bold" : ""}`}>
                    {m.fmt(a)}
                    {m.higher === "a" && <Star className="inline h-3 w-3 ml-1 text-emerald-500" />}
                  </td>
                  <td className={`px-4 py-2 font-medium text-sm ${m.higher === "b" ? "text-emerald-600 dark:text-emerald-400 font-bold" : ""}`}>
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

// ── Preventive Maintenance Section ───────────────────────────────────────────

const STATUS_CFG = {
  vencido: {
    label: "Vencida",
    rowCls: "bg-red-50 hover:bg-red-100/70",
    textCls: "text-red-700 font-bold",
    badgeCls: "bg-red-100 text-red-700 border border-red-200",
    dotCls: "bg-red-500",
    Icon: XCircle,
  },
  aviso: {
    label: "Próxima",
    rowCls: "bg-amber-50 hover:bg-amber-100/70",
    textCls: "text-amber-700 font-bold",
    badgeCls: "bg-amber-100 text-amber-700 border border-amber-200",
    dotCls: "bg-amber-400",
    Icon: AlertTriangle,
  },
  ok: {
    label: "Em dia",
    rowCls: "hover:bg-muted/30",
    textCls: "text-emerald-700 font-semibold",
    badgeCls: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    dotCls: "bg-emerald-500",
    Icon: CheckCircle2,
  },
} as const;

function PreventivaMaintSection({ items, loading }: { items: ManutencaoPreventivaItem[]; loading: boolean }) {
  if (loading) {
    return (
      <Card className="shadow-sm">
        <CardContent className="p-4 sm:p-6 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 rounded" />)}
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="shadow-sm">
        <CardContent className="p-6 flex flex-col items-center gap-3 text-muted-foreground">
          <Wrench className="h-8 w-8 opacity-30" />
          <p className="text-sm text-center">
            Nenhum intervalo configurado. Use o botão <strong>Intervalos</strong> na página de Manutenção para configurar.
          </p>
        </CardContent>
      </Card>
    );
  }

  const vencidos = items.filter(i => i.status === "vencido");
  const avisos   = items.filter(i => i.status === "aviso");
  const ok       = items.filter(i => i.status === "ok");

  return (
    <Card className="shadow-sm">
      <CardContent className="p-0">
        {/* ── Summary strip ── */}
        <div className="flex gap-5 px-4 sm:px-6 py-3 border-b bg-muted/20">
          {[
            { label: "Vencidas",  count: vencidos.length, cls: "text-red-600" },
            { label: "Próximas",  count: avisos.length,   cls: "text-amber-600" },
            { label: "Em dia",    count: ok.length,        cls: "text-emerald-600" },
            { label: "Total",     count: items.length,     cls: "text-muted-foreground" },
          ].map(s => (
            <div key={s.label} className="flex items-baseline gap-1">
              <span className={`text-lg font-bold ${s.cls}`}>{s.count}</span>
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </div>

        {/* ── Table (sorted server-side: Red → Yellow → Green) ── */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b bg-muted/30 text-muted-foreground text-left">
                <th className="px-3 py-2 font-semibold whitespace-nowrap">Status</th>
                <th className="px-3 py-2 font-semibold whitespace-nowrap">Frota</th>
                <th className="px-3 py-2 font-semibold whitespace-nowrap">Categoria</th>
                <th className="px-3 py-2 font-semibold whitespace-nowrap">Tipo</th>
                <th className="px-3 py-2 font-semibold whitespace-nowrap">Última Manut.</th>
                <th className="px-3 py-2 font-semibold whitespace-nowrap text-right">Último KM</th>
                <th className="px-3 py-2 font-semibold whitespace-nowrap text-right">Intervalo</th>
                <th className="px-3 py-2 font-semibold whitespace-nowrap text-right">Próx. KM</th>
                <th className="px-3 py-2 font-semibold whitespace-nowrap text-right">KM Atual</th>
                <th className="px-3 py-2 font-semibold whitespace-nowrap text-right">Restante</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const cfg = STATUS_CFG[item.status];
                const { Icon } = cfg;
                const restanteLabel =
                  item.kmRestante <= 0
                    ? `−${Math.abs(Math.round(item.kmRestante)).toLocaleString("pt-BR")} km`
                    : `+${Math.round(item.kmRestante).toLocaleString("pt-BR")} km`;

                return (
                  <tr
                    key={`${item.frota}-${item.categoria}`}
                    className={`border-b last:border-0 transition-colors ${cfg.rowCls}`}
                  >
                    {/* Status badge */}
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold ${cfg.badgeCls}`}>
                        <Icon className="h-3 w-3 shrink-0" />
                        {cfg.label}
                      </span>
                    </td>

                    {/* Frota */}
                    <td className="px-3 py-2 font-bold text-foreground whitespace-nowrap">
                      {item.frota}
                    </td>

                    {/* Categoria */}
                    <td className="px-3 py-2 text-foreground whitespace-nowrap max-w-[160px] truncate">
                      {item.categoria}
                    </td>

                    {/* Tipo da última manutenção */}
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                      {item.ultimoTipo ?? "—"}
                    </td>

                    {/* Última data */}
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                      {item.ultimaData
                        ? item.ultimaData.split("-").reverse().join("/")
                        : "—"}
                    </td>

                    {/* Último KM */}
                    <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                      {(item.ultimoKm ?? 0).toLocaleString("pt-BR")} km
                    </td>

                    {/* Intervalo */}
                    <td className="px-3 py-2 text-right text-muted-foreground whitespace-nowrap">
                      {item.intervaloKm.toLocaleString("pt-BR")} km
                    </td>

                    {/* Próx. KM */}
                    <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                      {Math.round(item.kmProxima).toLocaleString("pt-BR")} km
                    </td>

                    {/* KM Atual */}
                    <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                      {item.kmAtual.toLocaleString("pt-BR")} km
                    </td>

                    {/* Restante */}
                    <td className={`px-3 py-2 text-right whitespace-nowrap ${cfg.textCls}`}>
                      {restanteLabel}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Chart period type & smart-default helper ──────────────────────────────────

type ChartPeriod = "diario" | "semanal" | "mensal" | "semestral" | "trimestral" | "anual";

/**
 * Derive the most meaningful chart time scale from the global dashboard period.
 * One level more granular than the selected global filter.
 */
function deriveChartPeriod(
  mode: PeriodMode,
  customFrom: string,
  customTo: string,
): ChartPeriod {
  if (mode === "year")     return "semestral";
  if (mode === "semester") return "trimestral";
  if (mode === "quarter")  return "mensal";
  if (mode === "month")    return "semanal";
  // custom: pick based on date-range length
  if (customFrom && customTo) {
    const days =
      (new Date(customTo).getTime() - new Date(customFrom).getTime()) /
      (1000 * 60 * 60 * 24);
    return days <= 92 ? "semanal" : "mensal"; // ≤ ~3 months → weekly; else monthly
  }
  return "mensal";
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export function Dashboard() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1; // 1-based

  // Start with current year/month as placeholders; they are replaced by API data below
  const [ano, setAno]               = useState(currentYear);
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const [subValue, setSubValue]     = useState<string>(String(currentMonth)); // 1-based month (1-12)
  const [customFrom, setCustomFrom] = useState("");
  const [customTo,   setCustomTo]   = useState("");
  const [frotaFilter, setFrotaFilter] = useState("__all__");
  const [period, setPeriod] = useState<ChartPeriod>(() => deriveChartPeriod("month", "", ""));

  // Tracks whether the user manually overrode the chart period scale.
  // Resets to false whenever the global dashboard filter changes.
  const chartPeriodOverride = useRef(false);

  // Tracks whether we've already applied the smart default from the API
  const initializedFromApi = useRef(false);

  // Dynamic years from database
  const { data: availableYearsData } = useGetAvailableYears({
    query: { queryKey: getGetAvailableYearsQueryKey(), staleTime: 60_000 },
  });
  const availableYears = availableYearsData?.years?.length
    ? availableYearsData.years
    : [currentYear];

  // Smart default: once the API returns, set the most recent year+month with records
  useEffect(() => {
    if (availableYearsData && !initializedFromApi.current) {
      initializedFromApi.current = true;
      setAno(availableYearsData.latestYear ?? currentYear);
      setSubValue(String(availableYearsData.latestMonth ?? currentMonth));
      setPeriodMode("month");
    }
  }, [availableYearsData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dynamic months for the selected year
  const { data: availableMonthsData } = useGetAvailableMonths(
    { year: ano },
    { query: { queryKey: getGetAvailableMonthsQueryKey({ year: ano }), staleTime: 60_000 } },
  );
  const availableMonths = availableMonthsData?.months ?? [];

  // When year changes and selected month is not available, auto-select the most recent
  useEffect(() => {
    if (periodMode === "month" && availableMonths.length > 0) {
      const cur = parseInt(subValue);
      if (!availableMonths.includes(cur)) {
        setSubValue(String(availableMonths[availableMonths.length - 1]));
      }
    }
  }, [availableMonths, periodMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-update chart period whenever the global filter changes,
  // unless the user has manually overridden it.
  useEffect(() => {
    if (!chartPeriodOverride.current) {
      setPeriod(deriveChartPeriod(periodMode, customFrom, customTo));
    }
    // Any global-filter change resets the override so the NEXT filter change
    // picks up the smart default again.
    chartPeriodOverride.current = false;
  }, [periodMode, ano, subValue, customFrom, customTo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute dateFrom/dateTo based on period mode
  const { dateFrom: periodFrom, dateTo: periodTo } = periodMode !== "custom"
    ? computePeriodDates(periodMode, ano, subValue)
    : { dateFrom: customFrom || `${ano}-01-01`, dateTo: customTo || `${ano}-12-31` };

  const dateFrom: any = periodFrom;
  const dateTo:   any = periodTo;
  const frotaParam = frotaFilter !== "__all__" ? frotaFilter : undefined;

  // Change period mode, resetting subValue to a sensible default for the new mode
  function handlePeriodModeChange(mode: PeriodMode) {
    setPeriodMode(mode);
    if (mode === "month") {
      // Pick most recent available month, or current month as fallback
      const best = availableMonths.length ? availableMonths[availableMonths.length - 1] : currentMonth;
      setSubValue(String(best));
    }
    if (mode === "quarter")  setSubValue(String(Math.ceil(currentMonth / 3)));
    if (mode === "semester") setSubValue(currentMonth <= 6 ? "1" : "2");
    if (mode === "year" || mode === "custom") setSubValue("");
  }

  // Handle year change: update ano and let the month auto-adjust via the effect above
  function handleYearChange(y: number) {
    setAno(y);
  }

  function resetDates() {
    setCustomFrom(""); setCustomTo("");
    setPeriodMode("month");
    const best = availableMonths.length ? availableMonths[availableMonths.length - 1] : currentMonth;
    setSubValue(String(best));
  }

  // ── Data hooks ─────────────────────────────────────────────────────────────
  const { data: resumo,        isLoading: l1 } = useGetDashboardResumo({ dateFrom, dateTo, frota: frotaParam as any }, { query: { queryKey: getGetDashboardResumoQueryKey({ dateFrom, dateTo, frota: frotaParam as any }) } });
  const { data: periodoData,   isLoading: l2 } = useGetRevenueByPeriodo({ period, dateFrom, dateTo, frota: frotaParam as any }, { query: { queryKey: getGetRevenueByPeriodoQueryKey({ period, dateFrom, dateTo, frota: frotaParam as any }) } });
  const { data: mensalData,    isLoading: l3 } = useGetMensalComparativo({ ano, frota: frotaParam as any }, { query: { queryKey: getGetMensalComparativoQueryKey({ ano, frota: frotaParam as any }) } });
  const { data: dieselData,    isLoading: l4 } = useGetDieselByPlaca({ ano, frota: frotaParam as any }, { query: { queryKey: getGetDieselByPlacaQueryKey({ ano, frota: frotaParam as any }) } });
  const { data: despResumo,    isLoading: l5 } = useGetDespesasResumo({ ano, dateFrom, dateTo, frota: frotaParam as any }, { query: { queryKey: getGetDespesasResumoQueryKey({ ano, dateFrom, dateTo, frota: frotaParam as any }) } });
  const { data: despMensal,    isLoading: l6 } = useGetDespesasMensal({ ano, dateFrom, dateTo, frota: frotaParam as any }, { query: { queryKey: getGetDespesasMensalQueryKey({ ano, dateFrom, dateTo, frota: frotaParam as any }) } });
  const { data: motAjud,       isLoading: l13} = useGetDespesasMotoristaAjudante({ dateFrom, dateTo, frota: frotaParam as any }, { query: { queryKey: getGetDespesasMotoristaAjudanteQueryKey({ dateFrom, dateTo, frota: frotaParam as any }) } });
  const { data: clientesData,  isLoading: l7 } = useGetTopClientes({ dateFrom, dateTo, frota: frotaParam as any }, { query: { queryKey: getGetTopClientesQueryKey({ dateFrom, dateTo, frota: frotaParam as any }) } });
  const { data: cidadesData,   isLoading: l8 } = useGetTopCidades({ dateFrom, dateTo, frota: frotaParam as any }, { query: { queryKey: getGetTopCidadesQueryKey({ dateFrom, dateTo, frota: frotaParam as any }) } });
  const { data: transpData,    isLoading: l9 } = useGetByTransportadora({ dateFrom, dateTo, frota: frotaParam as any }, { query: { queryKey: getGetByTransportadoraQueryKey({ dateFrom, dateTo, frota: frotaParam as any }) } });
  const { data: fleetPerf,     isLoading: l10} = useGetFleetPerformance({ dateFrom, dateTo, frota: frotaParam as any }, { query: { queryKey: getGetFleetPerformanceQueryKey({ dateFrom, dateTo, frota: frotaParam as any }) } });
  const { data: receivables,   isLoading: l11} = useGetUpcomingReceivables({ frota: frotaParam as any }, { query: { queryKey: getGetUpcomingReceivablesQueryKey({ frota: frotaParam as any } as any) } });
  const { data: recentFretes,  isLoading: l12} = useGetRecentFretes({ limit: 10, frota: frotaParam as any, dateFrom, dateTo } as any, { query: { queryKey: getGetRecentFretesQueryKey({ limit: 10, frota: frotaParam as any, dateFrom, dateTo } as any) } });
  const { data: frotasList } = useListFrotas({ query: { queryKey: getListFrotasQueryKey() } });
  const { data: preventiva = [], isLoading: lprev } = useGetManutencaoPreventiva({ query: { queryKey: getGetManutencaoPreventivaQueryKey(), staleTime: 0, refetchOnWindowFocus: true } });

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
      list.push({ label: "Maior cliente", value: `${truncate(top.cliente, 22)} — ${formatCurrency(top.totalGeral)}`, icon: <Users className="h-4 w-4" />, color: "text-primary" });
    }
    if (cidadesData && cidadesData.length > 0) {
      const top = cidadesData[0];
      list.push({ label: "Destino mais servido", value: `${truncate(top.cidade, 22)} — ${top.viagens} viagens`, icon: <MapPin className="h-4 w-4" />, color: "text-blue-600" });
    }
    if (dieselData && dieselData.length > 0) {
      const best = [...dieselData].sort((a, b) => (b.mediaGeral ?? 0) - (a.mediaGeral ?? 0))[0];
      if (best.mediaGeral) {
        list.push({ label: "Melhor eficiência (km/L)", value: `${best.placa} — ${formatNumber(best.mediaGeral, 1)} km/L`, icon: <Fuel className="h-4 w-4" />, color: "text-amber-600" });
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
    <div className="space-y-5">

      {/* ── Global Filters ──────────────────────────────────────────────── */}
      <div className="px-4 sm:px-6 py-2.5 bg-white dark:bg-slate-900 border-b border-border -mx-3 sm:-mx-6">
        <div className="flex flex-wrap items-end gap-2 sm:gap-2.5">

          {/* Period mode — order: Mês → Trimestre → Semestre → Ano → Personalizado */}
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Período</Label>
            <Select value={periodMode} onValueChange={v => handlePeriodModeChange(v as PeriodMode)}>
              <SelectTrigger className="w-[110px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Mês</SelectItem>
                <SelectItem value="quarter">Trimestre</SelectItem>
                <SelectItem value="semester">Semestre</SelectItem>
                <SelectItem value="year">Ano</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Year (always visible) */}
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Ano</Label>
            <Select value={ano.toString()} onValueChange={v => handleYearChange(parseInt(v))}>
              <SelectTrigger className="w-[74px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {availableYears.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Month sub-selector — only shows months that have records for the selected year */}
          {periodMode === "month" && (
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Mês</Label>
              <Select value={subValue} onValueChange={setSubValue}>
                <SelectTrigger className="w-[110px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(availableMonths.length > 0 ? availableMonths : Array.from({length:12},(_,i)=>i+1))
                    .map(m => <SelectItem key={m} value={String(m)}>{MONTH_NAMES[m - 1]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Quarter sub-selector */}
          {periodMode === "quarter" && (
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Trimestre</Label>
              <Select value={subValue} onValueChange={setSubValue}>
                <SelectTrigger className="w-[104px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">T1 Jan–Mar</SelectItem>
                  <SelectItem value="2">T2 Abr–Jun</SelectItem>
                  <SelectItem value="3">T3 Jul–Set</SelectItem>
                  <SelectItem value="4">T4 Out–Dez</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Semester sub-selector */}
          {periodMode === "semester" && (
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Semestre</Label>
              <Select value={subValue} onValueChange={setSubValue}>
                <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1º Sem Jan–Jun</SelectItem>
                  <SelectItem value="2">2º Sem Jul–Dez</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Custom date range */}
          {periodMode === "custom" && (<>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">De</Label>
              <Input type="date" className="h-8 w-[120px] sm:w-[132px] text-xs"
                value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Até</Label>
              <Input type="date" className="h-8 w-[120px] sm:w-[132px] text-xs"
                value={customTo} onChange={e => setCustomTo(e.target.value)} />
            </div>
          </>)}

          {/* Frota filter */}
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Frota</Label>
            <Select value={frotaFilter} onValueChange={setFrotaFilter}>
              <SelectTrigger className="w-[88px] sm:w-[100px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                {(frotasList ?? []).map(f => <SelectItem key={f.frota} value={f.frota}>{f.frota}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Reset — only shown when non-default state is active */}
          {(periodMode !== "month" || frotaFilter !== "__all__") && (
            <Button variant="ghost" size="sm" className="h-8 text-xs self-end px-2"
              onClick={() => { resetDates(); setFrotaFilter("__all__"); }}>
              Limpar
            </Button>
          )}

          {/* Active range badge (desktop only) */}
          <div className="ml-auto text-xs text-muted-foreground hidden sm:block self-end pb-1">
            {dateFrom} → {dateTo}
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
          <Select
            value={period}
            onValueChange={(v: any) => {
              chartPeriodOverride.current = true;
              setPeriod(v);
            }}
          >
            <SelectTrigger className="w-[120px] h-8 shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="diario">Diário</SelectItem>
              <SelectItem value="semanal">Semanal</SelectItem>
              <SelectItem value="mensal">Mensal</SelectItem>
              <SelectItem value="trimestral">Trimestral</SelectItem>
              <SelectItem value="semestral">Semestral</SelectItem>
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
                      <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gPedagio" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="periodo" fontSize={10} tickLine={false} axisLine={false} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} width={44} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip {...CHART_STYLE} formatter={(v: number) => formatCurrency(v)} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="totalPedagio" name="Pedágio" stroke="#10b981" fill="url(#gPedagio)" stackId="1" strokeWidth={1.5} />
                  <Area type="monotone" dataKey="totalFrete"   name="Frete"   stroke="#2563eb" fill="url(#gFrete)"   stackId="1" strokeWidth={2} />
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
                    <YAxis fontSize={10} tickLine={false} axisLine={false} width={44} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                    <Tooltip {...CHART_STYLE} formatter={(v: number) => formatCurrency(v)} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="frete"  name="Receita"  fill="#2563eb" radius={[4,4,0,0]} />
                    <Bar dataKey="custos" name="Despesas" fill="#ef4444" radius={[4,4,0,0]} />
                    <Line type="monotone" dataKey="lucro" name="Lucro" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} />
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
              <Users className="h-4 w-4 text-primary" /> Principais Clientes
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
                    <Bar dataKey="totalFrete"   name="Frete"   stackId="a" fill="#2563eb" />
                    <Bar dataKey="totalPedagio" name="Pedágio" stackId="a" fill="#10b981" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyChart />
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" /> Destinos Mais Servidos
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
                    <Tooltip {...CHART_STYLE} formatter={(v: number, name: string) => [name === "Viagens" ? v + " viagens" : formatCurrency(v), name === "Viagens" ? "Viagens" : "Receita"]} labelFormatter={l => cidadesData.find(c => truncate(c.cidade,18) === l)?.cidade ?? l} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="viagens"    name="Viagens" fill="#8b5cf6" radius={[0,4,4,0]} yAxisId={0} />
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
              <Truck className="h-4 w-4 text-primary" /> Por Transportadora
            </CardTitle>
            <CardDescription>Receita e viagens por empresa de transporte</CardDescription>
          </CardHeader>
          <CardContent className="p-3 sm:p-5 pt-0">
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Transportadora</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Viagens</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Receita Total</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Total Despesas</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">% Total</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground w-32">Participação</th>
                  </tr>
                </thead>
                <tbody>
                  {transpData.map((t, i) => (
                    <tr key={i} className="border-t hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2 font-medium">{t.transp}</td>
                      <td className="px-3 py-2">{t.viagens}</td>
                      <td className="px-3 py-2">{formatCurrency(t.totalGeral)}</td>
                      <td className="px-3 py-2 text-red-600 dark:text-red-400">{formatCurrency(t.totalDespesas)}</td>
                      <td className="px-3 py-2 font-semibold">{formatNumber(t.pctTotal, 1)}%</td>
                      <td className="px-3 py-2">
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${t.pctTotal}%` }} />
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
        <KpiCard title="Média KM/L"      icon={<Activity className="h-5 w-5" />}   value={avgKmL > 0 ? `${formatNumber(avgKmL, 1)} km/L` : "—"} loading={l4} />
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
                    <YAxis yAxisId="r" orientation="right" fontSize={10} tickLine={false} axisLine={false} width={44} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                    <Tooltip {...CHART_STYLE} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    <Bar  yAxisId="l" dataKey="totalLitros" name="Litros (L)"     fill="#f59e0b" radius={[4,4,0,0]} />
                    <Line yAxisId="r" type="monotone" dataKey="totalPago" name="Valor Pago (R$)" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
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
                    <Tooltip {...CHART_STYLE} formatter={(v: number) => `${formatNumber(v, 1)} km/L`} />
                    <Bar dataKey="mediaGeral" name="Média KM/L" fill="#10b981" radius={[4,4,0,0]} />
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

      {/* ── Driver & Assistant Costs Chart ─────────────────────────────── */}
      {(motAjud && motAjud.length > 0) || l13 ? (
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Custos por Motorista e Ajudante
            </CardTitle>
            <CardDescription>
              Total pago por pessoa no período — ordenado pelo maior valor
            </CardDescription>
          </CardHeader>
          <CardContent className="p-2 sm:p-6 pt-0 sm:pt-0">
            {l13 ? <Skeleton className="w-full h-48" /> : motAjud && motAjud.length > 0 ? (
              <>
                <div className="flex items-center gap-4 mb-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#2563eb" }} />Motorista</span>
                  <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#8b5cf6" }} />Ajudante</span>
                </div>
                <div className="overflow-y-auto" style={{ maxHeight: 400 }}>
                  <div style={{ height: Math.max(180, motAjud.length * 36) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={motAjud}
                        layout="vertical"
                        margin={{ top: 4, right: 80, left: 4, bottom: 4 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                        <XAxis
                          type="number"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                          stroke="hsl(var(--muted-foreground))"
                          tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`}
                        />
                        <YAxis
                          type="category"
                          dataKey="nome"
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          width={130}
                          stroke="hsl(var(--muted-foreground))"
                          tick={{ fill: "hsl(var(--foreground))" }}
                        />
                        <Tooltip
                          {...CHART_STYLE}
                          formatter={(v: number, _name: string, props: any) => [
                            formatCurrency(v),
                            props?.payload?.tipo ?? "Total pago",
                          ]}
                        />
                        <Bar dataKey="total" name="Total pago" radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 10, formatter: (v: number) => formatCurrency(v) }}>
                          {motAjud.map((entry, i) => (
                            <Cell key={i} fill={entry.tipo === "Motorista" ? "#2563eb" : "#8b5cf6"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            ) : <EmptyChart message="Nenhum dado de motorista ou ajudante para o período" />}
          </CardContent>
        </Card>
      ) : null}

      {/* ── Smart Insights ─────────────────────────────────────────────── */}
      {insights.length > 0 && (
        <>
          <SectionHeader title="Insights Automáticos" subtitle="Destaques gerados automaticamente com base nos dados do período" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {insights.map((ins, i) => (
              <Card key={i} className="shadow-sm hover:shadow-md transition-shadow border-l-4 border-l-primary">
                <CardContent className="p-4 flex items-start gap-3">
                  <div className={`mt-0.5 shrink-0 ${ins.color}`}>{ins.icon}</div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{ins.label}</p>
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
              <Calendar className="h-4 w-4 text-muted-foreground" /> Próximos Vencimentos
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
                        <p className="text-xs text-muted-foreground">{r.frota} · {r.cidade}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-xs font-bold ${urgencyColor(r.diasFaltando)}`}>{formatCurrency(r.totalGeral)}</p>
                        <div className="flex items-center justify-end gap-1 mt-0.5">
                          <span className="text-xs text-muted-foreground">{r.vencimento ? formatDate(r.vencimento) : "—"}</span>
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
              <Clock className="h-4 w-4 text-muted-foreground" /> Atividade Recente
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
                        <th className="pb-2 text-left font-semibold text-muted-foreground">Frete</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentFretes.map(f => (
                        <tr key={f.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="py-1.5 text-muted-foreground whitespace-nowrap">{formatDate(f.dataCte)}</td>
                          <td className="py-1.5 max-w-[100px] truncate" title={f.cliente}>{f.cliente}</td>
                          <td className="py-1.5 font-medium text-foreground whitespace-nowrap">{f.frota}</td>
                          <td className="py-1.5 max-w-[90px] truncate text-muted-foreground" title={f.cidade}>{f.cidade}</td>
                          <td className="py-1.5 font-semibold whitespace-nowrap">{formatCurrency(f.totalGeral)}</td>
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

      {/* ── Preventive Maintenance ─────────────────────────────────────── */}
      <SectionHeader
        title="Manutenção Preventiva"
        subtitle="Status de manutenção por frota e categoria com base nos intervalos configurados"
      />
      <PreventivaMaintSection items={preventiva} loading={lprev} />

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
