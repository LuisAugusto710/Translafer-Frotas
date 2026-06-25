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
  getGetDieselByPlacaQueryKey
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

  const { data: resumo, isLoading: loadingResumo } = useGetDashboardResumo({}, {
    query: { queryKey: getGetDashboardResumoQueryKey({}) }
  });

  const { data: periodoData, isLoading: loadingPeriodo } = useGetRevenueByPeriodo(
    { period }, 
    { query: { queryKey: getGetRevenueByPeriodoQueryKey({ period }) } }
  );

  const { data: frotaData, isLoading: loadingFrota } = useGetRevenueByFrota({}, {
    query: { queryKey: getGetRevenueByFrotaQueryKey({}) }
  });

  const { data: mensalData, isLoading: loadingMensal } = useGetMensalComparativo({ ano }, {
    query: { queryKey: getGetMensalComparativoQueryKey({ ano }) }
  });

  const { data: dieselData, isLoading: loadingDiesel } = useGetDieselByPlaca({ ano }, {
    query: { queryKey: getGetDieselByPlacaQueryKey({ ano }) }
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border">
        <h2 className="text-xl font-bold text-[#0a192f]">Resumo Operacional</h2>
        <div className="flex items-center gap-4">
          <Select value={ano.toString()} onValueChange={(v) => setAno(parseInt(v))}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              {[2022, 2023, 2024, 2025].map(y => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard title="Receita Total" value={resumo ? formatCurrency(resumo.receitaTotal) : "R$ 0,00"} valueColor="text-[#2ecc71]" loading={loadingResumo} />
        <KpiCard title="Total Frete" value={resumo ? formatCurrency(resumo.totalFrete) : "R$ 0,00"} loading={loadingResumo} />
        <KpiCard title="Total Pedágio" value={resumo ? formatCurrency(resumo.totalPedagio) : "R$ 0,00"} loading={loadingResumo} />
        <KpiCard title="Total Diesel" value={resumo ? formatCurrency(resumo.totalDiesel) : "R$ 0,00"} valueColor="text-red-500" loading={loadingResumo} />
        <KpiCard title="Lucro Líquido (Aprox)" value={resumo ? formatCurrency(resumo.receitaTotal - resumo.totalDiesel) : "R$ 0,00"} valueColor="text-[#0a192f]" loading={loadingResumo} />
        
        <KpiCard title="Total Viagens" value={resumo?.totalViagens?.toString() || "0"} loading={loadingResumo} />
        <KpiCard title="Peso Total" value={resumo ? `${formatNumber(resumo.pesoTotal)} kg` : "0 kg"} loading={loadingResumo} />
        <KpiCard title="Média por Viagem" value={resumo ? formatCurrency(resumo.mediaPorViagem) : "R$ 0,00"} loading={loadingResumo} />
        <KpiCard title="Total Litros Diesel" value={resumo ? `${formatNumber(resumo.totalLitros)} L` : "0 L"} loading={loadingResumo} />
        <KpiCard title="Melhor Frota" value={resumo?.melhorFrota || "-"} valueColor="text-[#0a192f]" loading={loadingResumo} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle>Frete por Período</CardTitle>
              <CardDescription>Evolução da receita</CardDescription>
            </div>
            <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
              <SelectTrigger className="w-[120px]">
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
          <CardContent className="h-80">
            {loadingPeriodo ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={periodoData || []} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorFrete" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0a192f" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#0a192f" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorPedagio" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2ecc71" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#2ecc71" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="periodo" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `R$${(val/1000).toFixed(0)}k`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="pedagio" name="Pedágio" stroke="#2ecc71" fillOpacity={1} fill="url(#colorPedagio)" stackId="1" />
                  <Area type="monotone" dataKey="frete" name="Frete" stroke="#0a192f" fillOpacity={1} fill="url(#colorFrete)" stackId="1" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Frete por Frota</CardTitle>
            <CardDescription>Ranking de veículos por receita</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            {loadingFrota ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={frotaData?.slice(0, 10) || []} layout="vertical" margin={{ top: 10, right: 10, left: 30, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `R$${(val/1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="frota" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Legend />
                  <Bar dataKey="frete" name="Frete" stackId="a" fill="#0a192f" />
                  <Bar dataKey="pedagio" name="Pedágio" stackId="a" fill="#2ecc71" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Comparativo Mensal ({ano})</CardTitle>
            <CardDescription>Receita vs Custos de Diesel</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            {loadingMensal ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={mensalData || []} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `R$${(val/1000).toFixed(0)}k`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="freteTotal" name="Receita" fill="#0a192f" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="left" dataKey="dieselTotal" name="Diesel" fill="#e74c3c" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="left" type="monotone" dataKey="lucroLiquido" name="Lucro Líquido" stroke="#2ecc71" strokeWidth={3} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Consumo de Diesel por Placa ({ano})</CardTitle>
            <CardDescription>Litros abastecidos e valor pago</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            {loadingDiesel ? <Skeleton className="w-full h-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dieselData || []} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="placa" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}L`} />
                  <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `R$${(val/1000).toFixed(0)}k`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="totalLitros" name="Litros" fill="#f39c12" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="totalPago" name="Valor Pago (R$)" stroke="#c0392b" strokeWidth={2} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ title, value, loading, valueColor = "text-foreground" }: { title: string, value: string, loading?: boolean, valueColor?: string }) {
  return (
    <Card className="border-t-4 border-t-[#0a192f]">
      <CardContent className="p-5">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
        {loading ? (
          <Skeleton className="h-8 w-24 mt-2" />
        ) : (
          <p className={`text-xl font-bold mt-2 tracking-tight ${valueColor}`}>{value}</p>
        )}
      </CardContent>
    </Card>
  );
}
