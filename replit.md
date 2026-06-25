# Fleet Revenue Manager

A professional transportation fleet revenue management system for logging trip data and visualizing business performance.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/fleet-revenue run dev` — run the frontend (port 25656)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Recharts, shadcn/ui, next-themes, xlsx
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for all API contracts)
- `lib/db/src/schema/trips.ts` — Drizzle schema for the trips table
- `artifacts/api-server/src/routes/trips.ts` — Trip CRUD routes
- `artifacts/api-server/src/routes/dashboard.ts` — Dashboard analytics routes
- `artifacts/fleet-revenue/src/` — React frontend (data entry table + analytics dashboard)

## Architecture decisions

- OpenAPI-first: spec drives both Zod server validation and React Query client hooks via Orval codegen
- Date fields stored as strings in PostgreSQL date columns; Orval parses them as Date objects so explicit conversion to ISO strings is needed in routes
- Numeric columns (revenue, fuel, expenses) stored as `numeric(12,2)` strings in Postgres, converted to `Number` in API responses
- Dashboard aggregations use raw SQL via Drizzle's `sql` template tag for GROUP BY and date_trunc queries
- All period-based queries use `date_trunc` with allowlisted period strings to prevent SQL injection

## Product

- **Data Entry tab**: Spreadsheet-like table for logging trips (date, truck, driver, customer, route, revenue, costs). Add/edit/delete rows, search/filter, export to CSV and Excel.
- **Dashboard tab**: KPI cards (gross revenue, expenses, net profit, margin), revenue charts by truck and over time, expenses vs revenue comparison, annual performance metrics.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After any schema or route changes, restart the API Server workflow to rebuild (it runs esbuild before starting)
- After OpenAPI spec changes, run codegen before touching frontend code
- `xlsx` package is installed in `@workspace/fleet-revenue` for Excel export

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
