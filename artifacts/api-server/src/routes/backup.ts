import { Router } from "express";
import path from "node:path";
import { generateBackup, listBackups, BACKUP_DIR } from "../backup";

const router = Router();

const BACKUP_FILE_RE = /^lafer_backup_\d{4}-\d{2}-\d{2}\.xlsx$/;

// GET /api/backup — list all available backup files
router.get("/backup", async (req, res) => {
  const backups = await listBackups();
  res.json({ backups });
});

// POST /api/backup — trigger a manual backup immediately
router.post("/backup", async (req, res) => {
  try {
    const filename = await generateBackup();
    res.json({ filename, message: "Backup gerado com sucesso" });
  } catch (err) {
    req.log.error({ err }, "Falha ao gerar backup manual");
    res.status(500).json({ error: "Falha ao gerar backup" });
  }
});

// GET /api/backup/download/:filename — download a specific backup file
router.get("/backup/download/:filename", async (req, res) => {
  const { filename } = req.params;

  if (!BACKUP_FILE_RE.test(filename)) {
    res.status(400).json({ error: "Nome de arquivo inválido" });
    return;
  }

  const filepath = path.join(BACKUP_DIR, filename);
  res.download(filepath, filename, (err) => {
    if (err) {
      req.log.error({ err, filename }, "Erro ao enviar arquivo de backup");
      if (!res.headersSent) {
        res.status(404).json({ error: "Arquivo não encontrado" });
      }
    }
  });
});

export default router;
