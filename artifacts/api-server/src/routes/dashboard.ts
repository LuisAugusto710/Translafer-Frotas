import { Router } from "express";
import { db, tripsTable } from "@workspace/db";
import { gte, lte, and, sql } from "drizzle-orm";

const router = Router();

function toDateStr(value: string | Date | undefined): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function dateConditions(dateFrom?: string, dateTo?: string) {
  const conditions = [];
  if (dateFrom) conditions.push(gte(tripsTable.date, dateFrom));
  if (dateTo) conditions.push(lte(tripsTable.date, dateTo));
  return conditions.length > 0 ? and(...conditions) : undefined;
}

router.get("/dashboard/summary", async (req, res) => {
  const dateFrom = toDateStr(req.query.dateFrom as string | undefined);
  const dateTo = toDateStr(req.query.dateTo as string | undefined);
  const where = dateConditions(dateFrom, dateTo);

  const [summary] = await db
    .select({
      grossRevenue: sql<number>`coalesce(sum(${tripsTable.revenueAmount}), 0)`,
      totalFuel: sql<number>`coalesce(sum(${tripsTable.fuelCost}), 0)`,
      totalOther: sql<number>`coalesce(sum(${tripsTable.otherExpenses}), 0)`,
      totalTrips: sql<number>`count(*)`,
    })
    .from(tripsTable)
    .where(where);

  const grossRevenue = Number(summary.grossRevenue);
  const totalExpenses = Number(summary.totalFuel) + Number(summary.totalOther);
  const netProfit = grossRevenue - totalExpenses;
  const totalTrips = Number(summary.totalTrips);
  const profitMargin = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;
  const avgRevenuePerTrip = totalTrips > 0 ? grossRevenue / totalTrips : 0;

  const truckStats = await db
    .select({
      truckId: tripsTable.truckId,
      totalRevenue: sql<number>`sum(${tripsTable.revenueAmount})`,
    })
    .from(tripsTable)
    .where(where)
    .groupBy(tripsTable.truckId)
    .orderBy(sql`sum(${tripsTable.revenueAmount}) desc`);

  const bestTruck = truckStats.length > 0 ? truckStats[0].truckId : null;
  const worstTruck = truckStats.length > 0 ? truckStats[truckStats.length - 1].truckId : null;

  res.json({
    grossRevenue,
    totalExpenses,
    netProfit,
    profitMargin: Math.round(profitMargin * 100) / 100,
    totalTrips,
    avgRevenuePerTrip: Math.round(avgRevenuePerTrip * 100) / 100,
    bestTruck,
    worstTruck,
  });
});

router.get("/dashboard/by-truck", async (req, res) => {
  const dateFrom = toDateStr(req.query.dateFrom as string | undefined);
  const dateTo = toDateStr(req.query.dateTo as string | undefined);
  const where = dateConditions(dateFrom, dateTo);

  const result = await db
    .select({
      truckId: tripsTable.truckId,
      totalRevenue: sql<number>`sum(${tripsTable.revenueAmount})`,
      totalFuel: sql<number>`sum(${tripsTable.fuelCost})`,
      totalOther: sql<number>`sum(${tripsTable.otherExpenses})`,
      tripCount: sql<number>`count(*)`,
    })
    .from(tripsTable)
    .where(where)
    .groupBy(tripsTable.truckId)
    .orderBy(sql`sum(${tripsTable.revenueAmount}) desc`);

  res.json(
    result.map((r, idx) => {
      const totalRevenue = Number(r.totalRevenue);
      const totalExpenses = Number(r.totalFuel) + Number(r.totalOther);
      const netProfit = totalRevenue - totalExpenses;
      const tripCount = Number(r.tripCount);
      return {
        truckId: r.truckId,
        totalRevenue,
        totalExpenses,
        netProfit,
        tripCount,
        avgRevenuePerTrip: tripCount > 0 ? Math.round((totalRevenue / tripCount) * 100) / 100 : 0,
        rank: idx + 1,
      };
    })
  );
});

router.get("/dashboard/by-period", async (req, res) => {
  const { period } = req.query as { period?: string };
  const dateFrom = toDateStr(req.query.dateFrom as string | undefined);
  const dateTo = toDateStr(req.query.dateTo as string | undefined);

  if (!period) {
    res.status(400).json({ error: "period is required" });
    return;
  }

  const allowedPeriods: Record<string, string> = {
    daily: "day",
    weekly: "week",
    monthly: "month",
    quarterly: "quarter",
    yearly: "year",
  };

  const truncFn = allowedPeriods[period];
  if (!truncFn) {
    res.status(400).json({ error: "Invalid period" });
    return;
  }

  const where = dateConditions(dateFrom, dateTo);

  const result = await db
    .select({
      period: sql<string>`to_char(date_trunc('${sql.raw(truncFn)}', ${tripsTable.date}::date), 'YYYY-MM-DD')`,
      revenue: sql<number>`sum(${tripsTable.revenueAmount})`,
      fuel: sql<number>`sum(${tripsTable.fuelCost})`,
      other: sql<number>`sum(${tripsTable.otherExpenses})`,
      tripCount: sql<number>`count(*)`,
    })
    .from(tripsTable)
    .where(where)
    .groupBy(sql`date_trunc('${sql.raw(truncFn)}', ${tripsTable.date}::date)`)
    .orderBy(sql`date_trunc('${sql.raw(truncFn)}', ${tripsTable.date}::date)`);

  res.json(
    result.map((r) => {
      const revenue = Number(r.revenue);
      const expenses = Number(r.fuel) + Number(r.other);
      return {
        period: r.period,
        revenue,
        expenses,
        netProfit: revenue - expenses,
        tripCount: Number(r.tripCount),
      };
    })
  );
});

router.get("/dashboard/annual", async (req, res) => {
  const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
  const dateFrom = `${year}-01-01`;
  const dateTo = `${year}-12-31`;
  const where = dateConditions(dateFrom, dateTo);

  const [totals] = await db
    .select({
      totalRevenue: sql<number>`coalesce(sum(${tripsTable.revenueAmount}), 0)`,
      totalFuel: sql<number>`coalesce(sum(${tripsTable.fuelCost}), 0)`,
      totalOther: sql<number>`coalesce(sum(${tripsTable.otherExpenses}), 0)`,
      totalTrips: sql<number>`count(*)`,
    })
    .from(tripsTable)
    .where(where);

  const totalRevenue = Number(totals.totalRevenue);
  const totalExpenses = Number(totals.totalFuel) + Number(totals.totalOther);
  const totalTrips = Number(totals.totalTrips);

  const monthly = await db
    .select({
      period: sql<string>`to_char(date_trunc('month', ${tripsTable.date}::date), 'YYYY-MM-DD')`,
      revenue: sql<number>`sum(${tripsTable.revenueAmount})`,
      fuel: sql<number>`sum(${tripsTable.fuelCost})`,
      other: sql<number>`sum(${tripsTable.otherExpenses})`,
      tripCount: sql<number>`count(*)`,
    })
    .from(tripsTable)
    .where(where)
    .groupBy(sql`date_trunc('month', ${tripsTable.date}::date)`)
    .orderBy(sql`date_trunc('month', ${tripsTable.date}::date)`);

  res.json({
    year,
    totalRevenue,
    totalExpenses,
    netProfit: totalRevenue - totalExpenses,
    totalTrips,
    avgRevenuePerTrip: totalTrips > 0 ? Math.round((totalRevenue / totalTrips) * 100) / 100 : 0,
    monthlyTrend: monthly.map((r) => {
      const revenue = Number(r.revenue);
      const expenses = Number(r.fuel) + Number(r.other);
      return {
        period: r.period,
        revenue,
        expenses,
        netProfit: revenue - expenses,
        tripCount: Number(r.tripCount),
      };
    }),
  });
});

router.get("/dashboard/expenses-comparison", async (req, res) => {
  const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
  const dateFrom = `${year}-01-01`;
  const dateTo = `${year}-12-31`;
  const where = dateConditions(dateFrom, dateTo);

  const result = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${tripsTable.date}::date), 'Mon YYYY')`,
      revenue: sql<number>`sum(${tripsTable.revenueAmount})`,
      fuelCost: sql<number>`sum(${tripsTable.fuelCost})`,
      otherExpenses: sql<number>`sum(${tripsTable.otherExpenses})`,
    })
    .from(tripsTable)
    .where(where)
    .groupBy(sql`date_trunc('month', ${tripsTable.date}::date)`)
    .orderBy(sql`date_trunc('month', ${tripsTable.date}::date)`);

  res.json(
    result.map((r) => {
      const revenue = Number(r.revenue);
      const fuelCost = Number(r.fuelCost);
      const otherExpenses = Number(r.otherExpenses);
      return {
        month: r.month,
        revenue,
        fuelCost,
        otherExpenses,
        netProfit: revenue - fuelCost - otherExpenses,
      };
    })
  );
});

export default router;
