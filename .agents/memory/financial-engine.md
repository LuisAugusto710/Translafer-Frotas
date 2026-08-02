---
name: Centralized Financial Engine
description: Canonical expense formula and centralized financial.ts library rules
---

# Canonical Financial Calculation Rules

## Single Source of Truth
All financial calculations come from `artifacts/api-server/src/lib/financial.ts`.

## Canonical Formulas
- **Revenue** = `fretesTable.frete + fretesTable.pedagio`
- **Expenses** = `sum(despesaCustosSql)` + `sum(abastecimentosTable.totalPago)` + `sum(manutencoesTable.custo)`
  - `despesaCustosSql` covers 14 cost columns from despesasTable (including `dieselRs`)
  - `abastecimentosTable.totalPago` is the fuel refueling cost (separate table)
  - `manutencoesTable.custo` is maintenance cost (separate table)
  - **All three must always be included together** — never a subset
- **Net Profit** = Revenue - Expenses

## Diesel — Two Sources, Both Count
- `despesasTable.dieselRs` — manually entered diesel cost per daily record
- `abastecimentosTable.totalPago` — detailed per-refueling fuel cost
- Both are legitimate costs; the sum is total diesel expense

## Maintenance Costs
- `manutencoesTable.custo` — maintenance cost per job
- Date column: `dataManutencao` (not `data`)
- Frota column: `frota` (same name as despesas)
- Must be included in every `totalCustos` calculation alongside diesel

## What to Never Do
- Never compute total expenses using only `despesaCustosSql`
- Never add abastecimentos diesel at the summary level without also adding it at the per-frota level
- Never omit `manutencoesTable.custo` from any expense total

## Helper exports from financial.ts
- `despesaCustosSql` — SQL fragment for 14-column cost sum
- `trocaOleoParsed` — parses trocaOleoParcela text column to numeric
- `DESPESA_CATEGORIAS` — canonical ordered list of all expense categories
- `freteWhere(dateFrom, dateTo, frota)` — where clause for fretesTable
- `despWhere(dateFrom, dateTo, frota)` — where clause for despesasTable
- `abastWhere(dateFrom, dateTo, frota)` — where clause for abastecimentosTable
- `manutWhere(dateFrom, dateTo, frota)` — where clause for manutencoesTable
- `getDieselAbastPerFrota(dateFrom, dateTo, frota)` — returns `Record<frota, diesel_cost>`
- `getTotalDieselAbast(dateFrom, dateTo, frota)` — returns total diesel from abastecimentos
- `getTotalManutencaoCost(dateFrom, dateTo, frota)` — returns total maintenance cost
- `getManutencaoCostPerFrota(dateFrom, dateTo, frota)` — returns `Record<frota, manut_cost>`
- `getManutencaoCostPerMonth(dateFrom, dateTo, frota)` — returns `Record<"YYYY-MM", manut_cost>`

## Transporte Auto-Number
- Sequential `transporte` field starts at 5355256 from July 2026.
- Backend: `GET /fretes/next-transporte` returns `{ nextTransporte }` = MAX(existing numeric transporte) + 1, floored at 5355256.
- Frontend: `useGetNextTransporte` hook auto-fills on new frete, same pattern as `useGetNextCte`. `transporteManuallyEdited` ref prevents overwrite when user types.

## Dynamic Year Filter
- `GET /dashboard/available-years` returns `{ years: number[] }` — UNION of distinct years from fretes, despesas, manutencoes.
- Dashboard replaces static `YEARS` array with `useGetAvailableYears` hook; falls back to `[currentYear]` if empty.

## Period Filter
- `PeriodMode = "year" | "semester" | "quarter" | "month" | "custom"`.
- `computePeriodDates(mode, year, subValue)` utility returns `{ dateFrom, dateTo }`.
- `subValue` semantics: month = 0-based index; quarter = 1–4; semester = 1–2; year/custom = "".
- Custom mode shows manual date inputs; other modes hide them.

**Why:** Ensures every endpoint uses the same formula. Adding a new endpoint? Always call all three per-frota helpers and merge them into the cost map.
