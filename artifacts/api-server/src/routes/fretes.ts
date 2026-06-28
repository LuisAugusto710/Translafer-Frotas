import { Router } from "express";
import { db, fretesTable } from "@workspace/db";
import { eq, and, gte, lte, or, ilike, desc, sql } from "drizzle-orm";

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
    const like = `%${search}%`;
    conditions.push(or(
      ilike(fretesTable.frota,      like),
      ilike(fretesTable.cliente,    like),
      ilike(fretesTable.cidade,     like),
      ilike(fretesTable.origem,     like),
      ilike(fretesTable.cteNf,      like),
      ilike(fretesTable.transporte, like),
      ilike(fretesTable.transp,     like),
      ilike(fretesTable.obs,        like),
      sql`CAST(${fretesTable.dataCte}   AS TEXT) ILIKE ${like}`,
      sql`CAST(${fretesTable.dtaFrete}  AS TEXT) ILIKE ${like}`,
      sql`CAST(${fretesTable.vencimento} AS TEXT) ILIKE ${like}`,
      sql`CAST(${fretesTable.frete}     AS TEXT) ILIKE ${like}`,
      sql`CAST(${fretesTable.pedagio}   AS TEXT) ILIKE ${like}`,
      sql`CAST(${fretesTable.peso}      AS TEXT) ILIKE ${like}`,
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

router.post("/fretes", async (req, res) => {
  const { dataCte, dtaFrete, vencimento, frete, pedagio, peso, transporte, transp, cteNf, obs, ...rest } = req.body;

  const [row] = await db.insert(fretesTable).values({
    ...rest,
    dataCte: toDateStr(dataCte) ?? dataCte,
    dtaFrete: toDateStr(dtaFrete) ?? null,
    vencimento: toDateStr(vencimento) ?? null,
    frete: String(frete ?? 0),
    pedagio: String(pedagio ?? 0),
    peso: String(peso ?? 0),
    transporte: transporte ?? null,
    transp: transp ?? null,
    cteNf: cteNf ?? null,
    obs: obs ?? null,
  }).returning();

  res.status(201).json(fmt(row));
});

router.post("/fretes/bulk", async (req, res) => {
  const { fretes } = req.body as { fretes: Record<string, unknown>[] };
  if (!fretes?.length) { res.status(201).json({ created: 0, fretes: [] }); return; }

  const values = fretes.map(({ dataCte, dtaFrete, vencimento, frete, pedagio, peso, transporte, transp, cteNf, obs, ...rest }) => ({
    ...rest as Record<string, unknown>,
    dataCte: toDateStr(dataCte) ?? String(dataCte),
    dtaFrete: toDateStr(dtaFrete) ?? null,
    vencimento: toDateStr(vencimento) ?? null,
    frete: String(frete ?? 0),
    pedagio: String(pedagio ?? 0),
    peso: String(peso ?? 0),
    transporte: (transporte as string) ?? null,
    transp: (transp as string) ?? null,
    cteNf: (cteNf as string) ?? null,
    obs: (obs as string) ?? null,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inserted = await db.insert(fretesTable).values(values as any).returning();
  res.status(201).json({ created: inserted.length, fretes: inserted.map(fmt) });
});

router.get("/fretes/:id", async (req, res) => {
  const [row] = await db.select().from(fretesTable).where(eq(fretesTable.id, Number(req.params.id)));
  if (!row) { res.status(404).json({ error: "Não encontrado" }); return; }
  res.json(fmt(row));
});

router.put("/fretes/:id", async (req, res) => {
  const { dataCte, dtaFrete, vencimento, frete, pedagio, peso, ...rest } = req.body;
  const update: Record<string, unknown> = { ...rest, updatedAt: new Date() };
  if (dataCte !== undefined) update.dataCte = toDateStr(dataCte) ?? dataCte;
  if (dtaFrete !== undefined) update.dtaFrete = toDateStr(dtaFrete) ?? null;
  if (vencimento !== undefined) update.vencimento = toDateStr(vencimento) ?? null;
  if (frete !== undefined) update.frete = String(frete);
  if (pedagio !== undefined) update.pedagio = String(pedagio);
  if (peso !== undefined) update.peso = String(peso);

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
  }).from(fretesTable).groupBy(fretesTable.frota).orderBy(desc(sql`sum(${fretesTable.frete})`));

  res.json(result.map(r => ({
    frota: r.frota,
    totalFretes: Number(r.totalFretes),
    totalFrete: Number(r.totalFrete ?? 0),
    totalPedagio: Number(r.totalPedagio ?? 0),
    totalGeral: Number(r.totalFrete ?? 0) + Number(r.totalPedagio ?? 0),
  })));
});

export default router;
