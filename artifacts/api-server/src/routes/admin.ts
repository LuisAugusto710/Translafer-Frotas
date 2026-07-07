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
 *
 * Applies to:
 *   fretes      — origem, cliente, cidade, transporte, transp, obs
 *   despesas    — cidade, motorista_nome, ajudante_nome, troca_oleo_parcela, obs
 *   abastecimentos — posto, requisicao (title case); placa (uppercase)
 *
 * NOT normalized (identifiers / document codes):
 *   fretes.frota, fretes.cte_nf, despesas.frota, fleet_configs.frota,
 *   abastecimentos.placa (normalized to UPPERCASE, not title case)
 */
router.post("/admin/normalize-text", async (req, res) => {
  const tc = (col: string) =>
    `initcap(trim(regexp_replace(${col}, '\\s+', ' ', 'g')))`;
  const tcNull = (col: string) =>
    `CASE WHEN ${col} IS NOT NULL AND trim(${col}) <> '' THEN initcap(trim(regexp_replace(${col}, '\\s+', ' ', 'g'))) ELSE ${col} END`;

  await db.execute(sql.raw(`
    UPDATE fretes SET
      origem     = ${tc("origem")},
      cliente    = ${tc("cliente")},
      cidade     = ${tc("cidade")},
      transporte = ${tcNull("transporte")},
      transp     = ${tcNull("transp")},
      obs        = ${tcNull("obs")};

    UPDATE despesas SET
      cidade             = ${tc("cidade")},
      motorista_nome     = ${tc("motorista_nome")},
      ajudante_nome      = ${tc("ajudante_nome")},
      troca_oleo_parcela = ${tc("troca_oleo_parcela")},
      obs                = ${tcNull("obs")};

    UPDATE abastecimentos SET
      placa      = upper(trim(placa)),
      posto      = ${tcNull("posto")},
      requisicao = ${tcNull("requisicao")};
  `));

  req.log.info("Text normalization migration completed");
  res.json({ ok: true, message: "Normalização concluída com sucesso." });
});

export default router;
