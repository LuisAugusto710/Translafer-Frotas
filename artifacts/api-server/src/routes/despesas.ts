import { Router } from "express";
import { db, despesasTable } from "@workspace/db";
import { eq, and, gte, lte, or, ilike, desc, sql } from "drizzle-orm";

const router = Router();

// Cost columns that make up "total despesa". KM and Diesel (LT) are metrics, not costs.
const COST_FIELDS = [
  "dieselRs", "das", "motorista", "almoco", "ajudante", "pedagio",
  "unimed", "seguro", "gasto", "rastreador", "inss", "escritorio", "ipva", "bsoft",
] as const;

function toDateStr(v: unknown): string | undefined {
  if (!v) return undefined;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

function fmt(t: typeof despesasTable.$inferSelect) {
  const num: Record<string, number> = {};
  for (const k of [
    "frete", "km", "dieselLt", "dieselRs", "das", "motorista", "almoco", "ajudante",
    "pedagio", "unimed", "seguro", "gasto", "rastreador", "inss", "escritorio", "ipva", "bsoft", "lucro",
  ] as const) {
    num[k] = Number(t[k]);
  }
  const totalDespesa = COST_FIELDS.reduce((s, k) => s + num[k], 0);
  return {
    ...t,
    ...num,
    totalDespesa: Math.round(totalDespesa * 100) / 100,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

// Build numeric string values + computed lucro from a request payload.
function buildValues(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  const numericKeys = [
    "frete", "km", "dieselLt", "dieselRs", "das", "motorista", "almoco", "ajudante",
    "pedagio", "unimed", "seguro", "gasto", "rastreador", "inss", "escritorio", "ipva", "bsoft",
  ];
  for (const k of numericKeys) {
    if (body[k] !== undefined && body[k] !== null && body[k] !== "") {
      out[k] = String(body[k]);
    }
  }
  if (body.cidade !== undefined) out.cidade = body.cidade ?? "";
  if (body.motoristaNome !== undefined) out.motoristaNome = body.motoristaNome ?? "";
  if (body.ajudanteNome !== undefined) out.ajudanteNome = body.ajudanteNome ?? "";
  if (body.frota !== undefined) out.frota = body.frota;
  if (body.obs !== undefined) out.obs = body.obs ?? null;
  if (body.data !== undefined) out.data = toDateStr(body.data) ?? body.data;
  return out;
}

// lucro = frete - sum(cost fields). Reads the merged record (existing + updates).
function computeLucro(record: Record<string, unknown>): string {
  const n = (v: unknown) => Number(v ?? 0);
  const custos = COST_FIELDS.reduce((s, k) => s + n(record[k]), 0);
  return String(Math.round((n(record.frete) - custos) * 100) / 100);
}

router.get("/despesas", async (req, res) => {
  const { frota, cidade, search, limit = "1000", offset = "0", dateFrom, dateTo } = req.query as Record<string, string>;

  const conditions = [];
  if (frota) conditions.push(ilike(despesasTable.frota, `%${frota}%`));
  if (cidade) conditions.push(ilike(despesasTable.cidade, `%${cidade}%`));
  if (dateFrom) conditions.push(gte(despesasTable.data, toDateStr(dateFrom)!));
  if (dateTo) conditions.push(lte(despesasTable.data, toDateStr(dateTo)!));
  if (search) {
    const like = `%${search}%`;
    conditions.push(or(
      ilike(despesasTable.frota, like),
      ilike(despesasTable.cidade, like),
      ilike(despesasTable.motoristaNome, like),
      ilike(despesasTable.ajudanteNome, like),
      ilike(despesasTable.obs, like),
      sql`CAST(${despesasTable.data} AS TEXT) ILIKE ${like}`,
      sql`CAST(${despesasTable.frete} AS TEXT) ILIKE ${like}`,
      sql`CAST(${despesasTable.dieselRs} AS TEXT) ILIKE ${like}`,
      sql`CAST(${despesasTable.lucro} AS TEXT) ILIKE ${like}`,
      sql`CAST(${despesasTable.km} AS TEXT) ILIKE ${like}`,
    )!);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [despesas, countResult] = await Promise.all([
    db.select().from(despesasTable).where(where)
      .orderBy(desc(despesasTable.data), desc(despesasTable.createdAt))
      .limit(Number(limit)).offset(Number(offset)),
    db.select({ count: sql<number>`count(*)` }).from(despesasTable).where(where),
  ]);

  res.json({ despesas: despesas.map(fmt), total: Number(countResult[0].count) });
});

router.post("/despesas", async (req, res) => {
  const values = buildValues(req.body);
  values.lucro = computeLucro(values);

  const [row] = await db.insert(despesasTable)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .values(values as any)
    .returning();

  res.status(201).json(fmt(row));
});

router.post("/despesas/bulk", async (req, res) => {
  const { despesas } = req.body as { despesas: Record<string, unknown>[] };
  if (!despesas?.length) { res.status(201).json({ created: 0, despesas: [] }); return; }

  const values = despesas.map((d) => {
    const v = buildValues(d);
    v.lucro = computeLucro(v);
    return v;
  });

  const inserted = await db.insert(despesasTable)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .values(values as any)
    .onConflictDoNothing({ target: [despesasTable.frota, despesasTable.data] })
    .returning();

  res.status(201).json({ created: inserted.length, despesas: inserted.map(fmt) });
});

router.get("/despesas/:id", async (req, res) => {
  const [row] = await db.select().from(despesasTable).where(eq(despesasTable.id, Number(req.params.id)));
  if (!row) { res.status(404).json({ error: "Não encontrado" }); return; }
  res.json(fmt(row));
});

router.put("/despesas/:id", async (req, res) => {
  const [existing] = await db.select().from(despesasTable).where(eq(despesasTable.id, Number(req.params.id)));
  if (!existing) { res.status(404).json({ error: "Não encontrado" }); return; }

  const update = buildValues(req.body);
  // Merge existing + updates to recompute lucro from the resulting record.
  const merged = { ...existing, ...update };
  update.lucro = computeLucro(merged);
  update.updatedAt = new Date();

  const [row] = await db.update(despesasTable)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .set(update as any)
    .where(eq(despesasTable.id, Number(req.params.id)))
    .returning();
  res.json(fmt(row));
});

router.delete("/despesas/:id", async (req, res) => {
  await db.delete(despesasTable).where(eq(despesasTable.id, Number(req.params.id)));
  res.status(204).send();
});

export default router;
