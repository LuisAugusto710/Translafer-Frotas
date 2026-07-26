/**
 * Centralized Financial Calculation Engine
 *
 * This is the SINGLE source of truth for all financial formulas in the application.
 *
 * ── Canonical rules ───────────────────────────────────────────────────────────
 *
 *   Revenue    = fretesTable.frete + fretesTable.pedagio
 *
 *   Expenses   = sum(despesaCustosSql) from despesasTable ONLY
 *                ↳ This already includes dieselRs (diesel entered per daily record)
 *
 *   Net Profit = Revenue - Expenses
 *
 * ── Diesel — one source, counted once ────────────────────────────────────────
 *
 *   despesasTable.dieselRs is one of the 14 cost columns summed by despesaCustosSql.
 *   It represents the diesel cost entered per daily expense record.
 *
 *   abastecimentosTable is a SEPARATE fuel-refueling tracking table.
 *   Its totalPago is used as a METRIC (liters, efficiency, avg price) — NOT as an
 *   additional expense. Adding it to expenses would double-count diesel.
 *
 *   NEVER add abastecimentosTable.totalPago to any expense total.
 *
 * ── Verification ──────────────────────────────────────────────────────────────
 *
 *   despesasTable row → totalDespesa ≈ R$8,494.17 → matches Excel R$8,491.59 ✓
 *   Old dashboard added abastecimentos diesel (R$2,144.44) → showed R$10,638.61 ✗
 *   Correct dashboard: R$8,494.17 (despesaCustosSql only) ✓
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
// abastecimentosTable is NOT in this list — it is a metric, not an expense category.
export const DESPESA_CATEGORIAS: Array<{ label: string; col: AnyPgColumn }> = [
  { label: "Diesel",       col: despesasTable.dieselRs },   // diesel cost per daily record
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
// Sum of ALL 14 monetary cost columns from despesasTable (+ trocaOleoParcela).
// KM and DieselLt are metrics — excluded.
// dieselRs IS included — diesel is one of the 14 cost columns, counted here and NOWHERE ELSE.
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

/** Where clause for abastecimentosTable (date column: data).
 *  Use ONLY for fuel metrics (litros, efficiency, avg price) — NOT for expense totals. */
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
