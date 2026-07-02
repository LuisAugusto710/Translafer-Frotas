import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

router.post("/admin/reset-data", async (req, res) => {
  const secret = process.env["SESSION_SECRET"];
  const provided = req.headers["x-reset-token"];
  if (!secret || provided !== secret) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db.execute(sql`
    TRUNCATE TABLE abastecimentos RESTART IDENTITY CASCADE;
    TRUNCATE TABLE despesas       RESTART IDENTITY CASCADE;
    TRUNCATE TABLE fretes         RESTART IDENTITY CASCADE;
    TRUNCATE TABLE trips          RESTART IDENTITY CASCADE;
  `);

  res.json({ ok: true, message: "All data tables cleared and sequences reset." });
});

export default router;
