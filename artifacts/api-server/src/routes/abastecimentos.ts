import { Router } from "express";
import { db, abastecimentosTable } from "@workspace/db";
import { eq, and, ilike, or, desc, sql } from "drizzle-orm";
import { toTitleCaseOrNull, normalizePlate } from "../normalize";

const router = Router();

function toDateStr(v: unknown): string | undefined {
  if (!v) return undefined;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

function fmt(t: typeof abastecimentosTable.$inferSelect) {
  return {
    ...t,
    litros: Number(t.litros),
    precoLitro: Number(t.precoLitro),
    totalPago: Number(t.totalPago),
    kmInicio: t.kmInicio != null ? Number(t.kmInicio) : null,
    kmFinal: t.kmFinal != null ? Number(t.kmFinal) : null,
    kmPercorrido: t.kmPercorrido != null ? Number(t.kmPercorrido) : null,
    media: t.media != null ? Number(t.media) : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

router.get("/abastecimentos", async (req, res) => {
  const { placa, search, limit = "1000", offset = "0" } = req.query as Record<string, string>;

  const conditions = [];
  if (placa) conditions.push(ilike(abastecimentosTable.placa, `%${placa}%`));
  if (search) {
    conditions.push(or(
      ilike(abastecimentosTable.placa, `%${search}%`),
      ilike(abastecimentosTable.posto, `%${search}%`),
      sql`CAST(${abastecimentosTable.data} AS TEXT) ILIKE ${`%${search}%`}`,
    )!);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db.select().from(abastecimentosTable).where(where)
      .orderBy(desc(abastecimentosTable.data), desc(abastecimentosTable.createdAt))
      .limit(Number(limit)).offset(Number(offset)),
    db.select({ count: sql<number>`count(*)` }).from(abastecimentosTable).where(where),
  ]);

  res.json({ abastecimentos: rows.map(fmt), total: Number(countResult[0].count) });
});

router.get("/abastecimentos/ultimo", async (req, res) => {
  const { placa } = req.query as Record<string, string>;
  if (!placa) {
    res.json({ precoLitro: null, kmFinal: null });
    return;
  }
  const [row] = await db.select({
    precoLitro: abastecimentosTable.precoLitro,
    kmFinal:    abastecimentosTable.kmFinal,
  }).from(abastecimentosTable)
    .where(eq(abastecimentosTable.placa, placa))
    .orderBy(desc(abastecimentosTable.data), desc(abastecimentosTable.createdAt))
    .limit(1);

  if (!row) {
    res.json({ precoLitro: null, kmFinal: null });
    return;
  }
  res.json({
    precoLitro: row.precoLitro != null ? Number(row.precoLitro) : null,
    kmFinal:    row.kmFinal    != null ? Number(row.kmFinal) : null,
  });
});

router.post("/abastecimentos", async (req, res) => {
  const { data, placa, litros, precoLitro, totalPago, kmInicio, kmFinal, kmPercorrido, media, requisicao, posto } = req.body;

  const [row] = await db.insert(abastecimentosTable).values({
    data: toDateStr(data) ?? data,
    placa: normalizePlate(placa),
    litros: String(litros ?? 0),
    precoLitro: String(precoLitro ?? 0),
    totalPago: String(totalPago ?? 0),
    kmInicio: kmInicio != null ? String(kmInicio) : null,
    kmFinal: kmFinal != null ? String(kmFinal) : null,
    kmPercorrido: kmPercorrido != null ? String(kmPercorrido) : null,
    media: media != null ? String(media) : null,
    requisicao: requisicao ?? null,
    posto: toTitleCaseOrNull(posto),
  }).returning();

  res.status(201).json(fmt(row));
});

router.put("/abastecimentos/:id", async (req, res) => {
  const { data, placa, litros, precoLitro, totalPago, kmInicio, kmFinal, kmPercorrido, media, posto } = req.body;
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (data     !== undefined) update.data     = toDateStr(data) ?? data;
  if (placa    !== undefined) update.placa    = normalizePlate(placa);
  if (litros   !== undefined) update.litros   = String(litros);
  if (precoLitro !== undefined) update.precoLitro = String(precoLitro);
  if (totalPago  !== undefined) update.totalPago  = String(totalPago);
  if (kmInicio   !== undefined) update.kmInicio   = kmInicio != null ? String(kmInicio) : null;
  if (kmFinal    !== undefined) update.kmFinal    = kmFinal != null ? String(kmFinal) : null;
  if (kmPercorrido !== undefined) update.kmPercorrido = kmPercorrido != null ? String(kmPercorrido) : null;
  if (media    !== undefined) update.media    = media != null ? String(media) : null;
  if (posto    !== undefined) update.posto    = toTitleCaseOrNull(posto);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [row] = await db.update(abastecimentosTable).set(update as any).where(eq(abastecimentosTable.id, Number(req.params.id))).returning();
  if (!row) { res.status(404).json({ error: "Não encontrado" }); return; }
  res.json(fmt(row));
});

router.delete("/abastecimentos/:id", async (req, res) => {
  await db.delete(abastecimentosTable).where(eq(abastecimentosTable.id, Number(req.params.id)));
  res.status(204).send();
});

router.get("/placas", async (req, res) => {
  const result = await db.select({
    placa: abastecimentosTable.placa,
    totalAbastecimentos: sql<number>`count(*)`,
    totalLitros: sql<number>`sum(${abastecimentosTable.litros})`,
    totalPago: sql<number>`sum(${abastecimentosTable.totalPago})`,
    mediaGeral: sql<number>`avg(${abastecimentosTable.media})`,
  }).from(abastecimentosTable).groupBy(abastecimentosTable.placa).orderBy(abastecimentosTable.placa);

  res.json(result.map(r => ({
    placa: r.placa,
    totalAbastecimentos: Number(r.totalAbastecimentos),
    totalLitros: Number(r.totalLitros ?? 0),
    totalPago: Number(r.totalPago ?? 0),
    mediaGeral: r.mediaGeral != null ? Number(r.mediaGeral) : null,
  })));
});

export default router;
