import { Router } from "express";
import { db, manutencoesTable } from "@workspace/db";
import { eq, and, gte, lte, or, ilike, desc, sql } from "drizzle-orm";
import { toTitleCase } from "../normalize";

const router = Router();

function toDateStr(v: unknown): string | undefined {
  if (!v) return undefined;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

function fmt(row: typeof manutencoesTable.$inferSelect) {
  return {
    ...row,
    km: Number(row.km),
    custo: Number(row.custo),
    dataManutencao: toDateStr(row.dataManutencao),
    temAnexo: !!(row.anexoNome && row.anexoDados),
    // Never send raw attachment data in list/get responses
    anexoDados: undefined,
  };
}

// ── List ─────────────────────────────────────────────────────────────────────

router.get("/manutencoes", async (req, res) => {
  const { search, frota, tipo, categoria, oficina, dateFrom, dateTo } = req.query;
  const limit = Math.min(Number(req.query.limit) || 100, 5000);
  const offset = Number(req.query.offset) || 0;

  const conditions = [];

  if (dateFrom) conditions.push(gte(manutencoesTable.dataManutencao, String(dateFrom)));
  if (dateTo)   conditions.push(lte(manutencoesTable.dataManutencao, String(dateTo)));
  if (frota)    conditions.push(ilike(manutencoesTable.frota, String(frota)));
  if (tipo)     conditions.push(ilike(manutencoesTable.tipo, String(tipo)));
  if (categoria) conditions.push(ilike(manutencoesTable.categoria, String(categoria)));
  if (oficina)  conditions.push(ilike(manutencoesTable.oficina, `%${String(oficina)}%`));

  if (search) {
    const like = `%${String(search)}%`;
    conditions.push(
      or(
        ilike(manutencoesTable.frota, like),
        ilike(manutencoesTable.tipo, like),
        ilike(manutencoesTable.procedimento, like),
        ilike(manutencoesTable.categoria, like),
        ilike(manutencoesTable.oficina, like),
        ilike(manutencoesTable.obs, like),
        sql`CAST(${manutencoesTable.km} AS TEXT) ILIKE ${like}`,
        sql`CAST(${manutencoesTable.dataManutencao} AS TEXT) ILIKE ${like}`,
      )
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ count }]] = await Promise.all([
    db.select().from(manutencoesTable).where(where).orderBy(desc(manutencoesTable.dataManutencao), desc(manutencoesTable.id)).limit(limit).offset(offset),
    db.select({ count: sql<number>`COUNT(*)::int` }).from(manutencoesTable).where(where),
  ]);

  res.json({ manutencoes: rows.map(fmt), total: Number(count) });
});

// ── Create ────────────────────────────────────────────────────────────────────

router.post("/manutencoes", async (req, res) => {
  const {
    dataManutencao, frota, km, tipo, procedimento, categoria, oficina, custo, obs,
    anexoNome, anexoTipo, anexoDados,
  } = req.body;

  if (!dataManutencao || !frota || km == null || !tipo || !procedimento || !categoria || !oficina || custo == null) {
    res.status(400).json({ error: "Campos obrigatórios não preenchidos." });
    return;
  }

  const [inserted] = await db.insert(manutencoesTable).values({
    dataManutencao: String(dataManutencao),
    frota: toTitleCase(String(frota)),
    km: String(Number(km)),
    tipo: String(tipo),
    procedimento: toTitleCase(String(procedimento)),
    categoria: String(categoria),
    oficina: toTitleCase(String(oficina)),
    custo: String(Number(custo)),
    obs: obs ? toTitleCase(String(obs)) : null,
    anexoNome: anexoNome ? String(anexoNome) : null,
    anexoTipo: anexoTipo ? String(anexoTipo) : null,
    anexoDados: anexoDados ? String(anexoDados) : null,
  }).returning();

  res.status(201).json(fmt(inserted));
});

// ── Get One ───────────────────────────────────────────────────────────────────

router.get("/manutencoes/:id", async (req, res) => {
  const [row] = await db.select().from(manutencoesTable).where(eq(manutencoesTable.id, Number(req.params.id)));
  if (!row) { res.status(404).json({ error: "Não encontrado" }); return; }
  res.json(fmt(row));
});

// ── Update ────────────────────────────────────────────────────────────────────

router.put("/manutencoes/:id", async (req, res) => {
  const id = Number(req.params.id);
  const {
    dataManutencao, frota, km, tipo, procedimento, categoria, oficina, custo, obs,
    anexoNome, anexoTipo, anexoDados,
  } = req.body;

  const update: Partial<typeof manutencoesTable.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (dataManutencao !== undefined) update.dataManutencao = String(dataManutencao);
  if (frota        !== undefined) update.frota = toTitleCase(String(frota));
  if (km           !== undefined) update.km = String(Number(km));
  if (tipo         !== undefined) update.tipo = String(tipo);
  if (procedimento !== undefined) update.procedimento = toTitleCase(String(procedimento));
  if (categoria    !== undefined) update.categoria = String(categoria);
  if (oficina      !== undefined) update.oficina = toTitleCase(String(oficina));
  if (custo        !== undefined) update.custo = String(Number(custo));
  if (obs          !== undefined) update.obs = obs ? toTitleCase(String(obs)) : null;
  if (anexoNome    !== undefined) update.anexoNome = anexoNome ? String(anexoNome) : null;
  if (anexoTipo    !== undefined) update.anexoTipo = anexoTipo ? String(anexoTipo) : null;
  if (anexoDados   !== undefined) update.anexoDados = anexoDados ? String(anexoDados) : null;

  const [updated] = await db.update(manutencoesTable).set(update).where(eq(manutencoesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Não encontrado" }); return; }
  res.json(fmt(updated));
});

// ── Delete ────────────────────────────────────────────────────────────────────

router.delete("/manutencoes/:id", async (req, res) => {
  await db.delete(manutencoesTable).where(eq(manutencoesTable.id, Number(req.params.id)));
  res.status(204).send();
});

// ── Attachment download ───────────────────────────────────────────────────────

router.get("/manutencoes/:id/anexo", async (req, res) => {
  const [row] = await db.select().from(manutencoesTable).where(eq(manutencoesTable.id, Number(req.params.id)));
  if (!row || !row.anexoDados || !row.anexoNome) {
    res.status(404).json({ error: "Anexo não encontrado" });
    return;
  }
  const buffer = Buffer.from(row.anexoDados, "base64");
  const mimeType = row.anexoTipo || "application/octet-stream";
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(row.anexoNome)}"`);
  res.setHeader("Content-Length", buffer.length);
  res.send(buffer);
});

// ── Delete attachment ─────────────────────────────────────────────────────────

router.delete("/manutencoes/:id/anexo", async (req, res) => {
  const id = Number(req.params.id);
  const [updated] = await db.update(manutencoesTable)
    .set({ anexoNome: null, anexoTipo: null, anexoDados: null, updatedAt: new Date() })
    .where(eq(manutencoesTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Não encontrado" }); return; }
  res.json(fmt(updated));
});

export default router;
