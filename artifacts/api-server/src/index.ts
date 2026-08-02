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
 * One-time migration: assign sequential transporte numbers starting from 5355256.
 * Ordered by data_cte ASC, then id ASC.
 * Idempotent — tracked in the _migrations table so it only runs once.
 *
 * Works with both postgres-js (returns array) and node-postgres (returns { rows: [...] }).
 */
async function migrateTransporteSequence(): Promise<void> {
  try {
    // Helper: extract rows from Drizzle execute() regardless of driver
    const getRows = (result: unknown): unknown[] => {
      if (Array.isArray(result)) return result as unknown[];
      const r = result as Record<string, unknown> | null;
      return Array.isArray(r?.rows) ? (r!.rows as unknown[]) : [];
    };

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

    const rc = (updateResult as Record<string, unknown>)?.rowCount ?? "?";
    logger.info({ rowCount: rc }, "Migração de transporte aplicada com sucesso.");
  } catch (err) {
    logger.error({ err }, "Erro na migração de transporte — continuando sem parar o servidor.");
  }
}

async function bootstrap(): Promise<void> {
  // Ensure session storage and the shared login user exist before accepting
  // traffic, otherwise the first requests would fail to persist sessions.
  await ensureSessionTable();
  await seedAuthUser();
  await migrateTransporteSequence();

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
