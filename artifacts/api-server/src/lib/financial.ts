/**
 * Centralized Financial Calculation Engine
 *
 * This is the SINGLE source of truth for all consolidated financial formulas in the application.
 *
 * Canonical rules:
 *   Revenue    = fretesTable.frete + fretesTable.pedagio
 *   Expenses   = sum(non-diesel costs from despesasTable) + sum(abastecimentosTable.totalPago)
 *   Net Profit = Revenue - Expenses
 *
 * Diesel is tracked in two places:
 *   1. despesasTable.dieselRs — operational/reference value on the daily expense record
 *   2. abastecimentosTable.totalPago — detailed per-refueling fuel cost
 *
 * IMPORTANT: for consolidated financial calculations, diesel is counted ONLY from
 * abastecimentosTable.totalPago. despesasTable.dieselRs must never be added to the
 * consolidated expense total, otherwise the same fuel cost can be counted twice.
 */

import { db, fretesTable, abastecimentosTable, despesasTable, manutencoesTable } from "@workspace/db";
import { gte, lte, and, eq, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

// ── trocaOleoParcela parsing ──────────────────────────────────────────────────
// This column is stored as text ("100,00" or "100.00") — parse it to numeric.
export const trocaOleoParsed = sql<number>`COALESCE(NULLIF(REPLACE(REPLACE(trim(${despesasTable.trocaOleoParcela}::text), ',', '.'), ' ', ''), '')::numeric, 0)`;

// ── Expense category definitions ──────────────────────────────────────────────
// Canonical ordered list of monetary expense categories from despesasTable used
// in consolidated financial calculations. Diesel is intentionally excluded here
// because consolidated diesel comes exclusively from abastecimentosTable.totalPago.
export const DESPESA_CATEGORIAS: Array<{ label: string; col: AnyPgColumn }> = [
  { label: "DAS",          col: despesasTable.das },
  { label: "Motorista",    col: despesasTable.motorista },
  { label: "Almoço",      col: despesasTable.almoco },
  { label: "Ajudante",     col: despesasTable.ajudante },
  { label: "Pedágio",     col: despesasTable.pedagio },
  { label: "Unimed",       col: despesasTable.unimed },
  { label: "Seguro",       col: despesasTable.seguro },
  { label: "Gasto",        col: despesasTable.gasto },
  { label: "Rastreador",   col: despesasTable.rastreador },
  { label: "INSS",         col: despesasTable.inss },
  { label: "Escritório",  col: despesasTable.escritorio },
  { label: "IPVA",         col: despesasTable.ipva },
  { label: "Bsoft",        col: despesasTable.bsoft },
];

// ── Canonical cost SQL fragment ───────────────────────────────────────────────
// Sum of monetary cost columns from despesasTable (+ trocaOleoParcela), EXCLUDING
// dieselRs. KM and DieselLt are metrics, NOT costs. dieselRs is retained as an
// operational/reference field, but consolidated diesel cost comes only from
// abastecimentosTable.totalPago.
// Total expenses = despesaCustosSql + abastecimentos.totalPago + manutencoes.custo.
export const despesaCustosSql = sql<number>`
  coalesce(${despesasTable.das},0)
  +coalesce(${despesasTable.motorista},0)
  +coalesce(${despesasTable.almoco},0)
  +coalesce(${despesasTable.ajudante},0)
  +coalesce(${despesasTable.pedagio},0)
  +coalesce(${despesasTable.unimed},0)
  +coalesce(${despesasTable.seguro},0)
  +coalesce(${despesasTable.gasto},0)
  +coalesce(${despesasTable.rastreador},0)
  +coalesce(${despesasTable.inss},0)
  +coalesce(${despesasTable.escritorio},0)
  +coalesce(${despesasTable.ipva},0)
  +coalesce(${despesasTable.bsoft},0)
  +${trocaOleoParsed}`;

// ── Where-clause builders ─────────────────────────────────────────────────────

export function toDateStr(v: unknown): string | undefined {
  if (!v) return undefined;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

/** Where clause for fretesTable (date column: dataCte). */
export function freteWhere(
  dateFrom?: string,
  dateTo?: string,
  frota?: string,
) {
  const c = [];
  if (dateFrom) c.push(gte(fretesTable.dataCte, dateFrom));
  if (dateTo)   c.push(lte(fretesTable.dataCte, dateTo));
  if (frota)    c.push(eq(fretesTable.frota, frota));
  return c.length ? and(...c) : undefined;
}

/** Where clause for despesasTable (date column: data). */
export function despWhere(
  dateFrom?: string,
  dateTo?: string,
  frota?: string,
) {
  const c = [];
  if (dateFrom) c.push(gte(despesasTable.data, dateFrom));
  if (dateTo)   c.push(lte(despesasTable.data, dateTo));
  if (frota)    c.push(eq(despesasTable.frota, frota));
  return c.length ? and(...c) : undefined;
}

/** Where clause for abastecimentosTable (date column: data). */
export function abastWhere(
  dateFrom?: string,
  dateTo?: string,
  frota?: string,
) {
  const c = [];
  if (dateFrom) c.push(gte(abastecimentosTable.data, dateFrom));
  if (dateTo)   c.push(lte(abastecimentosTable.data, dateTo));
  if (frota)    c.push(eq(abastecimentosTable.placa, frota));
  return c.length ? and(...c) : undefined;
}

// ── Per-frota diesel from abastecimentos ──────────────────────────────────────
/**
 * Returns a map of frota -> abastecimentos diesel cost.
 * This is the canonical diesel cost source for consolidated financial totals.
 */
export async function getDieselAbastPerFrota(
  dateFrom?: string,
  dateTo?: string,
  frota?: string,
): Promise<Record<string, number>> {
  const conditions = [];
  if (dateFrom) conditions.push(gte(abastecimentosTable.data, dateFrom));
  if (dateTo)   conditions.push(lte(abastecimentosTable.data, dateTo));
  // If a specific frota is requested, filter by placa.
  if (frota)    conditions.push(eq(abastecimentosTable.placa, frota));
  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db.select({
    placa:      abastecimentosTable.placa,
    totalPago:  sql<number>`coalesce(sum(${abastecimentosTable.totalPago}), 0)`,
  }).from(abastecimentosTable).where(where).groupBy(abastecimentosTable.placa);

  const map: Record<string, number> = {};
  for (const r of rows) {
    map[r.placa ?? ""] = Number(r.totalPago ?? 0);
  }
  return map;
}

/**
 * Returns total abastecimentos diesel cost (all frotas combined).
 */
export async function getTotalDieselAbast(
  dateFrom?: string,
  dateTo?: string,
  frota?: string,
): Promise<number> {
  const where = abastWhere(dateFrom, dateTo, frota);
  const [row] = await db.select({
    total: sql<number>`coalesce(sum(${abastecimentosTable.totalPago}), 0)`,
  }).from(abastecimentosTable).where(where);
  return Number(row?.total ?? 0);
}

// ── Maintenance cost helpers ──────────────────────────────────────────────────
// Maintenance costs (manutencoesTable.custo) are real expenses that must be
// included in all financial calculations alongside despesas and abastecimentos.

/** Where clause for manutencoesTable (date column: dataManutencao). */
export function manutWhere(
  dateFrom?: string,
  dateTo?: string,
  frota?: string,
) {
  const c = [];
  if (dateFrom) c.push(gte(manutencoesTable.dataManutencao, dateFrom));
  if (dateTo)   c.push(lte(manutencoesTable.dataManutencao, dateTo));
  if (frota)    c.push(eq(manutencoesTable.frota, frota));
  return c.length ? and(...c) : undefined;
}

/**
 * Returns total maintenance cost across all frotas.
 */
export async function getTotalManutencaoCost(
  dateFrom?: string,
  dateTo?: string,
  frota?: string,
): Promise<number> {
  const where = manutWhere(dateFrom, dateTo, frota);
  const [row] = await db.select({
    total: sql<number>`coalesce(sum(${manutencoesTable.custo}), 0)`,
  }).from(manutencoesTable).where(where);
  return Number(row?.total ?? 0);
}

/**
 * Returns a map of frota -> maintenance cost.
 * Must be added to per-frota expense totals in every endpoint.
 */
export async function getManutencaoCostPerFrota(
  dateFrom?: string,
  dateTo?: string,
  frota?: string,
): Promise<Record<string, number>> {
  const conditions = [];
  if (dateFrom) conditions.push(gte(manutencoesTable.dataManutencao, dateFrom));
  if (dateTo)   conditions.push(lte(manutencoesTable.dataManutencao, dateTo));
  if (frota)    conditions.push(eq(manutencoesTable.frota, frota));
  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db.select({
    frota:      manutencoesTable.frota,
    totalCusto: sql<number>`coalesce(sum(${manutencoesTable.custo}), 0)`,
  }).from(manutencoesTable).where(where).groupBy(manutencoesTable.frota);

  const map: Record<string, number> = {};
  for (const r of rows) {
    map[r.frota ?? ""] = Number(r.totalCusto ?? 0);
  }
  return map;
}

/**
 * Returns a map of month (YYYY-MM) -> maintenance cost.
 */
export async function getManutencaoCostPerMonth(
  dateFrom?: string,
  dateTo?: string,
  frota?: string,
): Promise<Record<string, number>> {
  const where = manutWhere(dateFrom, dateTo, frota);
  const rows = await db.select({
    mes:        sql<string>`to_char(date_trunc('month', ${manutencoesTable.dataManutencao}::date), 'YYYY-MM')`,
    totalCusto: sql<number>`coalesce(sum(${manutencoesTable.custo}), 0)`,
  }).from(manutencoesTable).where(where)
    .groupBy(sql`date_trunc('month', ${manutencoesTable.dataManutencao}::date)`);

  const map: Record<string, number> = {};
  for (const r of rows) {
    map[r.mes ?? ""] = Number(r.totalCusto ?? 0);
  }
  return map;
}
