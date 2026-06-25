import { Router } from "express";
import { db, fretesTable, abastecimentosTable } from "@workspace/db";
import { gte, lte, and, eq, sql } from "drizzle-orm";

const router = Router();

function toDateStr(v: unknown): string | undefined {
  if (!v) return undefined;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

function freteWhere(dateFrom?: string, dateTo?: string) {
  const c = [];
  if (dateFrom) c.push(gte(fretesTable.dataCte, dateFrom));
  if (dateTo) c.push(lte(fretesTable.dataCte, dateTo));
  return c.length ? and(...c) : undefined;
}

router.get("/dashboard/resumo", async (req, res) => {
  const dateFrom = toDateStr(req.query.dateFrom);
  const dateTo = toDateStr(req.query.dateTo);
  const where = freteWhere(dateFrom, dateTo);

  const [freightSummary] = await db.select({
    totalFrete: sql<number>`coalesce(sum(${fretesTable.frete}), 0)`,
    totalPedagio: sql<number>`coalesce(sum(${fretesTable.pedagio}), 0)`,
    totalViagens: sql<number>`count(*)`,
    totalPeso: sql<number>`coalesce(sum(${fretesTable.peso}), 0)`,
  }).from(fretesTable).where(where);

  const [dieselSummary] = await db.select({
    totalDiesel: sql<number>`coalesce(sum(${abastecimentosTable.totalPago}), 0)`,
    totalLitros: sql<number>`coalesce(sum(${abastecimentosTable.litros}), 0)`,
  }).from(abastecimentosTable);

  const totalFrete = Number(freightSummary.totalFrete);
  const totalPedagio = Number(freightSummary.totalPedagio);
  const totalGeral = totalFrete + totalPedagio;
  const totalViagens = Number(freightSummary.totalViagens);

  const bestFrota = await db.select({
    frota: fretesTable.frota,
    total: sql<number>`sum(${fretesTable.frete})`,
  }).from(fretesTable).where(where).groupBy(fretesTable.frota).orderBy(sql`sum(${fretesTable.frete}) desc`).limit(1);

  res.json({
    totalFrete,
    totalPedagio,
    totalGeral,
    totalViagens,
    totalPeso: Number(freightSummary.totalPeso),
    mediaPorViagem: totalViagens > 0 ? Math.round((totalGeral / totalViagens) * 100) / 100 : 0,
    melhorFrota: bestFrota[0]?.frota ?? null,
    totalDiesel: Number(dieselSummary.totalDiesel),
    totalLitros: Number(dieselSummary.totalLitros),
  });
});

router.get("/dashboard/por-frota", async (req, res) => {
  const dateFrom = toDateStr(req.query.dateFrom);
  const dateTo = toDateStr(req.query.dateTo);
  const where = freteWhere(dateFrom, dateTo);

  const result = await db.select({
    frota: fretesTable.frota,
    totalFrete: sql<number>`sum(${fretesTable.frete})`,
    totalPedagio: sql<number>`sum(${fretesTable.pedagio})`,
    totalViagens: sql<number>`count(*)`,
  }).from(fretesTable).where(where).groupBy(fretesTable.frota).orderBy(sql`sum(${fretesTable.frete}) desc`);

  res.json(result.map((r, idx) => ({
    frota: r.frota,
    totalFrete: Number(r.totalFrete ?? 0),
    totalPedagio: Number(r.totalPedagio ?? 0),
    totalGeral: Number(r.totalFrete ?? 0) + Number(r.totalPedagio ?? 0),
    totalViagens: Number(r.totalViagens),
    rank: idx + 1,
  })));
});

router.get("/dashboard/por-periodo", async (req, res) => {
  const { period } = req.query as { period?: string };
  const dateFrom = toDateStr(req.query.dateFrom);
  const dateTo = toDateStr(req.query.dateTo);

  const allowed: Record<string, string> = {
    diario: "day", semanal: "week", mensal: "month", trimestral: "quarter", anual: "year",
  };
  const trunc = allowed[period ?? ""] ;
  if (!trunc) { res.status(400).json({ error: "period inválido" }); return; }

  const where = freteWhere(dateFrom, dateTo);

  const result = await db.select({
    periodo: sql<string>`to_char(date_trunc('${sql.raw(trunc)}', ${fretesTable.dataCte}::date), 'YYYY-MM-DD')`,
    totalFrete: sql<number>`sum(${fretesTable.frete})`,
    totalPedagio: sql<number>`sum(${fretesTable.pedagio})`,
    totalViagens: sql<number>`count(*)`,
  }).from(fretesTable).where(where)
    .groupBy(sql`date_trunc('${sql.raw(trunc)}', ${fretesTable.dataCte}::date)`)
    .orderBy(sql`date_trunc('${sql.raw(trunc)}', ${fretesTable.dataCte}::date)`);

  res.json(result.map(r => ({
    periodo: r.periodo,
    totalFrete: Number(r.totalFrete ?? 0),
    totalPedagio: Number(r.totalPedagio ?? 0),
    totalGeral: Number(r.totalFrete ?? 0) + Number(r.totalPedagio ?? 0),
    totalViagens: Number(r.totalViagens),
  })));
});

router.get("/dashboard/diesel-por-placa", async (req, res) => {
  const ano = req.query.ano ? Number(req.query.ano) : undefined;
  const where = ano ? eq(abastecimentosTable.ano, ano) : undefined;

  const result = await db.select({
    placa: abastecimentosTable.placa,
    totalLitros: sql<number>`sum(${abastecimentosTable.litros})`,
    totalPago: sql<number>`sum(${abastecimentosTable.totalPago})`,
    mediaGeral: sql<number>`avg(${abastecimentosTable.media})`,
    kmTotal: sql<number>`sum(${abastecimentosTable.kmPercorrido})`,
    totalAbastecimentos: sql<number>`count(*)`,
  }).from(abastecimentosTable).where(where).groupBy(abastecimentosTable.placa).orderBy(abastecimentosTable.placa);

  res.json(result.map(r => ({
    placa: r.placa,
    totalLitros: Number(r.totalLitros ?? 0),
    totalPago: Number(r.totalPago ?? 0),
    mediaGeral: r.mediaGeral != null ? Math.round(Number(r.mediaGeral) * 100) / 100 : null,
    kmTotal: r.kmTotal != null ? Number(r.kmTotal) : null,
    totalAbastecimentos: Number(r.totalAbastecimentos),
  })));
});

router.get("/dashboard/mensal", async (req, res) => {
  const ano = req.query.ano ? Number(req.query.ano) : new Date().getFullYear();
  const dateFrom = `${ano}-01-01`;
  const dateTo = `${ano}-12-31`;
  const where = freteWhere(dateFrom, dateTo);

  const fretesMensal = await db.select({
    mes: sql<string>`to_char(date_trunc('month', ${fretesTable.dataCte}::date), 'YYYY-MM')`,
    totalFrete: sql<number>`sum(${fretesTable.frete})`,
    totalPedagio: sql<number>`sum(${fretesTable.pedagio})`,
    viagens: sql<number>`count(*)`,
  }).from(fretesTable).where(where)
    .groupBy(sql`date_trunc('month', ${fretesTable.dataCte}::date)`)
    .orderBy(sql`date_trunc('month', ${fretesTable.dataCte}::date)`);

  const dieselMensal = await db.select({
    mes: sql<string>`to_char(date_trunc('month', ${abastecimentosTable.data}::date), 'YYYY-MM')`,
    totalDiesel: sql<number>`sum(${abastecimentosTable.totalPago})`,
  }).from(abastecimentosTable).where(and(
    gte(abastecimentosTable.data, dateFrom),
    lte(abastecimentosTable.data, dateTo),
  )).groupBy(sql`date_trunc('month', ${abastecimentosTable.data}::date)`)
    .orderBy(sql`date_trunc('month', ${abastecimentosTable.data}::date)`);

  const dieselMap: Record<string, number> = {};
  dieselMensal.forEach(d => { dieselMap[d.mes] = Number(d.totalDiesel ?? 0); });

  const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  res.json(fretesMensal.map(r => {
    const frete = Number(r.totalFrete ?? 0);
    const pedagio = Number(r.totalPedagio ?? 0);
    const diesel = dieselMap[r.mes] ?? 0;
    const monthIdx = parseInt(r.mes.split("-")[1]) - 1;
    return {
      mes: MONTHS[monthIdx] ?? r.mes,
      frete,
      pedagio,
      diesel,
      lucroLiquido: frete + pedagio - diesel,
      viagens: Number(r.viagens),
    };
  }));
});

export default router;
