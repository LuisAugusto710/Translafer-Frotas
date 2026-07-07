import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

/**
 * POST /api/admin/normalize-text
 *
 * One-time migration: normalizes all existing text fields in every table
 * to Title Case + whitespace cleanup, using PostgreSQL's initcap() + trim().
 * Safe to run multiple times (idempotent).
 */
router.post("/admin/normalize-text", async (req, res) => {
  const normalize = (col: string) =>
    `initcap(trim(regexp_replace(${col}, '\\s+', ' ', 'g')))`;
  const normalizeNullable = (col: string) =>
    `CASE WHEN ${col} IS NOT NULL THEN initcap(trim(regexp_replace(${col}, '\\s+', ' ', 'g'))) ELSE NULL END`;

  await db.execute(sql.raw(`
    UPDATE fretes SET
      origem     = ${normalize("origem")},
      cliente    = ${normalize("cliente")},
      cidade     = ${normalize("cidade")},
      transporte = ${normalizeNullable("transporte")},
      transp     = ${normalizeNullable("transp")},
      obs        = ${normalizeNullable("obs")};

    UPDATE despesas SET
      cidade           = ${normalize("cidade")},
      motorista_nome   = ${normalize("motorista_nome")},
      ajudante_nome    = ${normalize("ajudante_nome")},
      troca_oleo_parcela = ${normalize("troca_oleo_parcela")},
      obs              = ${normalizeNullable("obs")};

    UPDATE abastecimentos SET
      placa = upper(trim(placa)),
      posto = ${normalizeNullable("posto")};
  `));

  req.log.info("Text normalization migration completed");
  res.json({ ok: true, message: "Normalização concluída com sucesso." });
});

export default router;
