import { Router } from "express";
import { db, fretesTable } from "@workspace/db";
import { eq, and, gte, lte, or, ilike, desc, sql } from "drizzle-orm";
import { toTitleCase, toTitleCaseOrNull } from "../normalize";

const router = Router();

function toDateStr(v: unknown): string | undefined {
  if (!v) return undefined;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

function fmt(t: typeof fretesTable.$inferSelect) {
  const frete = Number(t.frete);
  const pedagio = Number(t.pedagio);
  return {
    ...t,
    peso: Number(t.peso),
    frete,
    pedagio,
    totalFrete: frete + pedagio,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

router.get("/fretes", async (req, res) => {
  const { frota, cliente, origem, search, limit = "1000", offset = "0", dateFrom, dateTo } = req.query as Record<string, string>;

  const conditions = [];
  if (frota) conditions.push(ilike(fretesTable.frota, `%${frota}%`));
  if (cliente) conditions.push(ilike(fretesTable.cliente, `%${cliente}%`));
  if (origem) conditions.push(ilike(fretesTable.origem, `%${origem}%`));
  if (dateFrom) conditions.push(gte(fretesTable.dataCte, toDateStr(dateFrom)!));
  if (dateTo) conditions.push(lte(fretesTable.dataCte, toDateStr(dateTo)!));
  if (search) {
    const like = `%${search.trim()}%`;
    // Helper: emit all date-format variants for a date column so users can
    // search 2026-07-01, 01/07/2026, 01-07-2026, 1/7/2026, 07/2026, Jul, July
    const dateClauses = (
      col:
        | typeof fretesTable.dataCte
        | typeof fretesTable.dtaFrete
        | typeof fretesTable.vencimento,
    ) => [
      sql`CAST(${col} AS TEXT)              ILIKE ${like}`,
      sql`TO_CHAR(${col}, 'DD/MM/YYYY')     ILIKE ${like}`,
      sql`TO_CHAR(${col}, 'DD-MM-YYYY')     ILIKE ${like}`,
      sql`TO_CHAR(${col}, 'FMDD/FMMM/YYYY') ILIKE ${like}`,
      sql`TO_CHAR(${col}, 'MM/YYYY')        ILIKE ${like}`,
      sql`TO_CHAR(${col}, 'Mon')            ILIKE ${like}`,
      sql`TO_CHAR(${col}, 'Month')          ILIKE ${like}`,
    ];
    conditions.push(or(
      ilike(fretesTable.frota,      like),
      ilike(fretesTable.cliente,    like),
      ilike(fretesTable.cidade,     like),
      ilike(fretesTable.origem,     like),
      ilike(fretesTable.cteNf,      like),
      ilike(fretesTable.transporte, like),
      ilike(fretesTable.transp,     like),
      ilike(fretesTable.obs,        like),
      sql`CAST(${fretesTable.frete}   AS TEXT) ILIKE ${like}`,
      sql`CAST(${fretesTable.pedagio} AS TEXT) ILIKE ${like}`,
      sql`CAST(${fretesTable.peso}    AS TEXT) ILIKE ${like}`,
      ...dateClauses(fretesTable.dataCte),
      ...dateClauses(fretesTable.dtaFrete),
      ...dateClauses(fretesTable.vencimento),
    )!);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [fretes, countResult] = await Promise.all([
    db.select().from(fretesTable).where(where)
      .orderBy(desc(fretesTable.dataCte), desc(fretesTable.createdAt))
      .limit(Number(limit)).offset(Number(offset)),
    db.select({ count: sql<number>`count(*)` }).from(fretesTable).where(where),
  ]);

  res.json({ fretes: fretes.map(fmt), total: Number(countResult[0].count) });
});

function normalizeFrete(body: Record<string, unknown>): Record<string, unknown> {
  const { dataCte, dtaFrete, vencimento, frete, pedagio, peso, transporte, transp, cteNf, obs, origem, cliente, cidade, ...rest } = body;
  return {
    ...rest,
    origem:     toTitleCase(origem as string | null),
    cliente:    toTitleCase(cliente as string | null),
    cidade:     toTitleCase(cidade as string | null),
    dataCte:    toDateStr(dataCte) ?? String(dataCte),
    dtaFrete:   toDateStr(dtaFrete) ?? null,
    vencimento: toDateStr(vencimento) ?? null,
    frete:      String(frete ?? 0),
    pedagio:    String(pedagio ?? 0),
    peso:       String(peso ?? 0),
    transporte: toTitleCaseOrNull(transporte as string | null),
    transp:     toTitleCaseOrNull(transp as string | null),
    cteNf:      (cteNf as string) ?? null,
    obs:        toTitleCaseOrNull(obs as string | null),
  };
}

/**
 * Extract rows from Drizzle execute() regardless of driver.
 * postgres-js returns an array; node-postgres returns { rows: [...] }.
 */
function getExecuteRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result as unknown[];
  const r = result as Record<string, unknown> | null;
  return Array.isArray(r?.rows) ? (r!.rows as unknown[]) : [];
}

router.post("/fretes", async (req, res) => {
  const normalized = normalizeFrete(req.body);

  if (normalized.cteNf) {
    // Uniqueness is scoped per carrier: same CTE number is valid for different carriers
    const dupeConditions: ReturnType<typeof eq>[] = [
      eq(fretesTable.cteNf, String(normalized.cteNf)),
    ];
    if (normalized.transp) {
      dupeConditions.push(eq(fretesTable.transp, String(normalized.transp)));
    }
    const [existing] = await db.select({ id: fretesTable.id })
      .from(fretesTable)
      .where(and(...dupeConditions))
      .limit(1);
    if (existing) {
      const scope = normalized.transp ? ` para ${String(normalized.transp)}` : "";
      res.status(409).json({ error: `CTE/NF já existe${scope}. Use outro número.` });
      return;
    }
  }

  const [row] = await db.insert(fretesTable)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .values(normalized as any)
    .returning();
  res.status(201).json(fmt(row));
});

router.post("/fretes/bulk", async (req, res) => {
  const { fretes } = req.body as { fretes: Record<string, unknown>[] };
  if (!fretes?.length) { res.status(201).json({ created: 0, fretes: [] }); return; }

  const values = fretes.map(normalizeFrete);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inserted = await db.insert(fretesTable).values(values as any).returning();
  res.status(201).json({ created: inserted.length, fretes: inserted.map(fmt) });
});

router.get("/fretes/next-cte", async (req, res) => {
  // Trim and normalise casing so "LAFER", "lafer", "Lafer" all resolve to the
  // same carrier sequence. ILIKE is a native Postgres case-insensitive string
  // comparison; no wildcards are used here so it behaves as an exact match
  // modulo case (and avoids a full table scan thanks to any functional index).
  const transp = req.query.transp ? String(req.query.transp).trim() : undefined;
  const where = transp ? ilike(fretesTable.transp, transp) : undefined;
  const [result] = await db.select({
    maxCte: sql<number>`COALESCE(MAX(CASE WHEN ${fretesTable.cteNf} ~ '^[0-9]+$' THEN CAST(${fretesTable.cteNf} AS INTEGER) ELSE 0 END), 0)`,
  }).from(fretesTable).where(where);
  res.json({ nextCte: Number(result.maxCte) + 1 });
});

router.get("/fretes/:id", async (req, res) => {
  const [row] = await db.select().from(fretesTable).where(eq(fretesTable.id, Number(req.params.id)));
  if (!row) { res.status(404).json({ error: "Não encontrado" }); return; }
  res.json(fmt(row));
});

router.put("/fretes/:id", async (req, res) => {
  const { dataCte, dtaFrete, vencimento, frete, pedagio, peso, origem, cliente, cidade, transporte, transp, obs, ...rest } = req.body;
  const update: Record<string, unknown> = { ...rest, updatedAt: new Date() };
  if (dataCte    !== undefined) update.dataCte    = toDateStr(dataCte) ?? dataCte;
  if (dtaFrete   !== undefined) update.dtaFrete   = toDateStr(dtaFrete) ?? null;
  if (vencimento !== undefined) update.vencimento = toDateStr(vencimento) ?? null;
  if (frete      !== undefined) update.frete      = String(frete);
  if (pedagio    !== undefined) update.pedagio    = String(pedagio);
  if (peso       !== undefined) update.peso       = String(peso);
  if (origem     !== undefined) update.origem     = toTitleCase(origem as string | null);
  if (cliente    !== undefined) update.cliente    = toTitleCase(cliente as string | null);
  if (cidade     !== undefined) update.cidade     = toTitleCase(cidade as string | null);
  if (transporte !== undefined) update.transporte = toTitleCaseOrNull(transporte as string | null);
  if (transp     !== undefined) update.transp     = toTitleCaseOrNull(transp as string | null);
  if (obs        !== undefined) update.obs        = toTitleCaseOrNull(obs as string | null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [row] = await db.update(fretesTable).set(update as any).where(eq(fretesTable.id, Number(req.params.id))).returning();
  if (!row) { res.status(404).json({ error: "Não encontrado" }); return; }
  res.json(fmt(row));
});

router.delete("/fretes/:id", async (req, res) => {
  await db.delete(fretesTable).where(eq(fretesTable.id, Number(req.params.id)));
  res.status(204).send();
});

router.get("/frotas", async (req, res) => {
  const result = await db.select({
    frota: fretesTable.frota,
    totalFretes: sql<number>`count(*)`,
    totalFrete: sql<number>`sum(${fretesTable.frete})`,
    totalPedagio: sql<number>`sum(${fretesTable.pedagio})`,
  }).from(fretesTable).groupBy(fretesTable.frota).orderBy(fretesTable.frota);

  res.json(result.map(r => ({
    frota: r.frota,
    totalFretes: Number(r.totalFretes),
    totalFrete: Number(r.totalFrete ?? 0),
    totalPedagio: Number(r.totalPedagio ?? 0),
    totalGeral: Number(r.totalFrete ?? 0) + Number(r.totalPedagio ?? 0),
  })));
});

export default router;
