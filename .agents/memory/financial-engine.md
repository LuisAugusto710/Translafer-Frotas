---
name: Centralized Financial Engine
description: Canonical financial calculation rules per business owner's explicit definition. dieselRs is informational — NEVER in expense totals.
---

# Canonical Financial Calculation Rules

## Single Source of Truth
`artifacts/api-server/src/lib/financial.ts`

## Canonical Formulas
- **Gross Revenue** = `sum(despesasTable.frete)` — daily operational frete
- **Total Expenses** = `sum(abastecimentosTable.totalPago)` + `sum(outrasDespesasSql)`
- **Net Profit**    = Gross Revenue − Total Expenses
- **Margin (%)**    = (Net Profit / Gross Revenue) × 100

## Critical Diesel Rule
| Field | What it is | Used in financials? |
|-------|-----------|---------------------|
| `despesasTable.dieselRs` | Estimated fuel consumed per trip (km × rate) | **NO — informational only** |
| `abastecimentosTable.totalPago` | Actual fuel purchase from pump (Diesel page) | **YES — always included** |

Including `dieselRs` in expenses = double-counting diesel. NEVER do it.

## outrasDespesasSql (exported from financial.ts)
Sum of all expense columns from despesasTable **EXCEPT dieselRs**:
DAS, Motorista, Almoço, Ajudante, Pedágio, Unimed, Seguro, Gasto, Rastreador, INSS, Escritório, IPVA, Bsoft, trocaOleoParcela

## Revenue Source Distinction
- `despesasTable.frete` = daily operational revenue (P&L, matches LUCRO spreadsheet)
- `fretesTable.frete`   = formal CTE/invoice records (trip count, receivables, rankings — separate system)

## Every Expense Endpoint Must
1. Query `sum(outrasDespesasSql)` from despesasTable with `despWhere`
2. Query `sum(abastecimentosTable.totalPago)` from abastecimentosTable with `abastWhere`
3. `totalExpenses = totalAbast + totalOutrasCustos`
4. `lucro = revenue - totalExpenses`

## Exports from financial.ts
- `outrasDespesasSql` — SQL sum of expense columns excluding dieselRs
- `OUTRAS_DESPESAS_CATEGORIAS` — ordered list of other expense categories (no diesel)
- `DESPESA_CATEGORIAS` — alias for backward compat, same as above
- `trocaOleoParsed` — parses trocaOleoParcela text field to numeric
- `freteWhere / despWhere / abastWhere` — filter builders

## History
- v1 (wrong): `despesaCustosSql` (includes dieselRs) + `abastecimentos` → double-counted diesel
- v2 (wrong): `despesaCustosSql` (includes dieselRs) only → missing real diesel expense
- v3 (current, correct): `outrasDespesasSql` (no dieselRs) + `abastecimentos` → diesel counted once, correctly
