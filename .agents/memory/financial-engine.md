---
name: Centralized Financial Engine
description: Canonical financial calculation rules verified against LUCRO Excel spreadsheet. Both diesel components must be counted — removing either breaks the formula.
---

# Canonical Financial Calculation Rules

## Single Source of Truth
`artifacts/api-server/src/lib/financial.ts`

## Canonical Formulas (verified against Excel LUCRO spreadsheet)
- **Revenue**    = `sum(despesasTable.frete)` — daily operational frete column
- **Expenses**   = `sum(despesaCustosSql)` + `sum(abastecimentosTable.totalPago)`
- **Net Profit** = Revenue − Expenses

## Revenue Source Distinction
- `despesasTable.frete` = daily operational revenue — matches LUCRO spreadsheet's FRETE column
- `fretesTable.frete + pedagio` = formal CTE/invoice records — a DIFFERENT dataset

For P&L matching the LUCRO Excel, always use `despesasTable.frete` as revenue.
`fretesTable` is for CTE/invoice tracking (fleet-performance, por-transportadora) and may differ.

## Diesel — Two Legitimate Sources, Both Are Real Costs
- `despesasTable.dieselRs` = per-trip estimated diesel (km × rate) — included in despesaCustosSql
- `abastecimentosTable.totalPago` = actual fuel purchases from the pump

**BOTH must be counted in expenses.** The LUCRO Excel explicitly subtracts both from revenue.
Removing abastecimentos = under-counting expenses, artificially inflating profit.

## Verified Against Excel (June 2026)
| Frota | Revenue | Column Expenses | Abast Fuel | Total Expenses | Profit | Excel Match |
|-------|---------|----------------|-----------|---------------|--------|-------------|
| 4100 | R$18,232.50 | R$9,238.56 | R$2,259.90 | R$11,498.46 | R$6,734.04 | ✓ (R$6,734.03) |
| 4104 | R$5,293.76 | R$3,782.13 | R$745.84 | R$4,527.97 | R$765.79 | ✓ (R$765.80) |

## History of Wrong Fix
A previous session removed `abastecimentosTable.totalPago` from expenses claiming it was "double-counting diesel."
This was WRONG — the Excel spreadsheet confirms both are separate, real costs.
The correct direction: `column_expenses + abastecimentos` = Excel implied expenses (within R$0.01).

## Exports from financial.ts
- `despesaCustosSql` — SQL sum of 14 cost columns from despesasTable (includes dieselRs)
- `trocaOleoParsed` — parses `trocaOleoParcela` text to numeric
- `DESPESA_CATEGORIAS` — canonical ordered list of expense categories
- `freteWhere(df, dt, frota)` — filter for fretesTable
- `despWhere(df, dt, frota)` — filter for despesasTable
- `abastWhere(df, dt, frota)` — filter for abastecimentosTable

## What MUST happen in every expense endpoint
1. Query `sum(despesaCustosSql)` from despesasTable with `despWhere`
2. Query `sum(abastecimentosTable.totalPago)` from abastecimentosTable with `abastWhere`
3. `totalExpenses = colCustos + abast`
4. `lucro = revenue - totalExpenses`

**Why:** Skipping step 2 means the application under-counts expenses by the diesel fuel purchase total,
inflating profit vs the LUCRO spreadsheet. This was confirmed with exact numerical verification.
