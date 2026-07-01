import { Router } from "express";
import { db, fleetConfigsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/fleet-configs", async (_req, res) => {
  const rows = await db.select().from(fleetConfigsTable).orderBy(fleetConfigsTable.frota);
  res.json(rows.map((r) => ({
    frota: r.frota,
    kmPorLitro: r.kmPorLitro != null ? Number(r.kmPorLitro) : null,
  })));
});

router.put("/fleet-configs/:frota", async (req, res) => {
  const frota = req.params.frota;
  const { kmPorLitro } = req.body as { kmPorLitro?: number };

  if (kmPorLitro == null || isNaN(Number(kmPorLitro)) || Number(kmPorLitro) <= 0) {
    res.status(400).json({ error: "kmPorLitro deve ser um número positivo." });
    return;
  }

  await db
    .insert(fleetConfigsTable)
    .values({ frota, kmPorLitro: String(kmPorLitro), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: fleetConfigsTable.frota,
      set: { kmPorLitro: String(kmPorLitro), updatedAt: new Date() },
    });

  const [row] = await db.select().from(fleetConfigsTable).where(eq(fleetConfigsTable.frota, frota));
  res.json({ frota: row.frota, kmPorLitro: row.kmPorLitro != null ? Number(row.kmPorLitro) : null });
});

export default router;
