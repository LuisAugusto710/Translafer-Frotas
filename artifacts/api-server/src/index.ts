import app from "./app";
import { logger } from "./lib/logger";
import cron from "node-cron";
import { generateBackup } from "./backup";
import { seedAuthUser } from "./lib/seed";
import { ensureSessionTable } from "./lib/session";

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

async function bootstrap(): Promise<void> {
  // Ensure session storage and the shared login user exist before accepting
  // traffic, otherwise the first requests would fail to persist sessions.
  await ensureSessionTable();
  await seedAuthUser();

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
