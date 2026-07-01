/**
 * Backup module — generates daily .xlsx snapshots of all app data.
 *
 * Files are written to <cwd>/backups/ (i.e. artifacts/api-server/backups/).
 * A temp-file strategy prevents partial/corrupt files:
 *   1. write to backup_YYYY-MM-DD.xlsx.tmp
 *   2. fs.rename() atomically replaces it with the final name
 *
 * Exposed functions are called by:
 *   - index.ts  → node-cron schedule (daily 02:00) + immediate startup run
 *   - routes/backup.ts → manual trigger endpoint
 */

import path from "node:path";
import fs from "node:fs/promises";
import { db, fretesTable, abastecimentosTable, despesasTable } from "@workspace/db";
import { asc } from "drizzle-orm";
import * as XLSX from "xlsx";
import { logger } from "./lib/logger";

export const BACKUP_DIR = path.resolve(process.cwd(), "backups");

async function ensureDir(): Promise<void> {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return "";
  const parts = v.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return v;
}

export async function generateBackup(): Promise<string> {
  await ensureDir();

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const filename = `lafer_backup_${today}.xlsx`;
  const filepath = path.join(BACKUP_DIR, filename);

  // Skip if a valid backup for today already exists
  try {
    await fs.access(filepath);
    logger.info({ filename }, "Backup de hoje já existe — ignorando");
    return filename;
  } catch {
    // File absent — proceed
  }

  logger.info("Iniciando geração de backup diário…");

  // ── Fetch all data in parallel ─────────────────────────────────────────────
  const [fretesData, dieselData, despesasData] = await Promise.all([
    db.select().from(fretesTable).orderBy(asc(fretesTable.dataCte)),
    db.select().from(abastecimentosTable).orderBy(asc(abastecimentosTable.data)),
    db.select().from(despesasTable).orderBy(asc(despesasTable.data)),
  ]);

  const DESPESA_COST_KEYS = [
    "dieselRs", "das", "motorista", "almoco", "ajudante", "pedagio",
    "unimed", "seguro", "gasto", "rastreador", "inss", "escritorio", "ipva", "bsoft",
  ] as const;

  // ── Build workbook ─────────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new();

  // Sheet 1 — Fretes
  const fretesRows: (string | number)[][] = [
    [
      "Data CTE", "Origem", "Transporte", "Frota", "Transp",
      "Cliente", "Cidade", "CTE/NF",
      "Peso (kg)", "Frete (R$)", "Pedágio (R$)", "Total Frete (R$)",
      "Dta Frete", "Vencimento", "Obs",
    ],
  ];
  for (const f of fretesData) {
    const frete   = Number(f.frete   ?? 0);
    const pedagio = Number(f.pedagio ?? 0);
    fretesRows.push([
      fmtDate(f.dataCte),
      f.origem,
      f.transporte  ?? "",
      f.frota,
      f.transp      ?? "",
      f.cliente,
      f.cidade,
      f.cteNf       ?? "",
      Number(f.peso ?? 0),
      frete,
      pedagio,
      frete + pedagio,
      fmtDate(f.dtaFrete),
      fmtDate(f.vencimento),
      f.obs ?? "",
    ]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(fretesRows), "Fretes");

  // Sheet 2 — Diesel
  const dieselRows: (string | number)[][] = [
    [
      "Requisição", "Posto", "Data", "Placa",
      "Litros", "Preço/L (R$)", "Total Pago (R$)",
      "KM Início", "KM Final", "KM Percorrido", "Média (km/L)",
    ],
  ];
  for (const a of dieselData) {
    dieselRows.push([
      a.requisicao  ?? "",
      a.posto       ?? "",
      fmtDate(a.data),
      a.placa,
      Number(a.litros       ?? 0),
      Number(a.precoLitro   ?? 0),
      Number(a.totalPago    ?? 0),
      Number(a.kmInicio     ?? 0),
      Number(a.kmFinal      ?? 0),
      Number(a.kmPercorrido ?? 0),
      Number(a.media        ?? 0),
    ]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dieselRows), "Diesel");

  // Sheet 3 — Despesas
  const despesasRows: (string | number)[][] = [
    [
      "Data", "Frota", "Cidade", "Motorista (Nome)", "Ajudante (Nome)",
      "Frete (R$)", "KM", "Diesel (LT)", "Diesel (R$)",
      "DAS", "Motorista", "Almoço", "Ajudante", "Pedágio", "Unimed", "Seguro",
      "Gasto", "Rastreador", "INSS", "Escritório", "IPVA", "Bsoft",
      "Total Despesa (R$)", "Lucro (R$)", "Parcela Troca de Óleo", "Obs",
    ],
  ];
  for (const d of despesasData) {
    const totalDespesa = DESPESA_COST_KEYS.reduce((s, k) => s + Number(d[k] ?? 0), 0);
    despesasRows.push([
      fmtDate(d.data),
      d.frota,
      d.cidade,
      d.motoristaNome ?? "",
      d.ajudanteNome ?? "",
      Number(d.frete ?? 0),
      Number(d.km ?? 0),
      Number(d.dieselLt ?? 0),
      Number(d.dieselRs ?? 0),
      Number(d.das ?? 0),
      Number(d.motorista ?? 0),
      Number(d.almoco ?? 0),
      Number(d.ajudante ?? 0),
      Number(d.pedagio ?? 0),
      Number(d.unimed ?? 0),
      Number(d.seguro ?? 0),
      Number(d.gasto ?? 0),
      Number(d.rastreador ?? 0),
      Number(d.inss ?? 0),
      Number(d.escritorio ?? 0),
      Number(d.ipva ?? 0),
      Number(d.bsoft ?? 0),
      Math.round(totalDespesa * 100) / 100,
      Number(d.lucro ?? 0),
      d.trocaOleoParcela ?? "",
      d.obs ?? "",
    ]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(despesasRows), "Despesas");

  // Sheet 4 — Resumo
  const totalFrete   = fretesData.reduce((s, f) => s + Number(f.frete   ?? 0), 0);
  const totalPedagio = fretesData.reduce((s, f) => s + Number(f.pedagio ?? 0), 0);
  const totalDiesel  = dieselData.reduce((s, a) => s + Number(a.totalPago ?? 0), 0);

  const despFrete  = despesasData.reduce((s, d) => s + Number(d.frete ?? 0), 0);
  const despCustos = despesasData.reduce(
    (s, d) => s + DESPESA_COST_KEYS.reduce((ss, k) => ss + Number(d[k] ?? 0), 0), 0);
  const despLucro  = despesasData.reduce((s, d) => s + Number(d.lucro ?? 0), 0);

  const resumoRows: (string | number | Date)[][] = [
    ["Métrica", "Valor"],
    ["Total de Fretes (registros)", fretesData.length],
    ["Receita de Fretes (R$)",      totalFrete],
    ["Total de Pedágios (R$)",      totalPedagio],
    ["Total Geral Fretes (R$)",     totalFrete + totalPedagio],
    ["", ""],
    ["Total de Abastecimentos (registros)", dieselData.length],
    ["Total Diesel (R$)",           totalDiesel],
    ["", ""],
    ["Total de Despesas (registros)", despesasData.length],
    ["Despesas — Frete (R$)",       despFrete],
    ["Despesas — Custos (R$)",      despCustos],
    ["Despesas — Lucro (R$)",       despLucro],
    ["", ""],
    ["Data do Backup",              new Date().toLocaleString("pt-BR")],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumoRows), "Resumo");

  // ── Safe write: temp → rename ──────────────────────────────────────────────
  const tempPath = filepath + ".tmp";
  XLSX.writeFile(wb, tempPath, { bookType: "xlsx" });
  await fs.rename(tempPath, filepath);

  logger.info(
    { filename, fretes: fretesData.length, abastecimentos: dieselData.length, despesas: despesasData.length },
    "Backup gerado com sucesso",
  );
  return filename;
}

export async function listBackups(): Promise<Array<{ filename: string; date: string; sizeKb: number }>> {
  try {
    await ensureDir();
    const files = await fs.readdir(BACKUP_DIR);
    const backupFiles = files
      .filter((f) => f.startsWith("lafer_backup_") && f.endsWith(".xlsx"))
      .sort()
      .reverse(); // newest first

    return Promise.all(
      backupFiles.map(async (filename) => {
        const stat = await fs.stat(path.join(BACKUP_DIR, filename));
        const m = filename.match(/lafer_backup_(\d{4}-\d{2}-\d{2})\.xlsx/);
        return {
          filename,
          date: m ? m[1] : "",
          sizeKb: Math.round(stat.size / 1024),
        };
      }),
    );
  } catch {
    return [];
  }
}
