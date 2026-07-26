/**
 * Centralized Financial Calculation Engine
 *
 * Single source of truth for all financial formulas in the application.
 *
 * ── Business Rules ────────────────────────────────────────────────────────────
 *
 *   Gross Revenue = sum(despesasTable.frete)
 *
 *   Total Expenses = sum(abastecimentosTable.totalPago)   ← Diesel page (actual purchases)
 *                  + sum(outrasDespesasSql)               ← Expenses page, EXCLUDING dieselRs
 *
 *   Net Profit    = Gross Revenue − Total Expenses
 *
 *   Margin (%)    = (Net Profit / Gross Revenue) × 100
 *
 * ── Diesel Rule (critical) ────────────────────────────────────────────────────
 *
 *   despesasTable.dieselRs  = informational field only — shows estimated fuel
 *                             consumed per trip (km × rate). NOT a payment made
 *                             by the company. NEVER included in expense totals.
 *
 *   abastecimentosTable.totalPago = real diesel expense — money actually paid
 *                                   at the pump. Always included in expenses.
 *
 *   Including dieselRs in expenses would double-count diesel (once as estimated
 *   per-trip, once as actual purchase). Only abastecimentos counts.
 *
 * ── Revenue Source ────────────────────────────────────────────────────────────
 *
 *   despesasTable.frete = daily operational revenue (LUCRO spreadsheet FRETE column)
 *   fretesTable.frete   = formal CTE/invoice records (separate billing system)
 *
 *   The P&L calculation uses despesasTable.frete.
 *   fretesTable is used for CTE/invoice tracking only (trip count, receivables).
 */

import { abastecimentosTable, despesasTable, fretesTable } from "@workspace/db";
import { gte, lte, and, eq, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

// ── trocaOleoParcela parsing ──────────────────────────────────────────────────
// Stored as text ("100,00" or "100.00") — parse to numeric.
export const trocaOleoParsed = sql<number>`COALESCE(NULLIF(REPLACE(REPLACE(trim(${despesasTable.trocaOleoParcela}::text), ',', '.'), ' ', ''), '')::numeric, 0)`;

// ── Other Expenses SQL (EXCLUDES dieselRs) ────────────────────────────────────
// Sum of all monetary expense columns from despesasTable, EXCEPT dieselRs.
// dieselRs is informational (fuel consumed per trip) — not money spent.
// abastecimentosTable.totalPago (actual fuel purchases) is added separately per endpoint.
export const outrasDespesasSql = sql<number>`
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

// ── Expense category list (for breakdown displays) ────────────────────────────
// These are the "Other Expenses" categories — all EXCLUDING diesel.
// "Combustível" (abastecimentos) is appended separately in each endpoint.
export const OUTRAS_DESPESAS_CATEGORIAS: Array<{ label: string; col: AnyPgColumn }> = [
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

// Keep legacy export alias so any external code importing DESPESA_CATEGORIAS still compiles.
// New code should use OUTRAS_DESPESAS_CATEGORIAS.
export const DESPESA_CATEGORIAS = OUTRAS_DESPESAS_CATEGORIAS;

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

/** Where clause for abastecimentosTable (date: data, fleet: placa).
 *  Always included in expense totals — this is the actual diesel payment. */
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
