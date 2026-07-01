import { useState } from "react";
import { 
  useGetDashboardResumo, 
  getGetDashboardResumoQueryKey,
  useGetRevenueByPeriodo,
  getGetRevenueByPeriodoQueryKey,
  useGetRevenueByFrota,
  getGetRevenueByFrotaQueryKey,
  useGetMensalComparativo,
  getGetMensalComparativoQueryKey,
  useGetDieselByPlaca,
  getGetDieselByPlacaQueryKey,
  useGetDespesasResumo,
  getGetDespesasResumoQueryKey,
  useGetDespesasMensal,
  getGetDespesasMensalQueryKey
} from "@workspace/api-client-react";
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, ComposedChart
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function Dashboard() {
  const [period, setPeriod] = useState<"diario" | "semanal" | "mensal" | "trimestral" | "anual">("mensal");
  const [ano, setAno] = useState<number>(new Date().getFullYear());

  // Build date range strings from the selected year.
  // Passed as `any` because the generated type expects Date but Orval's URL builder
  // calls String(value), so plain ISO strings serialize correctly: "2026-01-01".
  const dateFrom = `${ano}-01-01` as any;
  const dateTo   = `${ano}-12-31` as any;

  const { data: resumo, isLoading: loadingResumo } = useGetDashboardResumo(
    { dateFrom, dateTo },
    { query: { queryKey: getGetDashboardResumoQueryKey({ dateFrom, dateTo }) } }
  );

  const { data: periodoData, isLoading: loadingPeriodo } = useGetRevenueByPeriodo(
    { period, dateFrom, dateTo },
    { query: { queryKey: getGetRevenueByPeriodoQueryKey({ period, dateFrom, dateTo }) } }
  );

  const { data: frotaData, isLoading: loadingFrota } = useGetRevenueByFrota(
    { dateFrom, dateTo },
    { query: { queryKey: getGetRevenueByFrotaQueryKey({ dateFrom, dateTo }) } }
  );

  const { data: mensalData, isLoading: loadingMensal } = useGetMensalComparativo({ ano }, {
    query: { queryKey: getGetMensalComparativoQueryKey({ ano }) }
  });

  const { data: dieselData, isLoading: loadingDiesel } = useGetDieselByPlaca({ ano }, {
    query: { queryKey: getGetDieselByPlacaQueryKey({ ano }) }
  });

  const { data: despesasResumo, isLoading: loadingDespResumo } = useGetDespesasResumo({ ano }, {
    query: { queryKey: getGetDespesasResumoQueryKey({ ano }) }
  });

  const { data: despesasMensal, isLoading: loadingDespMensal } = useGetDespesasMensal({ ano }, {
    query: { queryKey: getGetDespesasMensalQueryKey({ ano }) }
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-lg shadow-sm border">
        <h2 className="text-lg sm:text-xl font-bold text-[#0a192f] dark:text-white">
          Resumo Operacional
        </h2>
        <Select value={ano.toString()} onValueChange={(v) => setAno(parseInt(v))}>
          <SelectTrigger className="w-[110px]">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            {[2022, 2023, 2024, 2025, 2026].map((y) => (
              <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards — 2 cols on mobile, 3 on md, 4 on lg */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard title="Receita Total"         value={resumo ? formatCurrency(resumo.totalGeral) : "R$ 0,00"}    valueColor="text-[#2ecc71]" loading={loadingResumo} />
        <KpiCard title="Total Frete"           value={resumo ? formatCurrency(resumo.totalFrete) : "R$ 0,00"}    loading={loadingResumo} />
        <KpiCard title="Total Pedágio"         value={resumo ? formatCurrency(resumo.totalPedagio) : "R$ 0,00"}  loading={loadingResumo} />
        <KpiCard title="Total Diesel"          value={resumo ? formatCurrency(resumo.totalDiesel) : "R$ 0,00"}   valueColor="text-red-500" loading={loadingResumo} />
        <KpiCard title="Total Viagens"         value={resumo?.totalViagens?.toString() || "0"}                   loading={loadingResumo} />
        <KpiCard title="Média por Viagem"      value={resumo ? formatCurrency(resumo.mediaPorViagem) : "R$ 0,00"} loading={loadingResumo} />
        <KpiCard title="Total Litros Diesel"   value={resumo ? `${formatNumber(resumo.totalLitros)} L` : "0 L"}  loading={loadingResumo} />
      </div>

      {/* Charts — 1 col on mobile, 2 on lg */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Frete por Período */}
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start sm:items-center justify-between gap-2 pb-2">
            <div className="min-w-0">
              <CardTitle className="text-sm sm:text-base">Frete por Período</CardTitle>
              <CardDescription>Evolução da receita</CardDescription>
            </div>
            <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
              <SelectTrigger className="w-[110px] shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="diario">Diário</SelectItem>
                <SelectItem value="semanal">Semanal</SelectItem>
                <SelectItem value="mensal">Mensal</SelectItem>
                <SelectItem value="trimestral">Trimestral</SelectItem>
                <SelectItem value="anual">Anual</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="h-64 sm:h-80 p-2 sm:p-6">
            {loadingPeriodo ? <Skeleton className="w-full h-full" /> : (
              periodoData && periodoData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={periodoData} margin={{ top: 10, right: 8, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorFrete" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0a192f" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#0a192f" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorPedagio" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2ecc71" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#2ecc71" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="periodo" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={50} tickFormatter={(val) => `R$${(val / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
                      formatter={(value: number) => formatCurrency(value)}
                    />
                    <Legend />
                    <Area type="monotone" dataKey="totalPedagio" name="Pedágio" stroke="#2ecc71" fillOpacity={1} fill="url(#colorPedagio)" stackId="1" />
                    <Area type="monotone" dataKey="totalFrete"   name="Frete"   stroke="#0a192f" fillOpacity={1} fill="url(#colorFrete)"   stackId="1" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Nenhum dado para o período selecionado
                </div>
              )
            )}
          </CardContent>
        </Card>

        {/* Frete por Frota */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base">Frete por Frota</CardTitle>
            <CardDescription>Ranking de veículos por receita</CardDescription>
          </CardHeader>
          <CardContent className="h-64 sm:h-80 p-2 sm:p-6">
            {loadingFrota ? <Skeleton className="w-full h-full" /> : (
              frotaData && frotaData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={frotaData.slice(0, 10)} layout="vertical" margin={{ top: 10, right: 8, left: 20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `R$${(val / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="frota" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={40} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
                      formatter={(value: number) => formatCurrency(value)}
                    />
                    <Legend />
                    <Bar dataKey="totalFrete"   name="Frete"   stackId="a" fill="#0a192f" />
                    <Bar dataKey="totalPedagio" name="Pedágio" stackId="a" fill="#2ecc71" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Nenhum dado para o ano selecionado
                </div>
              )
            )}
          </CardContent>
        </Card>

        {/* Comparativo Mensal — full width */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base">Comparativo Mensal ({ano})</CardTitle>
            <CardDescription>Receita vs Custos de Diesel</CardDescription>
          </CardHeader>
          <CardContent className="h-64 sm:h-80 p-2 sm:p-6">
            {loadingMensal ? <Skeleton className="w-full h-full" /> : (
              mensalData && mensalData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={mensalData} margin={{ top: 10, right: 8, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={50} tickFormatter={(val) => `R$${(val / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
                      formatter={(value: number) => formatCurrency(value)}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="frete"        name="Receita"        fill="#0a192f" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="left" dataKey="diesel"       name="Diesel"         fill="#e74c3c" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="left" type="monotone" dataKey="lucroLiquido" name="Lucro Líquido" stroke="#2ecc71" strokeWidth={3} dot={{ r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Nenhum dado para o ano selecionado
                </div>
              )
            )}
          </CardContent>
        </Card>

        {/* Consumo de Diesel — full width */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base">Consumo de Diesel por Placa ({ano})</CardTitle>
            <CardDescription>Litros abastecidos e valor pago</CardDescription>
          </CardHeader>
          <CardContent className="h-64 sm:h-80 p-2 sm:p-6">
            {loadingDiesel ? <Skeleton className="w-full h-full" /> : (
              dieselData && dieselData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={dieselData} margin={{ top: 10, right: 8, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="placa" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="left"  stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={44} tickFormatter={(val) => `${val}L`} />
                    <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={48} tickFormatter={(val) => `R$${(val / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
                    />
                    <Legend />
                    <Bar  yAxisId="left"  dataKey="totalLitros" name="Litros"         fill="#f39c12" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="totalPago" name="Valor Pago (R$)" stroke="#c0392b" strokeWidth={2} dot={{ r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Nenhum dado para o ano selecionado
                </div>
              )
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Despesas section ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-lg shadow-sm border">
        <h2 className="text-lg sm:text-xl font-bold text-[#0a192f] dark:text-white">
          Análise de Despesas ({ano})
        </h2>
      </div>

      {/* Despesas KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard title="Frete (Despesas)"   value={despesasResumo ? formatCurrency(despesasResumo.totalFrete) : "R$ 0,00"}  loading={loadingDespResumo} />
        <KpiCard title="Total Custos"        value={despesasResumo ? formatCurrency(despesasResumo.totalCustos) : "R$ 0,00"} valueColor="text-red-500" loading={loadingDespResumo} />
        <KpiCard title="Lucro Líquido"       value={despesasResumo ? formatCurrency(despesasResumo.totalLucro) : "R$ 0,00"}  valueColor={despesasResumo && despesasResumo.totalLucro >= 0 ? "text-[#2ecc71]" : "text-red-500"} loading={loadingDespResumo} />
        <KpiCard title="Registros"           value={despesasResumo?.totalRegistros?.toString() || "0"}                       loading={loadingDespResumo} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Despesas por Categoria */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base">Despesas por Categoria</CardTitle>
            <CardDescription>Distribuição dos custos ({ano})</CardDescription>
          </CardHeader>
          <CardContent className="h-64 sm:h-80 p-2 sm:p-6">
            {loadingDespResumo ? <Skeleton className="w-full h-full" /> : (
              despesasResumo && despesasResumo.categorias.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={despesasResumo.categorias} layout="vertical" margin={{ top: 10, right: 8, left: 20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `R$${(val / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="categoria" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={72} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
                      formatter={(value: number) => formatCurrency(value)}
                    />
                    <Bar dataKey="valor" name="Valor" fill="#e74c3c" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Nenhuma despesa para o ano selecionado
                </div>
              )
            )}
          </CardContent>
        </Card>

        {/* Despesas Mensais */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm sm:text-base">Frete vs Custos vs Lucro</CardTitle>
            <CardDescription>Evolução mensal ({ano})</CardDescription>
          </CardHeader>
          <CardContent className="h-64 sm:h-80 p-2 sm:p-6">
            {loadingDespMensal ? <Skeleton className="w-full h-full" /> : (
              despesasMensal && despesasMensal.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={despesasMensal} margin={{ top: 10, right: 8, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={50} tickFormatter={(val) => `R$${(val / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }}
                      formatter={(value: number) => formatCurrency(value)}
                    />
                    <Legend />
                    <Bar dataKey="frete"  name="Frete"  fill="#0a192f" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="custos" name="Custos" fill="#e74c3c" radius={[4, 4, 0, 0]} />
                    <Line type="monotone" dataKey="lucro" name="Lucro" stroke="#2ecc71" strokeWidth={3} dot={{ r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Nenhuma despesa para o ano selecionado
                </div>
              )
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  loading,
  valueColor = "text-foreground",
}: {
  title: string;
  value: string;
  loading?: boolean;
  valueColor?: string;
}) {
  return (
    <Card className="border-t-4 border-t-[#0a192f]">
      <CardContent className="p-3 sm:p-5">
        <h3 className="text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider leading-tight">
          {title}
        </h3>
        {loading ? (
          <Skeleton className="h-6 sm:h-8 w-20 mt-2" />
        ) : (
          <p className={`text-base sm:text-xl font-bold mt-2 tracking-tight break-all ${valueColor}`}>
            {value}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
