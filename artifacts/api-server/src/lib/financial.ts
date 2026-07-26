/**
 * Centralized Financial Calculation Engine
 *
 * This is the SINGLE source of truth for all financial formulas in the application.
 *
 * ── Canonical rules (reverse-engineered from Excel "LUCRO" spreadsheet) ────────
 *
 *   Revenue    = sum(despesasTable.frete)
 *                ↳ The daily operational frete column from despesasTable
 *
 *   Expenses   = sum(despesaCustosSql) + sum(abastecimentosTable.totalPago)
 *                ↳ despesaCustosSql = sum of 14 cost columns from despesasTable
 *                  (includes dieselRs — the per-trip estimated diesel cost)
 *                ↳ abastecimentos.totalPago = actual fuel purchases (must always be included)
 *
 *   Net Profit = Revenue - Expenses
 *
 * ── Verified against LUCRO Excel spreadsheet (June 2026) ────────────────────
 *
 *   Frota 4100: Revenue=R$18,232.50, ColExpenses=R$9,238.56, Abast=R$2,259.90
 *               → Total Expenses = R$11,498.46 ≈ Excel R$11,498.47 ✓
 *               → Profit = R$6,734.04 ≈ Excel R$6,734.03 ✓
 *
 *   Frota 4104: Revenue=R$5,293.76, ColExpenses=R$3,782.13, Abast=R$745.84
 *               → Total Expenses = R$4,527.97 ≈ Excel R$4,527.96 ✓
 *               → Profit = R$765.79 ≈ Excel R$765.80 ✓
 *
 * ── Diesel — two legitimate entries, both are real costs ─────────────────────
 *
 *   despesasTable.dieselRs = per-trip estimated diesel cost (km × rate)
 *   abastecimentosTable.totalPago = actual fuel purchases from the pump
 *
 *   These track diesel from two perspectives and BOTH must be counted.
 *   The Excel spreadsheet explicitly subtracts both from revenue in every period.
 *   Removing abastecimentos from the expense total = under-counting expenses.
 *
 * ── Revenue source distinction ─────────────────────────────────────────────────
 *
 *   despesasTable.frete = daily operational revenue (matches LUCRO spreadsheet)
 *   fretesTable.frete   = formal CTE/invoice records (separate billing system)
 *
 *   For P&L matching the LUCRO spreadsheet, always use despesasTable.frete as revenue.
 *   fretesTable is for CTE/invoice tracking and may differ from daily records.
 */

import { fretesTable, abastecimentosTable, despesasTable } from "@workspace/db";
import { gte, lte, and, eq, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

// ── trocaOleoParcela parsing ──────────────────────────────────────────────────
// This column is stored as text ("100,00" or "100.00") — parse it to numeric.
export const trocaOleoParsed = sql<number>`COALESCE(NULLIF(REPLACE(REPLACE(trim(${despesasTable.trocaOleoParcela}::text), ',', '.'), ' ', ''), '')::numeric, 0)`;

// ── Expense category definitions ──────────────────────────────────────────────
// Canonical ordered list of ALL expense categories from despesasTable.
// Every endpoint must use exactly this list — never a subset or superset.
// abastecimentosTable.totalPago is added SEPARATELY on top of this list.
export const DESPESA_CATEGORIAS: Array<{ label: string; col: AnyPgColumn }> = [
  { label: "Diesel",       col: despesasTable.dieselRs },   // per-trip estimated diesel cost
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

// ── Canonical cost SQL fragment (column expenses only) ────────────────────────
// Sum of ALL 14 monetary cost columns from despesasTable (+ trocaOleoParcela).
// KM and DieselLt are metrics — excluded.
// IMPORTANT: abastecimentos.totalPago is NOT here — it is added separately
// in each endpoint query so it can be filtered by frota/date independently.
export const despesaCustosSql = sql<number>`
  coalesce(${despesasTable.dieselRs},0)
  +coalesce(${despesasTable.das},0)
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

/** Where clause for abastecimentosTable (date column: data, fleet column: placa).
 *  ALWAYS include in expense totals — abastecimentos.totalPago is a real expense
 *  per the LUCRO spreadsheet formula. */
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
