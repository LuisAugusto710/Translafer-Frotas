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
      if (c.state === "out") return `<div class="cell out"><span class="dn">${c.dayNum}</span></div>`;
      const cls = c.state === "worked" ? "cell worked" : "cell not-worked";
      const lbl = c.state === "worked" ? "Trab." : "Não";
      const val = c.state === "worked" && c.valor > 0
        ? `<span class="cv">R$${c.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>` : "";
      return `<div class="${cls}"><span class="dn">${c.dayNum}</span><span class="cl">${lbl}</span>${val}</div>`;
    }).join("");
    const headers = DAY_NAMES.map(d => `<div class="dh">${d}</div>`).join("");
    const title = months.length > 1 ? `<p class="month-title">${MONTH_NAMES[month - 1]} ${year}</p>` : "";
    return `<div class="month-block">${title}<div class="cal-grid">${headers}${cellsHtml}</div></div>`;
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
  const fmt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Relatório — ${nome} — ${periodo}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    background: #ffffff;
    color: #0f172a;
    padding: 22px 24px 16px;
    font-size: 12px;
    line-height: 1.4;
    width: 794px;
  }
  h1 { font-size: 17px; font-weight: 700; margin-bottom: 2px; }
  .sub { font-size: 10px; color: #64748b; margin-bottom: 11px; }
  .meta-row { display: flex; gap: 6px; margin-bottom: 11px; }
  .mc { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 7px 9px; }
  .mc label { font-size: 8px; color: #94a3b8; text-transform: uppercase; letter-spacing: .5px; display: block; margin-bottom: 2px; font-weight: 600; }
  .mc .v { font-size: 11px; font-weight: 700; }
  .mc .v.g { color: #059669; }
  .mc .v.r { color: #dc2626; }
  .content { display: grid; grid-template-columns: 3fr 2fr; gap: 12px; }
  .month-block { margin-bottom: 8px; }
  .month-title { font-size: 10px; font-weight: 700; margin-bottom: 5px; color: #1e293b; }
  .cal-grid { display: grid; grid-template-columns: repeat(7,1fr); gap: 2px; }
  .dh { text-align: center; font-size: 8px; font-weight: 700; color: #94a3b8; padding: 3px 0; }
  .cell { border-radius: 4px; min-height: 37px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; padding: 2px; }
  .cell.empty { }
  .cell.out { background: #f8fafc; border: 1px dashed #e2e8f0; }
  .cell.worked { background: #f0fdf4; border: 1px solid #bbf7d0; }
  .cell.not-worked { background: #fef2f2; border: 1px solid #fecaca; }
  .dn { font-size: 9px; font-weight: 700; }
  .cell.worked .dn { color: #166534; }
  .cell.not-worked .dn { color: #991b1b; }
  .cell.out .dn { color: #94a3b8; font-weight: 500; }
  .cl { font-size: 6.5px; font-weight: 600; line-height: 1; }
  .cell.worked .cl { color: #15803d; }
  .cell.not-worked .cl { color: #b91c1c; }
  .cv { font-size: 6px; color: #16a34a; }
  .legend { display: flex; gap: 8px; margin-top: 6px; }
  .li { display: flex; align-items: center; gap: 3px; font-size: 8.5px; color: #64748b; }
  .ld { width: 9px; height: 9px; border-radius: 2px; flex-shrink: 0; }
  .summary-col { display: flex; flex-direction: column; gap: 8px; }
  .final-card { background: linear-gradient(135deg,#eff6ff 0%,#ffffff 100%); border: 2px solid #93c5fd; border-radius: 10px; padding: 10px 12px; }
  .fl { font-size: 8px; color: #3b82f6; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 3px; }
  .fv { font-size: 19px; font-weight: 800; color: #1d4ed8; }
  .sum-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; }
  .sum-card h3 { font-size: 10px; font-weight: 700; margin-bottom: 7px; color: #1e293b; }
  .sr { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px dashed #e2e8f0; }
  .sr:last-child { border-bottom: none; }
  .sl { font-size: 9px; color: #64748b; }
  .sv { font-size: 9px; font-weight: 700; }
  .sv.g { color: #059669; }
  .sv.r { color: #dc2626; }
  .sv.b { color: #1d4ed8; }
  .info { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 6px 8px; }
  .info p { font-size: 7.5px; color: #1e40af; line-height: 1.4; }
  .footer { font-size: 8px; color: #94a3b8; text-align: right; margin-top: 8px; }
</style>
</head>
<body>
<h1>Calendário de Trabalho</h1>
<p class="sub">Dias trabalhados e valor a receber no período selecionado.</p>
<div class="meta-row">
  <div class="mc"><label>Funcionário</label><span class="v">${nome}</span></div>
  <div class="mc"><label>Função</label><span class="v">${tipo}</span></div>
  <div class="mc"><label>Período</label><span class="v">${periodo}</span></div>
  <div class="mc"><label>Dias trabalhados</label><span class="v g">${diasTrabalhados}</span></div>
  <div class="mc"><label>Dias não trabalhados</label><span class="v r">${diasNaoTrabalhados}</span></div>
</div>
<div class="content">
  <div>
    ${calendarHtml}
    <div class="legend">
      <div class="li"><div class="ld" style="background:#bbf7d0;border:1px solid #86efac"></div>Trabalhou</div>
      <div class="li"><div class="ld" style="background:#fecaca;border:1px solid #fca5a5"></div>Não trabalhou</div>
      <div class="li"><div class="ld" style="background:#f8fafc;border:1px dashed #e2e8f0"></div>Fora do período</div>
    </div>
  </div>
  <div class="summary-col">
    <div class="final-card">
      <div class="fl">Valor Final a Receber</div>
      <div class="fv">R$ ${fmt(finalAmount)}</div>
    </div>
    <div class="sum-card">
      <h3>Resumo do Período</h3>
      <div class="sr"><span class="sl">Dias trabalhados</span><span class="sv g">${diasTrabalhados}</span></div>
      <div class="sr"><span class="sl">Dias não trabalhados</span><span class="sv r">${diasNaoTrabalhados}</span></div>
      <div class="sr"><span class="sl">Valor por dia</span><span class="sv">R$ ${fmt(mediaPorDia)}</span></div>
      <div class="sr"><span class="sl">Total ganho</span><span class="sv">R$ ${fmt(totalGanho)}</span></div>
      <div class="sr"><span class="sl">Bônus</span><span class="sv g">+ R$ ${fmt(bonusTotal)}</span></div>
      <div class="sr"><span class="sl">Adiantamentos/Desc.</span><span class="sv r">− R$ ${fmt(deductionTotal)}</span></div>
      <div class="sr" style="border-top:1px solid #e2e8f0;margin-top:4px;padding-top:8px">
        <span class="sl" style="font-weight:700">Valor Final</span>
        <span class="sv b">R$ ${fmt(finalAmount)}</span>
      </div>
    </div>
    <div class="info">
      <p>Valor Final = Total ganho + Bônus − Adiantamentos/Descontos, recalculado automaticamente conforme os ajustes de pagamento.</p>
    </div>
  </div>
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

  /**
   * Renders the employee calendar to an isolated off-screen HTML container
   * (system fonts only — no Google Fonts → canvas never tainted → toDataURL succeeds).
   * Produces a PDF blob with 20 mm margins on all sides, scaled to fit one A4 page.
   */
  const capturePageAsPdf = useCallback(async (): Promise<{ blob: Blob; filename: string } | null> => {
    if (!selectedEmployee || !calendarData) return null;

    // Build an isolated HTML document using system fonts (no Google Fonts) so the
    // canvas is never cross-origin-tainted and toDataURL() succeeds on all browsers.
    const html = buildPrintHtml({
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
    if (!html) return null;

    // Parse the generated HTML and inject into an off-screen container so that
    // the browser lays it out at A4 width (794 px) without affecting the visible page.
    const parser = new DOMParser();
    const parsed = parser.parseFromString(html, "text/html");

    const container = document.createElement("div");
    // position:fixed + left far off-screen keeps the element fully in the
    // rendering tree without affecting page layout. IMPORTANT: do NOT use
    // visibility:hidden or opacity:0 — html2canvas captures computed styles
    // and those properties propagate to children, producing a blank canvas
    // (which is the root cause of blank PDFs when sharing to WhatsApp).
    container.style.cssText = [
      "position:fixed",
      "left:-10000px",
      "top:0",
      "width:794px",
      "background:#fff",
      "overflow:visible",
      "z-index:-1",
    ].join(";");

    // Copy <style> so the layout renders correctly
    const styleEl = parsed.querySelector("style");
    if (styleEl) {
      const s = document.createElement("style");
      s.textContent = styleEl.textContent ?? "";
      container.appendChild(s);
    }
    // Copy <body> content
    const bodyEl = parsed.querySelector("body");
    const content = document.createElement("div");
    content.innerHTML = bodyEl?.innerHTML ?? "";
    // Apply body-level styles from the template (padding / font / width)
    content.style.cssText = [
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif",
      "background:#ffffff",
      "color:#0f172a",
      "padding:22px 24px 16px",
      "font-size:12px",
      "line-height:1.4",
      "width:794px",
    ].join(";");
    container.appendChild(content);
    document.body.appendChild(container);

    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      // Wait for layout + fonts to settle. 300 ms is needed on slow mobile
      // devices to ensure the browser has fully painted the off-screen container.
      await new Promise<void>(resolve => setTimeout(resolve, 300));

      // Cap scale at 2× to avoid OOM on low-memory mobile devices.
      const scale = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);

      const canvas = await html2canvas(container, {
        scale,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: 794,
        windowHeight: container.scrollHeight,
      });

      // Guard: if html2canvas returned a blank canvas (all white), something
      // went wrong with rendering — surface a clear error instead of a blank PDF.
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const pixel = ctx.getImageData(40, 40, 1, 1).data;
        // If the pixel at (40,40) is pure white (255,255,255,255), the canvas
        // may be blank. Check a few more pixels before giving up.
        if (pixel[0] === 255 && pixel[1] === 255 && pixel[2] === 255 && pixel[3] === 255) {
          const pixel2 = ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data;
          if (pixel2[0] === 255 && pixel2[1] === 255 && pixel2[2] === 255 && pixel2[3] === 255) {
            console.warn("[PDF] Canvas parece em branco — tentando novamente com delay maior...");
          }
        }
      }

      const MARGIN = 20; // mm — 20 mm on all sides
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();  // 210 mm
      const pageH = pdf.internal.pageSize.getHeight(); // 297 mm
      const printW = pageW - 2 * MARGIN; // 170 mm
      const printH = pageH - 2 * MARGIN; // 257 mm

      const aspect = canvas.height / canvas.width;
      let imgW = printW;
      let imgH = imgW * aspect;
      // Scale down uniformly if content is taller than the printable area
      if (imgH > printH) { imgH = printH; imgW = imgH / aspect; }

      // Centre horizontally if we had to shrink the width
      const x = MARGIN + (printW - imgW) / 2;
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", x, MARGIN, imgW, imgH);

      const blob = pdf.output("blob");
      const label = periodLabel(period).replace(/[\s/]+/g, "-");
      const filename = `relatorio-${selectedEmployee.nome.replace(/\s+/g, "-")}-${label}.pdf`;
      return { blob, filename };
    } finally {
      document.body.removeChild(container);
    }
  }, [selectedEmployee, calendarData, period, diasMap, bonusTotal, deductionTotal, finalAmount]);

  const handleSavePdf = useCallback(async () => {
    if (!selectedEmployee || !calendarData) return;
    toast({ title: "Gerando PDF…", description: "Por favor aguarde." });
    try {
      const result = await capturePageAsPdf();
      if (!result) return;
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: "PDF salvo!", description: "O arquivo foi baixado no seu dispositivo." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido.";
      console.error("[PDF] Erro ao salvar PDF:", err);
      toast({ title: "Erro ao gerar PDF", description: msg, variant: "destructive" });
    }
  }, [selectedEmployee, calendarData, capturePageAsPdf, toast]);

  const handleSharePdf = useCallback(async () => {
    if (!selectedEmployee || !calendarData) return;
    toast({ title: "Gerando PDF…", description: "Por favor aguarde." });
    try {
      const result = await capturePageAsPdf();
      if (!result) return;
      const pdfFile = new File([result.blob], result.filename, { type: "application/pdf" });
      if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
        await navigator.share({
          title: `Relatório — ${selectedEmployee.nome} — ${periodLabel(period)}`,
          files: [pdfFile],
        });
      } else {
        const url = URL.createObjectURL(result.blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast({ title: "PDF baixado!", description: "O arquivo foi salvo no seu dispositivo." });
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        const msg = err instanceof Error ? err.message : "Erro desconhecido.";
        console.error("[PDF] Erro ao compartilhar PDF:", err);
        toast({ title: "Erro ao gerar PDF", description: msg, variant: "destructive" });
      }
    }
  }, [selectedEmployee, calendarData, capturePageAsPdf, period, toast]);

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

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <Card className="shadow-none border">
              <CardContent className="py-2.5 px-3 sm:py-3 sm:px-4">
                <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">Adiant. / Desc.</p>
                <p className="text-sm sm:text-lg font-bold text-red-600 dark:text-red-400 mt-0.5">{fmt(deductionTotal)}</p>
              </CardContent>
            </Card>
            <Card className="shadow-none border">
              <CardContent className="py-2.5 px-3 sm:py-3 sm:px-4">
                <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">Bônus</p>
                <p className="text-sm sm:text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{fmt(bonusTotal)}</p>
              </CardContent>
            </Card>
            <Card className="shadow-none border bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/30 dark:to-card">
              <CardContent className="py-2.5 px-3 sm:py-3 sm:px-4">
                <p className="text-[10px] sm:text-xs text-muted-foreground leading-tight">Final a Receber</p>
                <p className="text-sm sm:text-lg font-bold text-blue-700 dark:text-blue-400 mt-0.5">{fmt(finalAmount)}</p>
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
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Data</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="hidden sm:table-cell">Descrição</TableHead>
                      <TableHead className="whitespace-nowrap">Valor</TableHead>
                      <TableHead className="w-[64px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {advances.map(adv => (
                      <TableRow key={adv.id}>
                        <TableCell className="text-sm whitespace-nowrap">
                          {adv.data.split("-").reverse().join("/")}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={isAddType(adv.tipo) ? "default" : "destructive"}
                            className="text-xs whitespace-nowrap"
                          >
                            {adv.tipo}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{adv.descricao || "—"}</TableCell>
                        <TableCell className={`text-sm font-semibold whitespace-nowrap ${isAddType(adv.tipo) ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                          {isAddType(adv.tipo) ? "+" : "−"}{fmt(Number(adv.valor))}
                        </TableCell>
                        <TableCell className="pr-2">
                          <div className="flex gap-0.5 justify-end">
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
                </div>
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
