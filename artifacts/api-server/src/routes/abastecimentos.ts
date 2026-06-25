import { Router } from "express";
import { db, abastecimentosTable } from "@workspace/db";
import { eq, and, ilike, or, desc, sql } from "drizzle-orm";

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
  const { placa, mes, search, limit = "1000", offset = "0" } = req.query as Record<string, string>;
  const ano = req.query.ano ? Number(req.query.ano) : undefined;

  const conditions = [];
  if (placa) conditions.push(ilike(abastecimentosTable.placa, `%${placa}%`));
  if (mes) conditions.push(ilike(abastecimentosTable.mes, `%${mes}%`));
  if (ano) conditions.push(eq(abastecimentosTable.ano, ano));
  if (search) {
    conditions.push(or(
      ilike(abastecimentosTable.placa, `%${search}%`),
      ilike(abastecimentosTable.posto, `%${search}%`),
      ilike(abastecimentosTable.mes, `%${search}%`),
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

router.post("/abastecimentos", async (req, res) => {
  const { data, litros, precoLitro, totalPago, kmInicio, kmFinal, kmPercorrido, media, requisicao, posto, ...rest } = req.body;

  const [row] = await db.insert(abastecimentosTable).values({
    ...rest,
    data: toDateStr(data) ?? data,
    litros: String(litros ?? 0),
    precoLitro: String(precoLitro ?? 0),
    totalPago: String(totalPago ?? 0),
    kmInicio: kmInicio != null ? String(kmInicio) : null,
    kmFinal: kmFinal != null ? String(kmFinal) : null,
    kmPercorrido: kmPercorrido != null ? String(kmPercorrido) : null,
    media: media != null ? String(media) : null,
    requisicao: requisicao ?? null,
    posto: posto ?? null,
  }).returning();

  res.status(201).json(fmt(row));
});

router.put("/abastecimentos/:id", async (req, res) => {
  const { data, litros, precoLitro, totalPago, kmInicio, kmFinal, kmPercorrido, media, ...rest } = req.body;
  const update: Record<string, unknown> = { ...rest, updatedAt: new Date() };
  if (data !== undefined) update.data = toDateStr(data) ?? data;
  if (litros !== undefined) update.litros = String(litros);
  if (precoLitro !== undefined) update.precoLitro = String(precoLitro);
  if (totalPago !== undefined) update.totalPago = String(totalPago);
  if (kmInicio !== undefined) update.kmInicio = kmInicio != null ? String(kmInicio) : null;
  if (kmFinal !== undefined) update.kmFinal = kmFinal != null ? String(kmFinal) : null;
  if (kmPercorrido !== undefined) update.kmPercorrido = kmPercorrido != null ? String(kmPercorrido) : null;
  if (media !== undefined) update.media = media != null ? String(media) : null;

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
