import { useState, useMemo, useCallback } from "react";
import {
  useListEmployees,
  useGetEmployeeCalendar,
  getGetEmployeeCalendarQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft,
  ChevronRight,
  FileDown,
  Share2,
  Users,
  CalendarDays,
  Info,
} from "lucide-react";

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const DAY_NAMES = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

function fmt(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function buildPrintHtml(opts: {
  nome: string;
  tipo: string;
  mes: number;
  ano: number;
  dias: { date: string; worked: boolean; valor: number }[];
  totalGanho: number;
  diasTrabalhados: number;
  diasNaoTrabalhados: number;
  mediaPorDia: number;
}) {
  const { nome, tipo, mes, ano, dias, totalGanho, diasTrabalhados, diasNaoTrabalhados, mediaPorDia } = opts;
  const period = `${MONTH_NAMES[mes - 1]} ${ano}`;
  const now = new Date().toLocaleString("pt-BR");

  const firstDayOfWeek = new Date(ano, mes - 1, 1).getDay();
  const daysInMonth = dias.length;
  const totalCells = Math.ceil((firstDayOfWeek + daysInMonth) / 7) * 7;

  const calCells: string[] = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - firstDayOfWeek + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      calCells.push(`<div class="cell empty"></div>`);
    } else {
      const d = dias[dayNum - 1];
      const cls = d.worked ? "cell worked" : "cell not-worked";
      const label = d.worked ? "Trabalhou" : "Não trabalhou";
      const valor = d.worked ? `R$ ${d.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "";
      calCells.push(`<div class="${cls}"><span class="day-num">${dayNum}</span><span class="label">${label}</span>${valor ? `<span class="valor">${valor}</span>` : ""}</div>`);
    }
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Funcionário — ${nome} — ${period}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; padding: 24px; color: #1a1a2e; }
  h1 { font-size: 20px; font-weight: bold; margin-bottom: 4px; }
  .subtitle { font-size: 13px; color: #555; margin-bottom: 20px; }
  .meta { display: flex; gap: 32px; margin-bottom: 24px; background: #f8f9fa; padding: 12px 16px; border-radius: 8px; }
  .meta-item label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: .5px; display: block; margin-bottom: 2px; }
  .meta-item span { font-size: 14px; font-weight: 600; }
  .calendar { display: grid; grid-template-columns: repeat(7,1fr); gap: 4px; margin-bottom: 24px; }
  .day-header { text-align: center; font-size: 11px; font-weight: 700; color: #666; padding: 8px 0; }
  .cell { border-radius: 6px; padding: 8px 4px; min-height: 72px; display: flex; flex-direction: column; align-items: center; font-size: 11px; }
  .cell.empty { background: transparent; }
  .cell.worked { background: #d1fae5; border: 1px solid #6ee7b7; }
  .cell.not-worked { background: #fee2e2; border: 1px solid #fca5a5; }
  .day-num { font-weight: 700; font-size: 13px; margin-bottom: 4px; }
  .cell.worked .day-num { color: #065f46; }
  .cell.not-worked .day-num { color: #991b1b; }
  .label { font-size: 10px; font-weight: 600; }
  .cell.worked .label { color: #047857; }
  .cell.not-worked .label { color: #dc2626; }
  .valor { font-size: 9px; color: #374151; margin-top: 2px; }
  .legend { display: flex; gap: 16px; margin-bottom: 24px; font-size: 12px; }
  .legend-item { display: flex; align-items: center; gap: 6px; }
  .legend-dot { width: 12px; height: 12px; border-radius: 3px; }
  .summary { background: #f8f9fa; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
  .summary h2 { font-size: 14px; font-weight: 700; margin-bottom: 12px; }
  .summary-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
  .summary-row:last-child { border-bottom: none; }
  .summary-row .val { font-weight: 700; }
  .summary-row.total .val { color: #047857; font-size: 16px; }
  .footer { font-size: 10px; color: #999; margin-top: 16px; text-align: right; }
  @media print { body { padding: 12px; } }
</style>
</head>
<body>
<h1>Calendário de Trabalho</h1>
<p class="subtitle">Visualize os dias trabalhados e o valor a ser pago no período selecionado.</p>
<div class="meta">
  <div class="meta-item"><label>Funcionário</label><span>${nome}</span></div>
  <div class="meta-item"><label>Função</label><span>${tipo}</span></div>
  <div class="meta-item"><label>Período</label><span>${period}</span></div>
</div>
<div class="calendar">
  ${DAY_NAMES.map(d => `<div class="day-header">${d}</div>`).join("")}
  ${calCells.join("")}
</div>
<div class="legend">
  <div class="legend-item"><div class="legend-dot" style="background:#6ee7b7"></div>Trabalhou</div>
  <div class="legend-item"><div class="legend-dot" style="background:#fca5a5"></div>Não trabalhou</div>
</div>
<div class="summary">
  <h2>Resumo do Período</h2>
  <div class="summary-row"><span>Dias trabalhados</span><span class="val" style="color:#047857">${diasTrabalhados}</span></div>
  <div class="summary-row"><span>Dias não trabalhados</span><span class="val" style="color:#dc2626">${diasNaoTrabalhados}</span></div>
  <div class="summary-row"><span>Valor por dia trabalhado</span><span class="val">R$ ${mediaPorDia.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
  <div class="summary-row"><span>Bônus / Extras</span><span class="val">R$ 0,00</span></div>
  <div class="summary-row total"><span style="font-weight:700">Total a receber</span><span class="val">R$ ${totalGanho.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
</div>
<p class="footer">Gerado em ${now} — LAFER Transportes</p>
</body>
</html>`;
}

interface SelectedEmployee {
  nome: string;
  tipo: string;
}

export function Funcionarios() {
  const today = new Date();
  const [selectedEmployee, setSelectedEmployee] = useState<SelectedEmployee | null>(null);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const queryClient = useQueryClient();

  const { data: employees, isLoading: employeesLoading } = useListEmployees();

  const calendarEnabled = !!selectedEmployee;
  const calendarParams = selectedEmployee
    ? { nome: selectedEmployee.nome, tipo: selectedEmployee.tipo, ano: year, mes: month }
    : { nome: "", tipo: "", ano: year, mes: month };

  const { data: calendarData, isLoading: calendarLoading } = useGetEmployeeCalendar(
    calendarParams,
    {
      query: {
        enabled: calendarEnabled,
        queryKey: getGetEmployeeCalendarQueryKey(calendarParams),
      },
    },
  );

  const firstDayOfWeek = useMemo(() => new Date(year, month - 1, 1).getDay(), [year, month]);
  const daysInMonth = useMemo(() => (calendarData?.dias.length ?? new Date(year, month, 0).getDate()), [calendarData, year, month]);

  const totalCells = Math.ceil((firstDayOfWeek + daysInMonth) / 7) * 7;

  const cells = useMemo(() => {
    const arr: Array<{ dayNum: number | null; worked: boolean; valor: number }> = [];
    for (let i = 0; i < totalCells; i++) {
      const dayNum = i - firstDayOfWeek + 1;
      if (dayNum < 1 || dayNum > daysInMonth) {
        arr.push({ dayNum: null, worked: false, valor: 0 });
      } else {
        const dayStr = `${year}-${String(month).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
        const dayData = calendarData?.dias.find(d => d.date === dayStr);
        arr.push({ dayNum, worked: dayData?.worked ?? false, valor: dayData?.valor ?? 0 });
      }
    }
    return arr;
  }, [totalCells, firstDayOfWeek, daysInMonth, year, month, calendarData]);

  const prevMonth = useCallback(() => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }, [month]);

  const nextMonth = useCallback(() => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }, [month]);

  const handleEmployeeSelect = useCallback((value: string) => {
    const [nome, tipo] = value.split("||");
    setSelectedEmployee({ nome, tipo });
    queryClient.invalidateQueries({ queryKey: getGetEmployeeCalendarQueryKey({ nome, tipo, ano: year, mes: month }) });
  }, [queryClient, year, month]);

  const handleSavePdf = useCallback(() => {
    if (!selectedEmployee || !calendarData) return;
    const html = buildPrintHtml({
      nome: selectedEmployee.nome,
      tipo: selectedEmployee.tipo,
      mes: month,
      ano: year,
      dias: calendarData.dias,
      totalGanho: calendarData.totalGanho,
      diasTrabalhados: calendarData.diasTrabalhados,
      diasNaoTrabalhados: calendarData.diasNaoTrabalhados,
      mediaPorDia: calendarData.mediaPorDia,
    });
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  }, [selectedEmployee, calendarData, month, year]);

  const handleShare = useCallback(async () => {
    if (!selectedEmployee || !calendarData) return;
    const period = `${MONTH_NAMES[month - 1]} ${year}`;
    const text = [
      `Funcionário: ${selectedEmployee.nome} (${selectedEmployee.tipo})`,
      `Período: ${period}`,
      `Dias trabalhados: ${calendarData.diasTrabalhados}`,
      `Total a receber: ${fmt(calendarData.totalGanho)}`,
    ].join("\n");

    if (navigator.share) {
      try {
        await navigator.share({ title: `Calendário — ${selectedEmployee.nome}`, text });
      } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(text);
      alert("Resumo copiado para a área de transferência.");
    }
  }, [selectedEmployee, calendarData, month, year]);

  const isLoading = employeesLoading;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div>
        <h2 className="text-xl font-bold text-foreground">Calendário de Trabalho</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Visualize os dias trabalhados e o valor a ser pago no período selecionado.
        </p>
      </div>

      {/* Selector row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Employee selector */}
        <Card className="shadow-none border">
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground mb-1.5 font-medium uppercase tracking-wide">Funcionário</p>
            {isLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-[#0a192f] flex items-center justify-center shrink-0">
                  <Users className="h-4 w-4 text-white" />
                </div>
                <Select
                  value={selectedEmployee ? `${selectedEmployee.nome}||${selectedEmployee.tipo}` : ""}
                  onValueChange={handleEmployeeSelect}
                >
                  <SelectTrigger className="border-0 shadow-none p-0 h-auto text-sm font-semibold focus:ring-0 flex-1">
                    <SelectValue placeholder="Selecione um funcionário…" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees?.map(e => (
                      <SelectItem key={`${e.nome}||${e.tipo}`} value={`${e.nome}||${e.tipo}`}>
                        <div>
                          <span className="font-medium">{e.nome}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{e.tipo}</span>
                        </div>
                      </SelectItem>
                    ))}
                    {!employees?.length && (
                      <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                        Nenhum funcionário encontrado.<br />
                        <span className="text-xs">Cadastre despesas com nome de motorista ou ajudante.</span>
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
            {selectedEmployee && (
              <p className="text-xs text-muted-foreground mt-1">{selectedEmployee.tipo}</p>
            )}
          </CardContent>
        </Card>

        {/* Period selector */}
        <Card className="shadow-none border">
          <CardContent className="py-3 px-4">
            <p className="text-xs text-muted-foreground mb-1.5 font-medium uppercase tracking-wide">Período</p>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex items-center gap-1 flex-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-semibold flex-1 text-center">
                  {MONTH_NAMES[month - 1]} {year}
                </span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Calendar */}
        <div className="lg:col-span-2">
          <Card className="shadow-none border">
            <CardContent className="p-4">
              {/* Day headers */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {DAY_NAMES.map(d => (
                  <div key={d} className="text-center text-xs font-bold text-muted-foreground py-2">
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              {!selectedEmployee ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                  <Users className="h-10 w-10 opacity-30" />
                  <p className="text-sm">Selecione um funcionário para ver o calendário</p>
                </div>
              ) : calendarLoading ? (
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: 35 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 rounded-lg" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-7 gap-1">
                  {cells.map((cell, i) => {
                    if (cell.dayNum === null) {
                      return <div key={i} className="h-16 rounded-lg" />;
                    }
                    return (
                      <div
                        key={i}
                        className={`h-16 rounded-lg border flex flex-col items-center justify-center gap-0.5 ${
                          cell.worked
                            ? "bg-green-50 border-green-200 dark:bg-green-950/40 dark:border-green-900"
                            : "bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-900"
                        }`}
                      >
                        <span className={`text-sm font-bold leading-none ${cell.worked ? "text-green-800 dark:text-green-300" : "text-red-700 dark:text-red-400"}`}>
                          {cell.dayNum}
                        </span>
                        <span className={`text-[10px] font-semibold leading-none ${cell.worked ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-500"}`}>
                          {cell.worked ? "Trabalhou" : "Não trab."}
                        </span>
                        {cell.worked && cell.valor > 0 && (
                          <span className="text-[9px] text-green-600 dark:text-green-500 leading-none">
                            {fmt(cell.valor)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Legend */}
              {selectedEmployee && !calendarLoading && (
                <div className="flex gap-4 mt-3 pt-3 border-t">
                  <div className="flex items-center gap-1.5">
                    <div className="h-3 w-3 rounded bg-green-400" />
                    <span className="text-xs text-muted-foreground">Trabalhou</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-3 w-3 rounded bg-red-400" />
                    <span className="text-xs text-muted-foreground">Não trabalhou</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Summary panel */}
        <div className="space-y-3">
          {/* Total highlight */}
          <Card className="shadow-none border bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/30 dark:to-card">
            <CardContent className="py-4 px-4">
              <p className="text-xs text-muted-foreground mb-1">Valor a receber no período</p>
              {calendarLoading && selectedEmployee ? (
                <Skeleton className="h-7 w-36" />
              ) : (
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                  {selectedEmployee ? fmt(calendarData?.totalGanho ?? 0) : "—"}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Period Summary */}
          <Card className="shadow-none border">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold">Resumo do Período</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {[
                {
                  label: "Dias trabalhados",
                  value: selectedEmployee ? (calendarData?.diasTrabalhados ?? 0).toString() : "—",
                  color: "text-emerald-600 dark:text-emerald-400",
                },
                {
                  label: "Dias não trabalhados",
                  value: selectedEmployee ? (calendarData?.diasNaoTrabalhados ?? 0).toString() : "—",
                  color: "text-red-600 dark:text-red-400",
                },
                {
                  label: "Valor por dia trabalhado",
                  value: selectedEmployee ? fmt(calendarData?.mediaPorDia ?? 0) : "—",
                  color: "",
                },
                {
                  label: "Bônus / Extras",
                  value: "R$ 0,00",
                  color: "",
                },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between py-1 border-b border-dashed last:border-0">
                  <span className="text-xs text-muted-foreground">{row.label}</span>
                  {calendarLoading && selectedEmployee ? (
                    <Skeleton className="h-4 w-16" />
                  ) : (
                    <span className={`text-xs font-semibold ${row.color}`}>{row.value}</span>
                  )}
                </div>
              ))}

              {/* Total */}
              <div className="pt-1 border-t flex items-center justify-between">
                <span className="text-xs font-bold">Total a receber</span>
                {calendarLoading && selectedEmployee ? (
                  <Skeleton className="h-5 w-24" />
                ) : (
                  <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                    {selectedEmployee ? fmt(calendarData?.totalGanho ?? 0) : "—"}
                  </span>
                )}
              </div>

              {/* Info note */}
              {selectedEmployee && !calendarLoading && (
                <div className="mt-2 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 p-2 flex gap-2">
                  <Info className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-blue-700 dark:text-blue-400 leading-snug">
                    O valor por dia é calculado com base no total do período dividido pelo número de dias trabalhados.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <Card className="shadow-none border">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold">Ações</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded bg-muted p-1.5 shrink-0">
                  <FileDown className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold">Salvar PDF</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Gera um PDF com os dias trabalhados no período selecionado.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="default"
                  disabled={!selectedEmployee || !calendarData}
                  onClick={handleSavePdf}
                  className="shrink-0 bg-[#0a192f] hover:bg-[#0a192f]/90 text-white text-xs h-8"
                >
                  Salvar PDF
                </Button>
              </div>

              <div className="border-t pt-2 flex items-start gap-3">
                <div className="mt-0.5 rounded bg-muted p-1.5 shrink-0">
                  <Share2 className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold">Compartilhar PDF</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Compartilhe o PDF gerado com o funcionário ou por outros canais.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!selectedEmployee || !calendarData}
                  onClick={handleShare}
                  className="shrink-0 text-xs h-8"
                >
                  Compartilhar
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
