import { Router } from "express";
import { db, despesasTable } from "@workspace/db";
import { eq, and, gte, lte, or, ilike, desc, sql } from "drizzle-orm";
import { toTitleCase, toTitleCaseOrNull } from "../normalize";

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
    id: t.id,
    data: t.data,
    frota: t.frota,
    cidade: t.cidade,
    motoristaNome: t.motoristaNome,
    ajudanteNome: t.ajudanteNome,
    frete: num.frete,
    km: num.km,
    dieselLt: num.dieselLt,
    dieselRs: num.dieselRs,
    das: num.das,
    motorista: num.motorista,
    almoco: num.almoco,
    ajudante: num.ajudante,
    pedagio: num.pedagio,
    unimed: num.unimed,
    seguro: num.seguro,
    gasto: num.gasto,
    rastreador: num.rastreador,
    inss: num.inss,
    escritorio: num.escritorio,
    ipva: num.ipva,
    bsoft: num.bsoft,
    trocaOleoParcela: t.trocaOleoParcela,
    totalDespesa: Math.round(totalDespesa * 100) / 100,
    lucro: num.lucro,
    obs: t.obs,
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
  if (body.cidade !== undefined) out.cidade = toTitleCase(body.cidade as string | null);
  if (body.motoristaNome !== undefined) out.motoristaNome = toTitleCase(body.motoristaNome as string | null);
  if (body.ajudanteNome !== undefined) out.ajudanteNome = toTitleCase(body.ajudanteNome as string | null);
  if (body.trocaOleoParcela !== undefined) out.trocaOleoParcela = toTitleCase(body.trocaOleoParcela as string | null);
  if (body.frota !== undefined) out.frota = (body.frota as string)?.trim() || null;
  if (body.obs !== undefined) out.obs = toTitleCaseOrNull(body.obs as string | null);
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
    const like = `%${search.trim()}%`;
    conditions.push(or(
      ilike(despesasTable.frota,           like),
      ilike(despesasTable.cidade,          like),
      ilike(despesasTable.motoristaNome,   like),
      ilike(despesasTable.ajudanteNome,    like),
      ilike(despesasTable.trocaOleoParcela, like),
      ilike(despesasTable.obs,             like),
      sql`CAST(${despesasTable.frete}    AS TEXT) ILIKE ${like}`,
      sql`CAST(${despesasTable.dieselRs} AS TEXT) ILIKE ${like}`,
      sql`CAST(${despesasTable.lucro}    AS TEXT) ILIKE ${like}`,
      sql`CAST(${despesasTable.km}       AS TEXT) ILIKE ${like}`,
      // Date variants: ISO (2026-07-01), BR (01/07/2026), dashes, short (1/7/2026),
      // month/year (07/2026), abbreviated month (Jul), full month name (July)
      sql`CAST(${despesasTable.data} AS TEXT)               ILIKE ${like}`,
      sql`TO_CHAR(${despesasTable.data}, 'DD/MM/YYYY')      ILIKE ${like}`,
      sql`TO_CHAR(${despesasTable.data}, 'DD-MM-YYYY')      ILIKE ${like}`,
      sql`TO_CHAR(${despesasTable.data}, 'FMDD/FMMM/YYYY')  ILIKE ${like}`,
      sql`TO_CHAR(${despesasTable.data}, 'MM/YYYY')         ILIKE ${like}`,
      sql`TO_CHAR(${despesasTable.data}, 'Mon')             ILIKE ${like}`,
      sql`TO_CHAR(${despesasTable.data}, 'Month')           ILIKE ${like}`,
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
  if (!values.data) { res.status(400).json({ error: "Campo obrigatório: Data" }); return; }
  values.lucro = computeLucro(values);

  try {
    const [row] = await db.insert(despesasTable)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .values(values as any)
      .returning();
    res.status(201).json(fmt(row));
  } catch (err: unknown) {
    const pgMsg = (err as any)?.cause?.message ?? (err as any)?.message ?? String(err);
    req.log.error({ err, pgMsg, body: req.body }, "Erro ao criar despesa");
    if (pgMsg.includes("unique") || pgMsg.includes("duplicate")) {
      res.status(409).json({ error: "Já existe um registro para esta Frota e Data. Verifique os dados e tente novamente." });
    } else {
      res.status(500).json({ error: `Erro ao salvar: ${pgMsg}` });
    }
  }
});

// Fingerprint for exact-duplicate detection during bulk import.
// Two records are duplicates only when every meaningful field matches.
function despesaFingerprint(r: Record<string, unknown>): string {
  return [
    r.data, r.frota, r.cidade ?? "", r.motoristaNome ?? "", r.ajudanteNome ?? "",
    r.frete ?? "0", r.km ?? "0", r.dieselLt ?? "0", r.dieselRs ?? "0",
    r.das ?? "0", r.motorista ?? "0", r.almoco ?? "0", r.ajudante ?? "0",
    r.pedagio ?? "0", r.unimed ?? "0", r.seguro ?? "0", r.gasto ?? "0",
    r.rastreador ?? "0", r.inss ?? "0", r.escritorio ?? "0", r.ipva ?? "0",
    r.bsoft ?? "0",
  ].map(v => String(Number(v ?? 0) === 0 ? "0" : v)).join("|");
}

router.post("/despesas/bulk", async (req, res) => {
  const { despesas } = req.body as { despesas: Record<string, unknown>[] };
  if (!despesas?.length) { res.status(201).json({ created: 0, despesas: [] }); return; }

  const incoming = despesas.map((d) => {
    const v = buildValues(d);
    v.lucro = computeLucro(v);
    return v;
  });

  // Fetch existing records covering the same date range to detect true duplicates.
  const dates = incoming.map(v => String(v.data)).filter(Boolean).sort();
  const existing = await db.select().from(despesasTable)
    .where(and(gte(despesasTable.data, dates[0]), lte(despesasTable.data, dates[dates.length - 1])));

  const existingPrints = new Set(existing.map(r => despesaFingerprint(r as unknown as Record<string, unknown>)));

  // Deduplicate within the incoming batch itself, then skip true duplicates of existing rows.
  const seen = new Set<string>();
  const toInsert = incoming.filter(v => {
    const fp = despesaFingerprint(v);
    if (existingPrints.has(fp) || seen.has(fp)) return false;
    seen.add(fp);
    return true;
  });

  if (!toInsert.length) {
    res.status(201).json({ created: 0, despesas: [] });
    return;
  }

  const inserted = await db.insert(despesasTable)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .values(toInsert as any)
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

  try {
    const [row] = await db.update(despesasTable)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set(update as any)
      .where(eq(despesasTable.id, Number(req.params.id)))
      .returning();
    res.json(fmt(row));
  } catch (err: unknown) {
    const pgMsg = (err as any)?.cause?.message ?? (err as any)?.message ?? String(err);
    req.log.error({ err, pgMsg, body: req.body }, "Erro ao atualizar despesa");
    if (pgMsg.includes("unique") || pgMsg.includes("duplicate")) {
      res.status(409).json({ error: "Já existe um registro para esta Frota e Data." });
    } else {
      res.status(500).json({ error: `Erro ao salvar: ${pgMsg}` });
    }
  }
});

router.delete("/despesas/:id", async (req, res) => {
  await db.delete(despesasTable).where(eq(despesasTable.id, Number(req.params.id)));
  res.status(204).send();
});

export default router;
