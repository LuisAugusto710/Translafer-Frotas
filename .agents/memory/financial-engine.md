---
name: Centralized Financial Engine
description: Canonical financial calculation rules and diesel handling. Critical: abastecimentos.totalPago must NEVER be added to expenses.
---

# Canonical Financial Calculation Rules

## Single Source of Truth
`artifacts/api-server/src/lib/financial.ts`

## Canonical Formulas
- **Revenue**    = `fretesTable.frete + fretesTable.pedagio`
- **Expenses**   = `sum(despesaCustosSql)` from `despesasTable` **ONLY**
- **Net Profit** = Revenue − Expenses

## Diesel — Counted Once, in despesasTable
- `despesasTable.dieselRs` is one of the 14 cost columns summed by `despesaCustosSql`
- **`abastecimentosTable.totalPago` is a FUEL METRIC, NOT an expense**
- Adding `abastecimentosTable.totalPago` to any expense total = double-counting diesel

## Root Cause of the Historical Bug
`/dashboard/despesas-resumo` was adding `abastecimentosTable.totalPago` ON TOP of `despesaCustosSql`, which already includes `dieselRs`.
- DB row `totalDespesa` for frota 4100 ≈ R$8,494 → matches Excel R$8,491 ✓
- Old dashboard: R$8,494 + R$2,144 (abastecimentos) = R$10,638 ✗
- Correct dashboard: R$8,494 (despesaCustosSql only) ✓

## What NEVER to Do
- Never add `abastecimentosTable.totalPago` to any expense total
- Never use `abastecimentosTable` for P&L — only for fuel metrics (liters, km/l, avg price)

## Exports from financial.ts
- `despesaCustosSql` — SQL sum of all 14 cost columns (includes dieselRs)
- `trocaOleoParsed` — parses `trocaOleoParcela` text to numeric
- `DESPESA_CATEGORIAS` — canonical ordered list of expense categories
- `freteWhere(df, dt, frota)` — filter for fretesTable
- `despWhere(df, dt, frota)` — filter for despesasTable
- `abastWhere(df, dt, frota)` — filter for abastecimentosTable (metrics only)

**Why:** Every endpoint must import from here. Adding a new dashboard section? Use `despesaCustosSql` only for expenses. `abastecimentosTable` is read-only metrics.
