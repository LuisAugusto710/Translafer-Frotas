import app from "./app";
import { logger } from "./lib/logger";
import cron from "node-cron";
import { generateBackup } from "./backup";
import { seedAuthUser } from "./lib/seed";
import { ensureSessionTable } from "./lib/session";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/**
 * Shared helper: extract rows from Drizzle execute() regardless of driver.
 * postgres-js returns an array; node-postgres returns { rows: [...] }.
 */
function getRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result as unknown[];
  const r = result as Record<string, unknown> | null;
  return Array.isArray(r?.rows) ? (r!.rows as unknown[]) : [];
}

/**
 * One-time migration: assign sequential transporte numbers starting from 5355256.
 * Ordered by data_cte ASC, then id ASC.
 * Idempotent — tracked in the _migrations table so it only runs once.
 *
 * Works with both postgres-js (returns array) and node-postgres (returns { rows: [...] }).
 */
async function migrateTransporteSequence(): Promise<void> {
  try {
    // Create the migrations tracking table if it doesn't exist
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Check if this migration was already applied
    const checkResult = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM _migrations WHERE name = 'transporte_sequence_2026_07'
    `);
    const cnt = Number((getRows(checkResult)[0] as Record<string, unknown>)?.cnt ?? 0);
    if (cnt > 0) {
      logger.info("Migração de transporte já aplicada — ignorando.");
      return;
    }

    // Assign sequential numbers ordered chronologically (5355256, 5355257, …)
    const updateResult = await db.execute(sql`
      WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (ORDER BY data_cte ASC, id ASC) - 1 AS rn
        FROM fretes
      )
      UPDATE fretes
      SET transporte = (5355256 + ranked.rn)::text
      FROM ranked
      WHERE fretes.id = ranked.id
    `);

    // Mark migration as done
    await db.execute(sql`
      INSERT INTO _migrations (name) VALUES ('transporte_sequence_2026_07')
      ON CONFLICT DO NOTHING
    `);

    const rc = ((updateResult as unknown) as Record<string, unknown>)?.rowCount ?? "?";
    logger.info({ rowCount: rc }, "Migração de transporte aplicada com sucesso.");
  } catch (err) {
    logger.error({ err }, "Erro na migração de transporte — continuando sem parar o servidor.");
  }
}

/**
 * Migration 2: fix duplicate transporte entries introduced by race conditions
 * and create a PostgreSQL SEQUENCE so future inserts are atomic.
 *
 * Safe to re-run: tracked in _migrations; sequence uses IF NOT EXISTS.
 */
async function fixTransporteDuplicatesAndCreateSequence(): Promise<void> {
  try {
    // Check if already applied
    const checkResult = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM _migrations WHERE name = 'transporte_fix_duplicates_2026_08'
    `);
    const cnt = Number((getRows(checkResult)[0] as Record<string, unknown>)?.cnt ?? 0);
    if (cnt > 0) {
      logger.info("Migração de duplicados já aplicada — ignorando.");
      return;
    }

    // Fix every set of duplicate transporte values: keep the entry with the
    // lowest id unchanged, reassign all others to the running MAX+1.
    await db.execute(sql`
      WITH dupes AS (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY transporte ORDER BY id ASC) AS rn
        FROM fretes
        WHERE transporte ~ '^[0-9]+$'
      ),
      victims AS (
        SELECT id FROM dupes WHERE rn > 1
      ),
      ordered_victims AS (
        SELECT id,
               ROW_NUMBER() OVER (ORDER BY id ASC) AS ord
        FROM victims
      ),
      current_max AS (
        SELECT COALESCE(
          MAX(CASE WHEN transporte ~ '^[0-9]+$' THEN CAST(transporte AS BIGINT) ELSE 0 END), 5355255
        ) AS max_t
        FROM fretes
        WHERE id NOT IN (SELECT id FROM victims)
      )
      UPDATE fretes
      SET transporte = (current_max.max_t + ordered_victims.ord)::text
      FROM ordered_victims, current_max
      WHERE fretes.id = ordered_victims.id
    `);

    // Create the sequence starting right after the current maximum transporte
    await db.execute(sql`
      DO $$
      DECLARE
        max_t BIGINT;
      BEGIN
        SELECT COALESCE(
          MAX(CASE WHEN transporte ~ '^[0-9]+$' THEN CAST(transporte AS BIGINT) ELSE 0 END),
          5355255
        ) INTO max_t FROM fretes;

        IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE sequencename = 'transporte_seq') THEN
          EXECUTE format('CREATE SEQUENCE transporte_seq START WITH %s INCREMENT BY 1', max_t + 1);
        ELSE
          -- Advance the sequence to at least max_t + 1 if it's behind
          PERFORM setval('transporte_seq', GREATEST(max_t + 1, nextval('transporte_seq') - 1), false);
        END IF;
      END
      $$
    `);

    // Mark as done
    await db.execute(sql`
      INSERT INTO _migrations (name) VALUES ('transporte_fix_duplicates_2026_08')
      ON CONFLICT DO NOTHING
    `);

    logger.info("Migração de duplicados + sequence criada com sucesso.");
  } catch (err) {
    logger.error({ err }, "Erro na migração de duplicados — continuando sem parar o servidor.");
  }
}

/**
 * Migration 3: full re-sequence of ALL fretes (Jul + Aug) ordered by
 * data_cte ASC, id ASC, starting at 5355256.
 * Recalibrates the transporte_seq sequence to MAX+1 afterwards.
 * Idempotent — tracked in _migrations.
 */
async function fullResequenceTransporte(): Promise<void> {
  try {
    const checkResult = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM _migrations
      WHERE name = 'transporte_full_resequence_2026_08'
    `);
    const cnt = Number((getRows(checkResult)[0] as Record<string, unknown>)?.cnt ?? 0);
    if (cnt > 0) {
      logger.info("Re-sequenciamento já aplicado — ignorando.");
      return;
    }

    // Reassign every frete sequentially (5355256, 5355257, …) by date then id
    await db.execute(sql`
      WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (ORDER BY data_cte ASC, id ASC) - 1 AS rn
        FROM fretes
      )
      UPDATE fretes
      SET transporte = (5355256 + ranked.rn)::text
      FROM ranked
      WHERE fretes.id = ranked.id
    `);

    // Advance the sequence so the next INSERT gets MAX+1
    await db.execute(sql`
      SELECT setval(
        'transporte_seq',
        (SELECT MAX(CAST(transporte AS BIGINT))
         FROM fretes
         WHERE transporte ~ '^[0-9]+$'),
        true   -- is_called=true → next nextval returns max+1
      )
    `);

    await db.execute(sql`
      INSERT INTO _migrations (name) VALUES ('transporte_full_resequence_2026_08')
      ON CONFLICT DO NOTHING
    `);

    logger.info("Re-sequenciamento completo de transporte aplicado com sucesso.");
  } catch (err) {
    logger.error({ err }, "Erro no re-sequenciamento — continuando sem parar o servidor.");
  }
}

async function bootstrap(): Promise<void> {
  // Ensure session storage and the shared login user exist before accepting
  // traffic, otherwise the first requests would fail to persist sessions.
  await ensureSessionTable();
  await seedAuthUser();
  await migrateTransporteSequence();
  await fixTransporteDuplicatesAndCreateSequence();
  await fullResequenceTransporte();

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");

    // ── Weekly backup at 02:00 on Monday ───────────────────────────────────
    // Runs every Monday at 02:00 AM server time.
    cron.schedule("0 2 * * 1", () => {
      logger.info("Cron: iniciando backup semanal agendado…");
      generateBackup().catch((err) => {
        logger.error({ err }, "Cron: falha no backup semanal agendado");
      });
    });

    // Also run once on startup so there is always a backup for today.
    generateBackup().catch((err) => {
      logger.error({ err }, "Startup: falha ao gerar backup inicial");
    });
  });
}

bootstrap().catch((err) => {
  logger.error({ err }, "Fatal error during server bootstrap");
  process.exit(1);
});
