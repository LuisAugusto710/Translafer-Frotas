import { Router } from "express";
import { db, tripsTable } from "@workspace/db";
import {
  CreateTripBody,
  UpdateTripBody,
  ListTripsQueryParams,
  GetTripParams,
  UpdateTripParams,
  DeleteTripParams,
  BulkCreateTripsBody,
} from "@workspace/api-zod";
import { eq, and, gte, lte, or, ilike, desc, sql } from "drizzle-orm";

const router = Router();

function toDateStr(value: string | Date | undefined): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

function formatTrip(t: typeof tripsTable.$inferSelect) {
  return {
    ...t,
    revenueAmount: Number(t.revenueAmount),
    fuelCost: Number(t.fuelCost),
    otherExpenses: Number(t.otherExpenses),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

router.get("/trips", async (req, res) => {
  const parsed = ListTripsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }

  const { truckId, driverName, customerName, dateFrom, dateTo, search, limit = 1000, offset = 0 } = parsed.data;

  const dateFromStr = toDateStr(dateFrom as string | Date | undefined);
  const dateToStr = toDateStr(dateTo as string | Date | undefined);

  const conditions = [];
  if (truckId) conditions.push(ilike(tripsTable.truckId, `%${truckId}%`));
  if (driverName) conditions.push(ilike(tripsTable.driverName, `%${driverName}%`));
  if (customerName) conditions.push(ilike(tripsTable.customerName, `%${customerName}%`));
  if (dateFromStr) conditions.push(gte(tripsTable.date, dateFromStr));
  if (dateToStr) conditions.push(lte(tripsTable.date, dateToStr));
  if (search) {
    conditions.push(
      or(
        ilike(tripsTable.truckId, `%${search}%`),
        ilike(tripsTable.driverName, `%${search}%`),
        ilike(tripsTable.customerName, `%${search}%`),
        ilike(tripsTable.route, `%${search}%`),
      )!
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [trips, countResult] = await Promise.all([
    db
      .select()
      .from(tripsTable)
      .where(where)
      .orderBy(desc(tripsTable.date), desc(tripsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(tripsTable).where(where),
  ]);

  res.json({ trips: trips.map(formatTrip), total: Number(countResult[0].count) });
});

router.post("/trips", async (req, res) => {
  const parsed = CreateTripBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { date, freightDescription, notes, revenueAmount, fuelCost, otherExpenses, ...rest } = parsed.data;

  const [trip] = await db
    .insert(tripsTable)
    .values({
      ...rest,
      date: toDateStr(date as unknown as string | Date) ?? String(date),
      revenueAmount: String(revenueAmount),
      fuelCost: String(fuelCost),
      otherExpenses: String(otherExpenses),
      freightDescription: freightDescription ?? null,
      notes: notes ?? null,
    })
    .returning();

  res.status(201).json(formatTrip(trip));
});

router.post("/trips/bulk", async (req, res) => {
  const parsed = BulkCreateTripsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { trips } = parsed.data;
  if (trips.length === 0) {
    res.status(201).json({ created: 0, trips: [] });
    return;
  }

  const values = trips.map(({ date, freightDescription, notes, revenueAmount, fuelCost, otherExpenses, ...rest }) => ({
    ...rest,
    date: toDateStr(date as unknown as string | Date) ?? String(date),
    revenueAmount: String(revenueAmount),
    fuelCost: String(fuelCost),
    otherExpenses: String(otherExpenses),
    freightDescription: freightDescription ?? null,
    notes: notes ?? null,
  }));

  const inserted = await db.insert(tripsTable).values(values).returning();
  res.status(201).json({ created: inserted.length, trips: inserted.map(formatTrip) });
});

router.get("/trips/:id", async (req, res) => {
  const parsed = GetTripParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid trip ID" });
    return;
  }

  const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, parsed.data.id));
  if (!trip) {
    res.status(404).json({ error: "Trip not found" });
    return;
  }

  res.json(formatTrip(trip));
});

router.put("/trips/:id", async (req, res) => {
  const paramsParsed = UpdateTripParams.safeParse({ id: Number(req.params.id) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid trip ID" });
    return;
  }

  const bodyParsed = UpdateTripBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { date, revenueAmount, fuelCost, otherExpenses, ...rest } = bodyParsed.data;

  const updateData: Record<string, unknown> = {
    ...rest,
    updatedAt: new Date(),
  };
  if (date !== undefined) updateData.date = toDateStr(date as unknown as string | Date) ?? String(date);
  if (revenueAmount !== undefined) updateData.revenueAmount = String(revenueAmount);
  if (fuelCost !== undefined) updateData.fuelCost = String(fuelCost);
  if (otherExpenses !== undefined) updateData.otherExpenses = String(otherExpenses);

  const [trip] = await db
    .update(tripsTable)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .set(updateData as any)
    .where(eq(tripsTable.id, paramsParsed.data.id))
    .returning();

  if (!trip) {
    res.status(404).json({ error: "Trip not found" });
    return;
  }

  res.json(formatTrip(trip));
});

router.delete("/trips/:id", async (req, res) => {
  const parsed = DeleteTripParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid trip ID" });
    return;
  }

  await db.delete(tripsTable).where(eq(tripsTable.id, parsed.data.id));
  res.status(204).send();
});

router.get("/trucks", async (req, res) => {
  const result = await db
    .select({
      truckId: tripsTable.truckId,
      tripCount: sql<number>`count(*)`,
      totalRevenue: sql<number>`sum(${tripsTable.revenueAmount})`,
    })
    .from(tripsTable)
    .groupBy(tripsTable.truckId)
    .orderBy(desc(sql`sum(${tripsTable.revenueAmount})`));

  res.json(
    result.map((r) => ({
      truckId: r.truckId,
      tripCount: Number(r.tripCount),
      totalRevenue: Number(r.totalRevenue ?? 0),
    }))
  );
});

export default router;
