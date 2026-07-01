import { Router } from "express";
import { db, fretesTable, abastecimentosTable, despesasTable } from "@workspace/db";
import { gte, lte, and, eq, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

const router = Router();

// Cost columns that make up "total despesa" (KM and Diesel LT are metrics, not costs).
const DESPESA_CATEGORIAS: Array<{ label: string; col: AnyPgColumn }> = [
  { label: "Diesel", col: despesasTable.dieselRs },
  { label: "DAS", col: despesasTable.das },
  { label: "Motorista", col: despesasTable.motorista },
  { label: "Almoço", col: despesasTable.almoco },
  { label: "Ajudante", col: despesasTable.ajudante },
  { label: "Pedágio", col: despesasTable.pedagio },
  { label: "Unimed", col: despesasTable.unimed },
  { label: "Seguro", col: despesasTable.seguro },
  { label: "Gasto", col: despesasTable.gasto },
  { label: "Rastreador", col: despesasTable.rastreador },
  { label: "INSS", col: despesasTable.inss },
  { label: "Escritório", col: despesasTable.escritorio },
  { label: "IPVA", col: despesasTable.ipva },
  { label: "Bsoft", col: despesasTable.bsoft },
];

const despesaCustosSql = sql<number>`coalesce(${despesasTable.dieselRs},0)+coalesce(${despesasTable.das},0)+coalesce(${despesasTable.motorista},0)+coalesce(${despesasTable.almoco},0)+coalesce(${despesasTable.ajudante},0)+coalesce(${despesasTable.pedagio},0)+coalesce(${despesasTable.unimed},0)+coalesce(${despesasTable.seguro},0)+coalesce(${despesasTable.gasto},0)+coalesce(${despesasTable.rastreador},0)+coalesce(${despesasTable.inss},0)+coalesce(${despesasTable.escritorio},0)+coalesce(${despesasTable.ipva},0)+coalesce(${despesasTable.bsoft},0)`;

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
  const where = ano ? sql`EXTRACT(YEAR FROM ${abastecimentosTable.data}) = ${ano}` : undefined;

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

router.get("/dashboard/despesas-resumo", async (req, res) => {
  const ano = req.query.ano ? Number(req.query.ano) : new Date().getFullYear();
  const dateFrom = `${ano}-01-01`;
  const dateTo = `${ano}-12-31`;
  const where = and(gte(despesasTable.data, dateFrom), lte(despesasTable.data, dateTo));

  const [summary] = await db.select({
    totalFrete: sql<number>`coalesce(sum(${despesasTable.frete}), 0)`,
    totalCustos: sql<number>`coalesce(sum(${despesaCustosSql}), 0)`,
    totalLucro: sql<number>`coalesce(sum(${despesasTable.lucro}), 0)`,
    totalRegistros: sql<number>`count(*)`,
  }).from(despesasTable).where(where);

  const catSelect: Record<string, ReturnType<typeof sql<number>>> = {};
  DESPESA_CATEGORIAS.forEach((c, i) => {
    catSelect[`c${i}`] = sql<number>`coalesce(sum(${c.col}), 0)`;
  });
  const [catRow] = await db.select(catSelect).from(despesasTable).where(where);

  const categorias = DESPESA_CATEGORIAS
    .map((c, i) => ({ categoria: c.label, valor: Number(catRow[`c${i}`] ?? 0) }))
    .filter((c) => c.valor > 0)
    .sort((a, b) => b.valor - a.valor);

  res.json({
    totalFrete: Number(summary.totalFrete),
    totalCustos: Number(summary.totalCustos),
    totalLucro: Number(summary.totalLucro),
    totalRegistros: Number(summary.totalRegistros),
    categorias,
  });
});

router.get("/dashboard/despesas-mensal", async (req, res) => {
  const ano = req.query.ano ? Number(req.query.ano) : new Date().getFullYear();
  const dateFrom = `${ano}-01-01`;
  const dateTo = `${ano}-12-31`;
  const where = and(gte(despesasTable.data, dateFrom), lte(despesasTable.data, dateTo));

  const result = await db.select({
    mes: sql<string>`to_char(date_trunc('month', ${despesasTable.data}::date), 'YYYY-MM')`,
    frete: sql<number>`coalesce(sum(${despesasTable.frete}), 0)`,
    custos: sql<number>`coalesce(sum(${despesaCustosSql}), 0)`,
    lucro: sql<number>`coalesce(sum(${despesasTable.lucro}), 0)`,
    registros: sql<number>`count(*)`,
  }).from(despesasTable).where(where)
    .groupBy(sql`date_trunc('month', ${despesasTable.data}::date)`)
    .orderBy(sql`date_trunc('month', ${despesasTable.data}::date)`);

  const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  res.json(result.map(r => {
    const monthIdx = parseInt(r.mes.split("-")[1]) - 1;
    return {
      mes: MONTHS[monthIdx] ?? r.mes,
      frete: Number(r.frete ?? 0),
      custos: Number(r.custos ?? 0),
      lucro: Number(r.lucro ?? 0),
      registros: Number(r.registros),
    };
  }));
});

export default router;
