import { useState, useMemo, useCallback } from "react";
import {
  useListEmployees,
  useGetEmployeeCalendar,
  getGetEmployeeCalendarQueryKey,
  useListEmployeeAdvances,
  useCreateEmployeeAdvance,
  useUpdateEmployeeAdvance,
  useDeleteEmployeeAdvance,
  getListEmployeeAdvancesQueryKey,
  type EmployeeAdvance,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FileDown,
  Share2,
  Users,
  Info,
  MessageCircle,
  Clipboard,
  Plus,
  Trash2,
  Pencil,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { PeriodFilter, defaultPeriod, type PeriodValue } from "@/components/period-filter";

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const DAY_NAMES = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

const ADJUSTMENT_TYPES = [
  "Adiantamento Salarial",
  "Adiantamento em Dinheiro",
  "Adiantamento Combustível",
  "Bônus",
  "Desconto",
  "Outro",
] as const;

// Types that add to the final payment. Everything else (including legacy
// "Adiantamento" records) is treated as a deduction.
const ADD_TYPES = new Set<string>(["Bônus"]);
function isAddType(tipo: string): boolean {
  return ADD_TYPES.has(tipo);
}

function fmt(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDatePt(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function periodLabel(period: PeriodValue): string {
  if (!period.dateFrom || !period.dateTo) return "Período não definido";
  if (period.dateFrom === period.dateTo) return formatDatePt(period.dateFrom);
  return `${formatDatePt(period.dateFrom)} – ${formatDatePt(period.dateTo)}`;
}

function monthsBetween(dateFrom: string, dateTo: string): { year: number; month: number }[] {
  const [fy, fm] = dateFrom.split("-").map(Number);
  const [ty, tm] = dateTo.split("-").map(Number);
  const out: { year: number; month: number }[] = [];
  let y = fy, m = fm;
  let guard = 0;
  while ((y < ty || (y === ty && m <= tm)) && guard < 60) {
    out.push({ year: y, month: m });
    m++;
    if (m > 12) { m = 1; y++; }
    guard++;
  }
  return out;
}

interface DiaInfo { worked: boolean; valor: number }
type MonthCell = { dayNum: number | null; state: "empty" | "out" | "worked" | "not-worked"; valor: number };

function buildMonthCells(year: number, month: number, dateFrom: string, dateTo: string, diasMap: Map<string, DiaInfo>): MonthCell[] {
  const firstDow = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: MonthCell[] = [];
  for (let i = 0; i < firstDow; i++) cells.push({ dayNum: null, state: "empty", valor: 0 });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (dateStr < dateFrom || dateStr > dateTo) {
      cells.push({ dayNum: d, state: "out", valor: 0 });
    } else {
      const info = diasMap.get(dateStr);
      cells.push({ dayNum: d, state: info?.worked ? "worked" : "not-worked", valor: info?.valor ?? 0 });
    }
  }
  while (cells.length % 7 !== 0) cells.push({ dayNum: null, state: "empty", valor: 0 });
  return cells;
}

function buildCalendarHtml(dateFrom: string, dateTo: string, diasMap: Map<string, DiaInfo>): string {
  const months = monthsBetween(dateFrom, dateTo);
  return months.map(({ year, month }) => {
    const cells = buildMonthCells(year, month, dateFrom, dateTo, diasMap);
    const cellsHtml = cells.map(c => {
      if (c.dayNum === null) return `<div class="cell empty"></div>`;
      if (c.state === "out") return `<div class="cell out"><span class="day-num">${c.dayNum}</span></div>`;
      const cls = c.state === "worked" ? "cell worked" : "cell not-worked";
      const label = c.state === "worked" ? "Trabalhou" : "Não trabalhou";
      const valor = c.state === "worked" && c.valor > 0 ? `<span class="valor">R$ ${c.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>` : "";
      return `<div class="${cls}"><span class="day-num">${c.dayNum}</span><span class="label">${label}</span>${valor}</div>`;
    }).join("");
    return `
      <div class="month-block">
        <h3 class="month-title">${MONTH_NAMES[month - 1]} ${year}</h3>
        <div class="calendar">
          ${DAY_NAMES.map(d => `<div class="day-header">${d}</div>`).join("")}
          ${cellsHtml}
        </div>
      </div>`;
  }).join("");
}

function buildPrintHtml(opts: {
  nome: string;
  tipo: string;
  periodo: string;
  dateFrom: string;
  dateTo: string;
  diasMap: Map<string, DiaInfo>;
  totalGanho: number;
  diasTrabalhados: number;
  diasNaoTrabalhados: number;
  mediaPorDia: number;
  bonusTotal: number;
  deductionTotal: number;
  finalAmount: number;
}) {
  const { nome, tipo, periodo, dateFrom, dateTo, diasMap, totalGanho, diasTrabalhados, diasNaoTrabalhados, mediaPorDia, bonusTotal, deductionTotal, finalAmount } = opts;
  const now = new Date().toLocaleString("pt-BR");
  const calendarHtml = buildCalendarHtml(dateFrom, dateTo, diasMap);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Funcionário — ${nome} — ${periodo}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; padding: 24px; color: #1a1a2e; }
  h1 { font-size: 20px; font-weight: bold; margin-bottom: 4px; }
  .subtitle { font-size: 13px; color: #555; margin-bottom: 20px; }
  .meta { display: flex; gap: 32px; margin-bottom: 24px; background: #f8f9fa; padding: 12px 16px; border-radius: 8px; }
  .meta-item label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: .5px; display: block; margin-bottom: 2px; }
  .meta-item span { font-size: 14px; font-weight: 600; }
  .month-block { margin-bottom: 20px; }
  .month-title { font-size: 13px; font-weight: 700; margin-bottom: 8px; }
  .calendar { display: grid; grid-template-columns: repeat(7,1fr); gap: 4px; margin-bottom: 8px; }
  .day-header { text-align: center; font-size: 11px; font-weight: 700; color: #666; padding: 8px 0; }
  .cell { border-radius: 6px; padding: 8px 4px; min-height: 60px; display: flex; flex-direction: column; align-items: center; font-size: 11px; }
  .cell.empty { background: transparent; }
  .cell.out { background: #f3f4f6; color: #9ca3af; }
  .cell.worked { background: #d1fae5; border: 1px solid #6ee7b7; }
  .cell.not-worked { background: #fee2e2; border: 1px solid #fca5a5; }
  .day-num { font-weight: 700; font-size: 13px; margin-bottom: 4px; }
  .cell.worked .day-num { color: #065f46; }
  .cell.not-worked .day-num { color: #991b1b; }
  .cell.out .day-num { color: #9ca3af; font-weight: 600; }
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
  .summary-row.total .val { color: #047857; font-size: 18px; }
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
  <div class="meta-item"><label>Período</label><span>${periodo}</span></div>
</div>
${calendarHtml}
<div class="legend">
  <div class="legend-item"><div class="legend-dot" style="background:#6ee7b7"></div>Trabalhou</div>
  <div class="legend-item"><div class="legend-dot" style="background:#fca5a5"></div>Não trabalhou</div>
  <div class="legend-item"><div class="legend-dot" style="background:#f3f4f6"></div>Fora do período</div>
</div>
<div class="summary">
  <h2>Resumo do Período</h2>
  <div class="summary-row"><span>Dias trabalhados</span><span class="val" style="color:#047857">${diasTrabalhados}</span></div>
  <div class="summary-row"><span>Dias não trabalhados</span><span class="val" style="color:#dc2626">${diasNaoTrabalhados}</span></div>
  <div class="summary-row"><span>Valor por dia trabalhado</span><span class="val">R$ ${mediaPorDia.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
  <div class="summary-row"><span>Total ganho (dias trabalhados)</span><span class="val">R$ ${totalGanho.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
  <div class="summary-row"><span>Bônus</span><span class="val" style="color:#047857">+ R$ ${bonusTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
  <div class="summary-row"><span>Adiantamentos / Descontos</span><span class="val" style="color:#dc2626">− R$ ${deductionTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
  <div class="summary-row total"><span style="font-weight:700">Valor Final a Receber</span><span class="val">R$ ${finalAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
</div>
<p class="footer">Gerado em ${now}</p>
</body>
</html>`;
}

interface SelectedEmployee {
  nome: string;
  tipo: string;
}

export function Funcionarios() {
  const [selectedEmployee, setSelectedEmployee] = useState<SelectedEmployee | null>(null);
  const [period, setPeriod] = useState<PeriodValue>(() => defaultPeriod());

  const queryClient = useQueryClient();

  const { data: employees, isLoading: employeesLoading } = useListEmployees();

  const periodValid = !!period.dateFrom && !!period.dateTo && period.dateFrom <= period.dateTo;

  const calendarEnabled = !!selectedEmployee && periodValid;
  const calendarParams = selectedEmployee
    ? { nome: selectedEmployee.nome, tipo: selectedEmployee.tipo, dateFrom: period.dateFrom, dateTo: period.dateTo }
    : { nome: "", tipo: "", dateFrom: period.dateFrom, dateTo: period.dateTo };

  const { data: calendarData, isLoading: calendarLoading } = useGetEmployeeCalendar(
    calendarParams,
    {
      query: {
        enabled: calendarEnabled,
        queryKey: getGetEmployeeCalendarQueryKey(calendarParams),
      },
    },
  );

  const diasMap = useMemo(() => {
    const m = new Map<string, DiaInfo>();
    (calendarData?.dias ?? []).forEach(d => m.set(d.date, { worked: d.worked, valor: d.valor }));
    return m;
  }, [calendarData]);

  const monthsInRange = useMemo(
    () => periodValid ? monthsBetween(period.dateFrom, period.dateTo) : [],
    [period.dateFrom, period.dateTo, periodValid],
  );

  const monthGrids = useMemo(
    () => monthsInRange.map(({ year, month }) => ({
      year,
      month,
      cells: buildMonthCells(year, month, period.dateFrom, period.dateTo, diasMap),
    })),
    [monthsInRange, period.dateFrom, period.dateTo, diasMap],
  );

  const handleEmployeeSelect = useCallback((value: string) => {
    const [nome, tipo] = value.split("||");
    setSelectedEmployee({ nome, tipo });
    queryClient.invalidateQueries({ queryKey: getGetEmployeeCalendarQueryKey({ nome, tipo, dateFrom: period.dateFrom, dateTo: period.dateTo }) });
  }, [queryClient, period.dateFrom, period.dateTo]);

  const { toast } = useToast();

  const [showAdvanceForm, setShowAdvanceForm] = useState(false);
  const [editingAdvance, setEditingAdvance] = useState<EmployeeAdvance | null>(null);
  const [advanceForm, setAdvanceForm] = useState({
    data: new Date().toISOString().split("T")[0],
    descricao: "",
    valor: "",
    tipo: "Adiantamento em Dinheiro" as string,
  });

  const advancesParams = selectedEmployee
    ? { nome: selectedEmployee.nome, tipoFuncionario: selectedEmployee.tipo, dateFrom: period.dateFrom, dateTo: period.dateTo }
    : { nome: "", tipoFuncionario: "", dateFrom: period.dateFrom, dateTo: period.dateTo };

  const { data: advances, isLoading: advancesLoading } = useListEmployeeAdvances(
    advancesParams,
    { query: { enabled: !!selectedEmployee && periodValid, queryKey: getListEmployeeAdvancesQueryKey(advancesParams) } },
  );

  const createAdvanceMutation = useCreateEmployeeAdvance();
  const updateAdvanceMutation = useUpdateEmployeeAdvance();
  const deleteAdvanceMutation = useDeleteEmployeeAdvance();

  const advancesQueryKey = getListEmployeeAdvancesQueryKey(advancesParams);

  const handleOpenAdvanceForm = useCallback((advance?: EmployeeAdvance) => {
    if (advance) {
      setEditingAdvance(advance);
      setAdvanceForm({ data: advance.data, descricao: advance.descricao, valor: String(advance.valor), tipo: advance.tipo });
    } else {
      setEditingAdvance(null);
      setAdvanceForm({ data: new Date().toISOString().split("T")[0], descricao: "", valor: "", tipo: "Adiantamento em Dinheiro" });
    }
    setShowAdvanceForm(true);
  }, []);

  const handleSaveAdvance = useCallback(() => {
    if (!selectedEmployee || !advanceForm.data || !advanceForm.valor || !advanceForm.tipo) return;
    const payload = {
      nome: selectedEmployee.nome,
      tipoFuncionario: selectedEmployee.tipo,
      data: advanceForm.data,
      descricao: advanceForm.descricao,
      valor: parseFloat(advanceForm.valor.replace(",", ".")),
      tipo: advanceForm.tipo,
    };
    const onSuccess = () => {
      setShowAdvanceForm(false);
      setEditingAdvance(null);
      queryClient.invalidateQueries({ queryKey: advancesQueryKey });
    };
    if (editingAdvance) {
      updateAdvanceMutation.mutate({ id: editingAdvance.id, data: payload }, { onSuccess });
    } else {
      createAdvanceMutation.mutate({ data: payload }, { onSuccess });
    }
  }, [selectedEmployee, advanceForm, editingAdvance, updateAdvanceMutation, createAdvanceMutation, queryClient, advancesQueryKey]);

  const handleDeleteAdvance = useCallback((id: number) => {
    deleteAdvanceMutation.mutate({ id }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: advancesQueryKey }),
    });
  }, [deleteAdvanceMutation, queryClient, advancesQueryKey]);

  const bonusTotal = useMemo(() =>
    (advances ?? []).filter(a => isAddType(a.tipo)).reduce((s, a) => s + Number(a.valor), 0),
    [advances]);

  const deductionTotal = useMemo(() =>
    (advances ?? []).filter(a => !isAddType(a.tipo)).reduce((s, a) => s + Number(a.valor), 0),
    [advances]);

  const finalAmount = (calendarData?.totalGanho ?? 0) + bonusTotal - deductionTotal;

  const buildShareText = useCallback(() => {
    if (!selectedEmployee || !calendarData) return "";
    const label = periodLabel(period);
    return [
      `Olá,`,
      ``,
      `Segue abaixo o relatório de trabalho referente ao período de *${label}*:`,
      ``,
      `👤 *Funcionário:* ${selectedEmployee.nome}`,
      `🏷️ *Função:* ${selectedEmployee.tipo}`,
      `📅 *Período:* ${label}`,
      `✅ *Dias trabalhados:* ${calendarData.diasTrabalhados}`,
      `❌ *Dias não trabalhados:* ${calendarData.diasNaoTrabalhados}`,
      `💰 *Valor por dia:* ${fmt(calendarData.mediaPorDia)}`,
      `💵 *Total ganho:* ${fmt(calendarData.totalGanho)}`,
      `➕ *Bônus:* ${fmt(bonusTotal)}`,
      `➖ *Adiantamentos/Descontos:* ${fmt(deductionTotal)}`,
      `🏁 *Valor Final a Receber:* ${fmt(finalAmount)}`,
      ``,
      `Atenciosamente,`,
      `LAFER Transportes`,
    ].join("\n");
  }, [selectedEmployee, calendarData, period, bonusTotal, deductionTotal, finalAmount]);

  const handleShareWhatsApp = useCallback(() => {
    const text = buildShareText();
    if (!text) return;
    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, "_blank", "noopener,noreferrer");
  }, [buildShareText]);

  const handleShareNative = useCallback(async () => {
    const text = buildShareText();
    if (!text || !selectedEmployee) return;
    const label = periodLabel(period);
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Relatório — ${selectedEmployee.nome} — ${label}`,
          text,
        });
      } else {
        await navigator.clipboard.writeText(text);
        toast({ title: "Resumo copiado!", description: "Texto copiado para a área de transferência." });
      }
    } catch { /* user cancelled */ }
  }, [buildShareText, selectedEmployee, period, toast]);

  const handleCopyClipboard = useCallback(async () => {
    const text = buildShareText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copiado!", description: "Resumo copiado para a área de transferência." });
    } catch {
      toast({ title: "Erro", description: "Não foi possível copiar.", variant: "destructive" });
    }
  }, [buildShareText, toast]);

  const generatePrintHtml = useCallback(() => {
    if (!selectedEmployee || !calendarData) return null;
    return buildPrintHtml({
      nome: selectedEmployee.nome,
      tipo: selectedEmployee.tipo,
      periodo: periodLabel(period),
      dateFrom: period.dateFrom,
      dateTo: period.dateTo,
      diasMap,
      totalGanho: calendarData.totalGanho,
      diasTrabalhados: calendarData.diasTrabalhados,
      diasNaoTrabalhados: calendarData.diasNaoTrabalhados,
      mediaPorDia: calendarData.mediaPorDia,
      bonusTotal,
      deductionTotal,
      finalAmount,
    });
  }, [selectedEmployee, calendarData, period, diasMap, bonusTotal, deductionTotal, finalAmount]);

  const handleSavePdf = useCallback(() => {
    const html = generatePrintHtml();
    if (!html) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  }, [generatePrintHtml]);

  const handleSharePdf = useCallback(async () => {
    const html = generatePrintHtml();
    if (!html || !selectedEmployee) return;

    const parser = new DOMParser();
    const parsed = parser.parseFromString(html, "text/html");
    const styleEl = parsed.querySelector("style");

    const container = document.createElement("div");
    container.style.cssText =
      "position:fixed;top:-9999px;left:-9999px;width:794px;background:#fff;";

    if (styleEl) {
      const s = document.createElement("style");
      s.textContent = styleEl.textContent ?? "";
      container.appendChild(s);
    }
    const content = document.createElement("div");
    content.innerHTML = parsed.body?.innerHTML ?? "";
    container.appendChild(content);
    document.body.appendChild(container);

    try {
      toast({ title: "Gerando PDF…", description: "Por favor aguarde." });

      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = (canvas.height * pdfW) / canvas.width;
      const pageH = pdf.internal.pageSize.getHeight();

      let yPos = 0;
      while (yPos < pdfH) {
        if (yPos > 0) pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, -yPos, pdfW, pdfH);
        yPos += pageH;
      }

      const blob = pdf.output("blob");
      const label = periodLabel(period).replace(/[\s/]+/g, "-");
      const filename = `relatorio-${selectedEmployee.nome.replace(/\s+/g, "-")}-${label}.pdf`;
      const pdfFile = new File([blob], filename, { type: "application/pdf" });

      if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        await navigator.share({
          title: `Relatório — ${selectedEmployee.nome} — ${periodLabel(period)}`,
          files: [pdfFile],
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast({ title: "PDF baixado!", description: "O arquivo foi salvo no seu dispositivo." });
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        toast({ title: "Erro", description: "Não foi possível gerar o PDF.", variant: "destructive" });
      }
    } finally {
      document.body.removeChild(container);
    }
  }, [generatePrintHtml, selectedEmployee, period, toast]);

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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
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
            <PeriodFilter value={period} onChange={setPeriod} />
          </CardContent>
        </Card>
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Calendar */}
        <div className="lg:col-span-2">
          <Card className="shadow-none border">
            <CardContent className="p-4 space-y-4">
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
                monthGrids.map(({ year, month, cells }) => (
                  <div key={`${year}-${month}`}>
                    {monthGrids.length > 1 && (
                      <p className="text-sm font-semibold mb-2">{MONTH_NAMES[month - 1]} {year}</p>
                    )}
                    <div className="grid grid-cols-7 gap-1 mb-1">
                      {DAY_NAMES.map(d => (
                        <div key={d} className="text-center text-xs font-bold text-muted-foreground py-2">
                          {d}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {cells.map((cell, i) => {
                        if (cell.dayNum === null) {
                          return <div key={i} className="h-11 sm:h-16 rounded-lg" />;
                        }
                        if (cell.state === "out") {
                          return (
                            <div key={i} className="h-11 sm:h-16 rounded-lg border border-dashed bg-muted/40 flex items-center justify-center">
                              <span className="text-xs sm:text-sm font-medium text-muted-foreground/60">{cell.dayNum}</span>
                            </div>
                          );
                        }
                        const worked = cell.state === "worked";
                        return (
                          <div
                            key={i}
                            className={`h-11 sm:h-16 rounded-lg border flex flex-col items-center justify-center gap-0 sm:gap-0.5 ${
                              worked
                                ? "bg-green-50 border-green-200 dark:bg-green-950/40 dark:border-green-900"
                                : "bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-900"
                            }`}
                          >
                            <span className={`text-xs sm:text-sm font-bold leading-none ${worked ? "text-green-800 dark:text-green-300" : "text-red-700 dark:text-red-400"}`}>
                              {cell.dayNum}
                            </span>
                            <span className={`text-[8px] sm:text-[10px] font-semibold leading-tight ${worked ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-500"}`}>
                              {worked ? "Trab." : "Não"}
                            </span>
                            {worked && cell.valor > 0 && (
                              <span className="hidden sm:block text-[9px] text-green-600 dark:text-green-500 leading-none">
                                {fmt(cell.valor)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}

              {/* Legend */}
              {selectedEmployee && !calendarLoading && (
                <div className="flex gap-4 pt-3 border-t flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <div className="h-3 w-3 rounded bg-green-400" />
                    <span className="text-xs text-muted-foreground">Trabalhou</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-3 w-3 rounded bg-red-400" />
                    <span className="text-xs text-muted-foreground">Não trabalhou</span>
                  </div>
                  {monthsInRange.length > 1 && (
                    <div className="flex items-center gap-1.5">
                      <div className="h-3 w-3 rounded border border-dashed bg-muted/40" />
                      <span className="text-xs text-muted-foreground">Fora do período</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Summary panel */}
        <div className="space-y-3">
          {/* Final amount highlight */}
          <Card className="shadow-none border-2 border-blue-300 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/40 dark:to-card">
            <CardContent className="py-4 px-4">
              <p className="text-xs text-blue-700/80 dark:text-blue-400/80 mb-1 font-semibold uppercase tracking-wide">Valor Final a Receber</p>
              {calendarLoading && selectedEmployee ? (
                <Skeleton className="h-9 w-40" />
              ) : (
                <p className="text-3xl font-extrabold text-blue-700 dark:text-blue-400">
                  {selectedEmployee ? fmt(finalAmount) : "—"}
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
                  label: "Total ganho",
                  value: selectedEmployee ? fmt(calendarData?.totalGanho ?? 0) : "—",
                  color: "",
                },
                {
                  label: "Bônus",
                  value: selectedEmployee ? `+ ${fmt(bonusTotal)}` : "—",
                  color: "text-emerald-600 dark:text-emerald-400",
                },
                {
                  label: "Adiantamentos / Descontos",
                  value: selectedEmployee ? `− ${fmt(deductionTotal)}` : "—",
                  color: "text-red-600 dark:text-red-400",
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
                <span className="text-xs font-bold">Valor Final a Receber</span>
                {calendarLoading && selectedEmployee ? (
                  <Skeleton className="h-5 w-24" />
                ) : (
                  <span className="text-sm font-bold text-blue-700 dark:text-blue-400">
                    {selectedEmployee ? fmt(finalAmount) : "—"}
                  </span>
                )}
              </div>

              {/* Info note */}
              {selectedEmployee && !calendarLoading && (
                <div className="mt-2 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 p-2 flex gap-2">
                  <Info className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-blue-700 dark:text-blue-400 leading-snug">
                    Valor Final = Total ganho + Bônus − Adiantamentos/Descontos, recalculado automaticamente conforme os ajustes de pagamento.
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
                    Compartilhe o resumo com o funcionário via WhatsApp ou outros canais.
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!selectedEmployee || !calendarData}
                      className="shrink-0 text-xs h-8 gap-1.5"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      Compartilhar
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem
                      onClick={handleShareWhatsApp}
                      className="gap-2 cursor-pointer"
                    >
                      <MessageCircle className="h-4 w-4 text-green-500" />
                      <div>
                        <p className="text-xs font-semibold">WhatsApp (texto)</p>
                        <p className="text-[10px] text-muted-foreground leading-tight">
                          Envia o resumo como mensagem de texto
                        </p>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleShareNative}
                      className="gap-2 cursor-pointer"
                    >
                      <Share2 className="h-4 w-4 text-blue-500" />
                      <div>
                        <p className="text-xs font-semibold">Compartilhar…</p>
                        <p className="text-[10px] text-muted-foreground leading-tight">
                          WhatsApp, Email, Teams, Telegram…
                        </p>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleCopyClipboard}
                      className="gap-2 cursor-pointer"
                    >
                      <Clipboard className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs font-semibold">Copiar resumo</p>
                        <p className="text-[10px] text-muted-foreground leading-tight">
                          Copia texto para área de transferência
                        </p>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleSharePdf}
                      className="gap-2 cursor-pointer"
                    >
                      <FileDown className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs font-semibold">Enviar PDF</p>
                        <p className="text-[10px] text-muted-foreground leading-tight">
                          Gera e compartilha o PDF do período
                        </p>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Payment Adjustments Section */}
      {selectedEmployee && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold">Ajustes de Pagamento</h3>
              <p className="text-xs text-muted-foreground">Adiantamentos, bônus e descontos registrados para {selectedEmployee.nome} no período selecionado</p>
            </div>
            <Button
              size="sm"
              onClick={() => handleOpenAdvanceForm()}
              className="bg-[#0a192f] hover:bg-[#0a192f]/90 text-white text-xs h-8 gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="shadow-none border">
              <CardContent className="py-3 px-4">
                <p className="text-xs text-muted-foreground">Adiantamentos / Descontos</p>
                <p className="text-lg font-bold text-red-600 dark:text-red-400">{fmt(deductionTotal)}</p>
              </CardContent>
            </Card>
            <Card className="shadow-none border">
              <CardContent className="py-3 px-4">
                <p className="text-xs text-muted-foreground">Bônus</p>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{fmt(bonusTotal)}</p>
              </CardContent>
            </Card>
            <Card className="shadow-none border bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/30 dark:to-card">
              <CardContent className="py-3 px-4">
                <p className="text-xs text-muted-foreground">Final a Receber</p>
                <p className="text-lg font-bold text-blue-700 dark:text-blue-400">{fmt(finalAmount)}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-none border">
            <CardContent className="p-0">
              {advancesLoading ? (
                <div className="p-4 space-y-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : !advances?.length ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-1">
                  <p className="text-sm">Nenhum ajuste de pagamento registrado neste período</p>
                  <p className="text-xs">Clique em "Adicionar" para registrar</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="w-[70px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {advances.map(adv => (
                      <TableRow key={adv.id}>
                        <TableCell className="text-sm">{adv.data}</TableCell>
                        <TableCell>
                          <Badge
                            variant={isAddType(adv.tipo) ? "default" : "destructive"}
                            className="text-xs"
                          >
                            {adv.tipo}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{adv.descricao || "—"}</TableCell>
                        <TableCell className={`text-right text-sm font-semibold ${isAddType(adv.tipo) ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                          {isAddType(adv.tipo) ? "+" : "−"}{fmt(Number(adv.valor))}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpenAdvanceForm(adv)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteAdvance(adv.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Payment Adjustment Form Dialog */}
      <Dialog open={showAdvanceForm} onOpenChange={setShowAdvanceForm}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editingAdvance ? "Editar" : "Novo"} Ajuste de Pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input
                type="date"
                value={advanceForm.data}
                onChange={e => setAdvanceForm(prev => ({ ...prev, data: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={advanceForm.tipo} onValueChange={v => setAdvanceForm(prev => ({ ...prev, tipo: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADJUSTMENT_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição (opcional)</Label>
              <Input
                placeholder="Ex: Adiantamento quinzenal…"
                value={advanceForm.descricao}
                onChange={e => setAdvanceForm(prev => ({ ...prev, descricao: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Valor (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={advanceForm.valor}
                onChange={e => setAdvanceForm(prev => ({ ...prev, valor: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdvanceForm(false)}>Cancelar</Button>
            <Button
              onClick={handleSaveAdvance}
              disabled={createAdvanceMutation.isPending || updateAdvanceMutation.isPending}
              className="bg-[#0a192f] hover:bg-[#0a192f]/90 text-white"
            >
              {editingAdvance ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
