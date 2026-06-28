import app from "./app";
import { logger } from "./lib/logger";
import cron from "node-cron";
import { generateBackup } from "./backup";

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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // ── Daily backup at 02:00 ─────────────────────────────────────────────────
  // Runs every day at 02:00 AM server time.
  cron.schedule("0 2 * * *", () => {
    logger.info("Cron: iniciando backup diário agendado…");
    generateBackup().catch((err) => {
      logger.error({ err }, "Cron: falha no backup diário agendado");
    });
  });

  // Also run once on startup so there is always a backup for today.
  generateBackup().catch((err) => {
    logger.error({ err }, "Startup: falha ao gerar backup inicial");
  });
});
