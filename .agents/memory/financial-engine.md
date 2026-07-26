---
name: Centralized Financial Engine
description: Documents the canonical financial calculation rules and where they live, including the root cause of the previous dashboard inconsistency.
---

# Canonical Financial Calculation Rules

## Single Source of Truth
All financial calculations come from `artifacts/api-server/src/lib/financial.ts`.

## Canonical Formulas
- **Revenue** = `fretesTable.frete + fretesTable.pedagio`
- **Expenses** = `sum(despesaCustosSql)` + `sum(abastecimentosTable.totalPago)`
  - `despesaCustosSql` covers 14 cost columns from despesasTable (including `dieselRs`)
  - `abastecimentosTable.totalPago` is the fuel refueling cost (separate table)
  - **Both must always be included together** — never one without the other
- **Net Profit** = Revenue - Expenses

## Diesel — Two Sources, Both Count
- `despesasTable.dieselRs` — manually entered diesel cost per daily record
- `abastecimentosTable.totalPago` — detailed per-refueling fuel cost
- Both are legitimate costs; the sum is total diesel expense

## Why the Inconsistency Existed
`/dashboard/fleet-performance` and `/dashboard/por-transportadora` only used `despesaCustosSql` from despesasTable, missing `abastecimentosTable.totalPago`. The difference was exactly equal to diesel from abastecimentos.

## What to Never Do
- Never compute total expenses using only `despesaCustosSql` — always add `abastecimentosTable.totalPago`
- Never add abastecimentos diesel at the summary level without also adding it at the per-frota level

## Helper exports from financial.ts
- `despesaCustosSql` — SQL fragment for 14-column cost sum
- `trocaOleoParsed` — parses trocaOleoParcela text column to numeric
- `DESPESA_CATEGORIAS` — canonical ordered list of all expense categories
- `freteWhere(dateFrom, dateTo, frota)` — where clause for fretesTable
- `despWhere(dateFrom, dateTo, frota)` — where clause for despesasTable  
- `abastWhere(dateFrom, dateTo, frota)` — where clause for abastecimentosTable
- `getDieselAbastPerFrota(dateFrom, dateTo, frota)` — returns `Record<frota, diesel_cost>`
- `getTotalDieselAbast(dateFrom, dateTo, frota)` — returns total diesel from abastecimentos

**Why:** Ensures every endpoint uses the same formula. Adding a new endpoint? Always call `getDieselAbastPerFrota` and add the result to per-frota costs.
