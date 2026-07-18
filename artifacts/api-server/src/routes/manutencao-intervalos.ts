import { Router } from "express";
import { db, manutencaoIntervalosTable, manutencoesTable, abastecimentosTable } from "@workspace/db";
import { eq, desc, sql, and } from "drizzle-orm";

const router = Router();

function fmt(row: typeof manutencaoIntervalosTable.$inferSelect) {
  return {
    ...row,
    intervaloKm: Number(row.intervaloKm),
    avisoPercentual: Number(row.avisoPercentual),
  };
}

// ── List ──────────────────────────────────────────────────────────────────────
router.get("/manutencao-intervalos", async (_req, res) => {
  const rows = await db
    .select()
    .from(manutencaoIntervalosTable)
    .orderBy(manutencaoIntervalosTable.categoria);
  res.json(rows.map(fmt));
});

// ── Create ────────────────────────────────────────────────────────────────────
router.post("/manutencao-intervalos", async (req, res) => {
  const { categoria, descricao, intervaloKm, avisoPercentual } = req.body;
  if (!categoria || intervaloKm == null) {
    res.status(400).json({ error: "categoria e intervaloKm são obrigatórios." });
    return;
  }
  const [inserted] = await db
    .insert(manutencaoIntervalosTable)
    .values({
      categoria: String(categoria),
      descricao: descricao ? String(descricao) : null,
      intervaloKm: String(Number(intervaloKm)),
      avisoPercentual: String(Number(avisoPercentual ?? 20)),
    })
    .onConflictDoUpdate({
      target: manutencaoIntervalosTable.categoria,
      set: {
        descricao: sql`EXCLUDED.descricao`,
        intervaloKm: sql`EXCLUDED.intervalo_km`,
        avisoPercentual: sql`EXCLUDED.aviso_percentual`,
        updatedAt: new Date(),
      },
    })
    .returning();
  res.status(201).json(fmt(inserted));
});

// ── Update ────────────────────────────────────────────────────────────────────
router.put("/manutencao-intervalos/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { categoria, descricao, intervaloKm, avisoPercentual } = req.body;
  const update: Partial<typeof manutencaoIntervalosTable.$inferInsert> = { updatedAt: new Date() };
  if (categoria    !== undefined) update.categoria = String(categoria);
  if (descricao    !== undefined) update.descricao = descricao ? String(descricao) : null;
  if (intervaloKm  !== undefined) update.intervaloKm = String(Number(intervaloKm));
  if (avisoPercentual !== undefined) update.avisoPercentual = String(Number(avisoPercentual));

  const [updated] = await db
    .update(manutencaoIntervalosTable)
    .set(update)
    .where(eq(manutencaoIntervalosTable.id, id))
    .returning();
  if (!updated) { res.status(404).json({ error: "Não encontrado" }); return; }
  res.json(fmt(updated));
});

// ── Delete ────────────────────────────────────────────────────────────────────
router.delete("/manutencao-intervalos/:id", async (req, res) => {
  await db
    .delete(manutencaoIntervalosTable)
    .where(eq(manutencaoIntervalosTable.id, Number(req.params.id)));
  res.status(204).send();
});

// ── Preventive analysis ───────────────────────────────────────────────────────
// GET /api/manutencao-intervalos/preventiva
// For each (frota, categoria) pair that has a configured interval, compute
// the next due KM and remaining KM based on the most-recent maintenance record.
router.get("/manutencao-intervalos/preventiva", async (_req, res) => {
  const rows = await db.execute(sql`
    WITH
      last_manut AS (
        SELECT
          frota,
          categoria,
          km::FLOAT8               AS ultimo_km,
          data_manutencao          AS ultima_data,
          ROW_NUMBER() OVER (
            PARTITION BY frota, categoria
            ORDER BY data_manutencao DESC, id DESC
          ) AS rn
        FROM manutencoes
      ),
      current_km AS (
        -- Best available odometer per fleet, pulling from both maintenance
        -- records and fuel fill-up records (km_final = odometer at fill-up).
        -- Assumes abastecimentos.placa uses the same identifier as frota.
        SELECT frota, MAX(km_ref)::FLOAT8 AS km_atual
        FROM (
          SELECT frota, km::FLOAT8 AS km_ref FROM manutencoes WHERE km IS NOT NULL
          UNION ALL
          SELECT placa AS frota, km_final::FLOAT8 AS km_ref FROM abastecimentos WHERE km_final IS NOT NULL
        ) km_sources
        GROUP BY frota
      )
    SELECT
      lm.frota,
      lm.categoria,
      i.id                         AS intervalo_id,
      i.descricao,
      i.intervalo_km::FLOAT8       AS intervalo_km,
      i.aviso_percentual::FLOAT8   AS aviso_percentual,
      lm.ultima_data,
      lm.ultimo_km,
      ck.km_atual,
      (lm.ultimo_km + i.intervalo_km::FLOAT8)           AS km_proxima,
      (lm.ultimo_km + i.intervalo_km::FLOAT8 - ck.km_atual) AS km_restante
    FROM last_manut lm
    JOIN manutencao_intervalos i ON i.categoria = lm.categoria
    JOIN current_km ck ON ck.frota = lm.frota
    WHERE lm.rn = 1
    ORDER BY km_restante ASC NULLS LAST
  `);

  const items = (rows.rows as any[]).map((r) => {
    const kmRestante = Number(r.km_restante);
    const intervaloKm = Number(r.intervalo_km);
    const avisoLimite = intervaloKm * (Number(r.aviso_percentual) / 100);
    const status: "ok" | "aviso" | "vencido" =
      kmRestante <= 0 ? "vencido"
      : kmRestante <= avisoLimite ? "aviso"
      : "ok";

    return {
      frota: r.frota,
      categoria: r.categoria,
      intervaloId: Number(r.intervalo_id),
      descricao: r.descricao ?? null,
      intervaloKm,
      avisoPercentual: Number(r.aviso_percentual),
      ultimaData: r.ultima_data ? String(r.ultima_data).slice(0, 10) : null,
      ultimoKm: Number(r.ultimo_km),
      kmAtual: Number(r.km_atual),
      kmProxima: Number(r.km_proxima),
      kmRestante,
      status,
    };
  });

  // Sort: vencido → aviso → ok, then by kmRestante asc within each group
  const order = { vencido: 0, aviso: 1, ok: 2 };
  items.sort((a, b) => {
    const od = order[a.status] - order[b.status];
    if (od !== 0) return od;
    return a.kmRestante - b.kmRestante;
  });

  res.json(items);
});

// GET /api/frotas/km-atual?frota=1118
// Returns the best available current odometer for a given fleet,
// considering both maintenance records and diesel fill-up records.
router.get("/frotas/km-atual", async (req, res) => {
  const { frota } = req.query as { frota?: string };
  if (!frota?.trim()) {
    res.status(400).json({ error: "frota é obrigatório" });
    return;
  }

  const rows = await db.execute(sql`
    SELECT MAX(km_ref)::FLOAT8 AS km_atual
    FROM (
      SELECT km::FLOAT8 AS km_ref
      FROM manutencoes
      WHERE frota = ${frota} AND km IS NOT NULL
      UNION ALL
      SELECT km_final::FLOAT8 AS km_ref
      FROM abastecimentos
      WHERE placa = ${frota} AND km_final IS NOT NULL
    ) km_sources
  `);

  const km = (rows.rows[0] as any)?.km_atual;
  res.json({ frota, kmAtual: km != null ? Number(km) : null });
});

export default router;
