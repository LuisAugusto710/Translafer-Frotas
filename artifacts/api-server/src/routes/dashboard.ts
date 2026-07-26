import { Router } from "express";
import { db, fretesTable, abastecimentosTable, despesasTable } from "@workspace/db";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import {
  toDateStr,
  freteWhere,
  despWhere,
  abastWhere,
  despesaCustosSql,
  trocaOleoParsed,
  DESPESA_CATEGORIAS,
} from "../lib/financial";

const router = Router();

// ── Summary KPIs ──────────────────────────────────────────────────────────────
router.get("/dashboard/resumo", async (req, res) => {
  const dateFrom = toDateStr(req.query.dateFrom);
  const dateTo   = toDateStr(req.query.dateTo);
  const frota    = req.query.frota ? String(req.query.frota) : undefined;
  const where    = freteWhere(dateFrom, dateTo, frota);

  const [[freightSummary], [dieselSummary], bestFrota] = await Promise.all([
    db.select({
      totalFrete:   sql<number>`coalesce(sum(${fretesTable.frete}), 0)`,
      totalPedagio: sql<number>`coalesce(sum(${fretesTable.pedagio}), 0)`,
      totalViagens: sql<number>`count(*)`,
      totalPeso:    sql<number>`coalesce(sum(${fretesTable.peso}), 0)`,
    }).from(fretesTable).where(where),

    // abastecimentos diesel is a METRIC only (liters, efficiency) — shown as info, not added to expenses
    db.select({
      totalDiesel: sql<number>`coalesce(sum(${abastecimentosTable.totalPago}), 0)`,
      totalLitros: sql<number>`coalesce(sum(${abastecimentosTable.litros}), 0)`,
    }).from(abastecimentosTable).where(abastWhere(dateFrom, dateTo, frota)),

    db.select({
      frota: fretesTable.frota,
      total: sql<number>`sum(${fretesTable.frete})`,
    }).from(fretesTable).where(where)
      .groupBy(fretesTable.frota)
      .orderBy(sql`sum(${fretesTable.frete}) desc`)
      .limit(1),
  ]);

  const totalFrete   = Number(freightSummary.totalFrete);
  const totalPedagio = Number(freightSummary.totalPedagio);
  const totalGeral   = totalFrete + totalPedagio;
  const totalViagens = Number(freightSummary.totalViagens);

  res.json({
    totalFrete,
    totalPedagio,
    totalGeral,
    totalViagens,
    totalPeso:      Number(freightSummary.totalPeso),
    mediaPorViagem: totalViagens > 0 ? Math.round((totalGeral / totalViagens) * 100) / 100 : 0,
    melhorFrota:    bestFrota[0]?.frota ?? null,
    totalDiesel:    Number(dieselSummary.totalDiesel), // fuel metric
    totalLitros:    Number(dieselSummary.totalLitros), // fuel metric
  });
});

// ── Revenue by fleet ───────────────────────────────────────────────────────────
router.get("/dashboard/por-frota", async (req, res) => {
  const dateFrom = toDateStr(req.query.dateFrom);
  const dateTo   = toDateStr(req.query.dateTo);
  const frota    = req.query.frota ? String(req.query.frota) : undefined;
  const where    = freteWhere(dateFrom, dateTo, frota);

  const result = await db.select({
    frota:        fretesTable.frota,
    totalFrete:   sql<number>`sum(${fretesTable.frete})`,
    totalPedagio: sql<number>`sum(${fretesTable.pedagio})`,
    totalViagens: sql<number>`count(*)`,
  }).from(fretesTable).where(where).groupBy(fretesTable.frota).orderBy(sql`sum(${fretesTable.frete}) desc`);

  res.json(result.map((r, idx) => ({
    frota:        r.frota,
    totalFrete:   Number(r.totalFrete   ?? 0),
    totalPedagio: Number(r.totalPedagio ?? 0),
    totalGeral:   Number(r.totalFrete   ?? 0) + Number(r.totalPedagio ?? 0),
    totalViagens: Number(r.totalViagens),
    rank:         idx + 1,
  })));
});

// ── Revenue over time ──────────────────────────────────────────────────────────
router.get("/dashboard/por-periodo", async (req, res) => {
  const { period } = req.query as { period?: string };
  const dateFrom   = toDateStr(req.query.dateFrom);
  const dateTo     = toDateStr(req.query.dateTo);
  const frota      = req.query.frota ? String(req.query.frota) : undefined;

  const allowed: Record<string, string> = {
    diario: "day", semanal: "week", mensal: "month", trimestral: "quarter", anual: "year",
  };
  const trunc = allowed[period ?? ""];
  if (!trunc) { res.status(400).json({ error: "period inválido" }); return; }

  const where = freteWhere(dateFrom, dateTo, frota);

  const result = await db.select({
    periodo:      sql<string>`to_char(date_trunc('${sql.raw(trunc)}', ${fretesTable.dataCte}::date), 'YYYY-MM-DD')`,
    totalFrete:   sql<number>`sum(${fretesTable.frete})`,
    totalPedagio: sql<number>`sum(${fretesTable.pedagio})`,
    totalViagens: sql<number>`count(*)`,
  }).from(fretesTable).where(where)
    .groupBy(sql`date_trunc('${sql.raw(trunc)}', ${fretesTable.dataCte}::date)`)
    .orderBy(sql`date_trunc('${sql.raw(trunc)}', ${fretesTable.dataCte}::date)`);

  res.json(result.map(r => ({
    periodo:      r.periodo,
    totalFrete:   Number(r.totalFrete   ?? 0),
    totalPedagio: Number(r.totalPedagio ?? 0),
    totalGeral:   Number(r.totalFrete   ?? 0) + Number(r.totalPedagio ?? 0),
    totalViagens: Number(r.totalViagens),
  })));
});

// ── Diesel by fleet / plate (METRIC ONLY — not used in expense calculations) ──
router.get("/dashboard/diesel-por-placa", async (req, res) => {
  const ano      = req.query.ano ? Number(req.query.ano) : undefined;
  const frota    = req.query.frota ? String(req.query.frota) : undefined;
  const dateFrom = toDateStr(req.query.dateFrom);
  const dateTo   = toDateStr(req.query.dateTo);

  const c = [];
  if (dateFrom) {
    c.push(sql`${abastecimentosTable.data} >= ${dateFrom}`);
  } else if (ano) {
    c.push(sql`EXTRACT(YEAR FROM ${abastecimentosTable.data}) = ${ano}`);
  }
  if (dateTo) c.push(sql`${abastecimentosTable.data} <= ${dateTo}`);
  if (frota)  c.push(eq(abastecimentosTable.placa, frota));
  const where = c.length ? and(...c) : undefined;

  const result = await db.select({
    placa:               abastecimentosTable.placa,
    totalLitros:         sql<number>`sum(${abastecimentosTable.litros})`,
    totalPago:           sql<number>`sum(${abastecimentosTable.totalPago})`,
    mediaGeral:          sql<number>`avg(${abastecimentosTable.media})`,
    kmTotal:             sql<number>`sum(${abastecimentosTable.kmPercorrido})`,
    totalAbastecimentos: sql<number>`count(*)`,
  }).from(abastecimentosTable).where(where).groupBy(abastecimentosTable.placa).orderBy(abastecimentosTable.placa);

  res.json(result.map(r => ({
    placa:               r.placa,
    totalLitros:         Number(r.totalLitros ?? 0),
    totalPago:           Number(r.totalPago   ?? 0),
    mediaGeral:          r.mediaGeral != null ? Math.round(Number(r.mediaGeral) * 100) / 100 : null,
    kmTotal:             r.kmTotal    != null ? Number(r.kmTotal) : null,
    totalAbastecimentos: Number(r.totalAbastecimentos),
  })));
});

// ── Monthly comparativo (revenue vs diesel fuel metric) ────────────────────────
// Note: diesel here is from abastecimentos and used as a comparative metric,
// NOT as an additional expense (diesel cost is already in despesasTable.dieselRs).
router.get("/dashboard/mensal", async (req, res) => {
  const ano    = req.query.ano ? Number(req.query.ano) : new Date().getFullYear();
  const frota  = req.query.frota ? String(req.query.frota) : undefined;
  const df     = `${ano}-01-01`;
  const dt     = `${ano}-12-31`;
  const freteW = freteWhere(df, dt, frota);

  const [fretesMensal, dieselMensal] = await Promise.all([
    db.select({
      mes:          sql<string>`to_char(date_trunc('month', ${fretesTable.dataCte}::date), 'YYYY-MM')`,
      totalFrete:   sql<number>`sum(${fretesTable.frete})`,
      totalPedagio: sql<number>`sum(${fretesTable.pedagio})`,
      viagens:      sql<number>`count(*)`,
    }).from(fretesTable).where(freteW)
      .groupBy(sql`date_trunc('month', ${fretesTable.dataCte}::date)`)
      .orderBy(sql`date_trunc('month', ${fretesTable.dataCte}::date)`),

    // abastecimentos diesel shown as a fuel consumption metric in this chart
    db.select({
      mes:         sql<string>`to_char(date_trunc('month', ${abastecimentosTable.data}::date), 'YYYY-MM')`,
      totalDiesel: sql<number>`sum(${abastecimentosTable.totalPago})`,
    }).from(abastecimentosTable).where(abastWhere(df, dt, frota))
      .groupBy(sql`date_trunc('month', ${abastecimentosTable.data}::date)`)
      .orderBy(sql`date_trunc('month', ${abastecimentosTable.data}::date)`),
  ]);

  const dieselMap: Record<string, number> = {};
  dieselMensal.forEach(d => { dieselMap[d.mes] = Number(d.totalDiesel ?? 0); });

  const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  res.json(fretesMensal.map(r => {
    const frete   = Number(r.totalFrete   ?? 0);
    const pedagio = Number(r.totalPedagio ?? 0);
    const diesel  = dieselMap[r.mes] ?? 0;
    const monthIdx = parseInt(r.mes.split("-")[1]) - 1;
    return {
      mes:          MONTHS[monthIdx] ?? r.mes,
      frete,
      pedagio,
      diesel,           // fuel metric for chart display only
      lucroLiquido: frete + pedagio - diesel,
      viagens:      Number(r.viagens),
    };
  }));
});

// ── Despesas KPI summary ───────────────────────────────────────────────────────
// CANONICAL EXPENSE FORMULA: despesaCustosSql ONLY.
// dieselRs is one of the 14 cost columns already included in despesaCustosSql.
// abastecimentosTable.totalPago is NOT added here — it would double-count diesel.
router.get("/dashboard/despesas-resumo", async (req, res) => {
  const ano      = req.query.ano ? Number(req.query.ano) : new Date().getFullYear();
  const frota    = req.query.frota ? String(req.query.frota) : undefined;
  const dateFrom = toDateStr(req.query.dateFrom) || `${ano}-01-01`;
  const dateTo   = toDateStr(req.query.dateTo)   || `${ano}-12-31`;
  const where    = despWhere(dateFrom, dateTo, frota);

  const catSelect: Record<string, ReturnType<typeof sql<number>>> = {};
  DESPESA_CATEGORIAS.forEach((c, i) => {
    catSelect[`c${i}`] = sql<number>`coalesce(sum(${c.col}), 0)`;
  });
  catSelect["cTrocaOleo"] = sql<number>`coalesce(sum(${trocaOleoParsed}), 0)`;

  const [[summary], [catRow]] = await Promise.all([
    db.select({
      totalFrete:     sql<number>`coalesce(sum(${despesasTable.frete}), 0)`,
      totalCustos:    sql<number>`coalesce(sum(${despesaCustosSql}), 0)`,
      totalRegistros: sql<number>`count(*)`,
    }).from(despesasTable).where(where),

    db.select(catSelect).from(despesasTable).where(where),
  ]);

  // Canonical total expenses = despesaCustosSql (includes dieselRs). No abastecimentos added.
  const totalCustos = Number(summary.totalCustos);
  const totalFrete  = Number(summary.totalFrete);
  const totalLucro  = totalFrete - totalCustos;

  // Build category breakdown from despesasTable columns only
  const categorias = [
    ...DESPESA_CATEGORIAS.map((c, i) => ({ categoria: c.label, valor: Number(catRow[`c${i}`] ?? 0) })),
    { categoria: "Troca de Óleo", valor: Number(catRow["cTrocaOleo"] ?? 0) },
  ];
  const sortedCategorias = categorias.filter(c => c.valor > 0).sort((a, b) => b.valor - a.valor);

  res.json({
    totalFrete,
    totalCustos,
    totalLucro,
    totalRegistros: Number(summary.totalRegistros),
    categorias: sortedCategorias,
  });
});

// ── Despesas monthly ───────────────────────────────────────────────────────────
// CANONICAL EXPENSE FORMULA per month: despesaCustosSql ONLY (no abastecimentos).
router.get("/dashboard/despesas-mensal", async (req, res) => {
  const ano      = req.query.ano ? Number(req.query.ano) : new Date().getFullYear();
  const frota    = req.query.frota ? String(req.query.frota) : undefined;
  const dateFrom = toDateStr(req.query.dateFrom) || `${ano}-01-01`;
  const dateTo   = toDateStr(req.query.dateTo)   || `${ano}-12-31`;
  const where    = despWhere(dateFrom, dateTo, frota);

  const result = await db.select({
    mes:      sql<string>`to_char(date_trunc('month', ${despesasTable.data}::date), 'YYYY-MM')`,
    frete:    sql<number>`coalesce(sum(${despesasTable.frete}), 0)`,
    custos:   sql<number>`coalesce(sum(${despesaCustosSql}), 0)`,
    registros:sql<number>`count(*)`,
  }).from(despesasTable).where(where)
    .groupBy(sql`date_trunc('month', ${despesasTable.data}::date)`)
    .orderBy(sql`date_trunc('month', ${despesasTable.data}::date)`);

  const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  res.json(result.map(r => {
    const monthIdx = parseInt(r.mes.split("-")[1]) - 1;
    const frete    = Number(r.frete  ?? 0);
    const custos   = Number(r.custos ?? 0); // canonical: despesaCustosSql only
    return {
      mes:      MONTHS[monthIdx] ?? r.mes,
      frete,
      custos,
      lucro:    frete - custos,
      registros:Number(r.registros),
    };
  }));
});

// ── Driver & assistant costs ───────────────────────────────────────────────────
router.get("/dashboard/motorista-ajudante", async (req, res) => {
  const dateFrom  = toDateStr(req.query.dateFrom);
  const dateTo    = toDateStr(req.query.dateTo);
  const frota     = req.query.frota ? String(req.query.frota) : undefined;
  const baseWhere = despWhere(dateFrom, dateTo, frota);

  const [motoristas, ajudantes] = await Promise.all([
    db.select({
      nome:  despesasTable.motoristaNome,
      total: sql<number>`coalesce(sum(${despesasTable.motorista}), 0)`,
    }).from(despesasTable)
      .where(and(baseWhere, sql`coalesce(trim(${despesasTable.motoristaNome}), '') <> ''`))
      .groupBy(despesasTable.motoristaNome),

    db.select({
      nome:  despesasTable.ajudanteNome,
      total: sql<number>`coalesce(sum(${despesasTable.ajudante}), 0)`,
    }).from(despesasTable)
      .where(and(baseWhere, sql`coalesce(trim(${despesasTable.ajudanteNome}), '') <> ''`))
      .groupBy(despesasTable.ajudanteNome),
  ]);

  const combined = [
    ...motoristas.map(r => ({ nome: r.nome ?? "", total: Math.round(Number(r.total) * 100) / 100, tipo: "Motorista" as const })),
    ...ajudantes.map(r  => ({ nome: r.nome ?? "", total: Math.round(Number(r.total) * 100) / 100, tipo: "Ajudante"  as const })),
  ].sort((a, b) => b.total - a.total);

  res.json(combined);
});

// ── Average diesel price (fuel metric) ────────────────────────────────────────
router.get("/dashboard/diesel-avg-price", async (_req, res) => {
  const [row] = await db.select({
    avgPreco:     sql<number>`avg(${abastecimentosTable.precoLitro})`,
    totalRecords: sql<number>`count(*)`,
  }).from(abastecimentosTable);

  res.json({
    avgPrecoPorLitro: row?.avgPreco != null ? Math.round(Number(row.avgPreco) * 10000) / 10000 : null,
    totalRecords:     Number(row?.totalRecords ?? 0),
  });
});

// ── Top customers ──────────────────────────────────────────────────────────────
router.get("/dashboard/top-clientes", async (req, res) => {
  const dateFrom = toDateStr(req.query.dateFrom);
  const dateTo   = toDateStr(req.query.dateTo);
  const frota    = req.query.frota ? String(req.query.frota) : undefined;
  const where    = freteWhere(dateFrom, dateTo, frota);

  const rows = await db.select({
    cliente:      fretesTable.cliente,
    totalFrete:   sql<number>`sum(${fretesTable.frete})`,
    totalPedagio: sql<number>`sum(${fretesTable.pedagio})`,
    viagens:      sql<number>`count(*)`,
  }).from(fretesTable).where(where)
    .groupBy(fretesTable.cliente)
    .orderBy(sql`sum(${fretesTable.frete}) desc`)
    .limit(10);

  res.json(rows.map(r => {
    const totalFrete   = Number(r.totalFrete   ?? 0);
    const totalPedagio = Number(r.totalPedagio ?? 0);
    const viagens      = Number(r.viagens);
    return {
      cliente:    r.cliente,
      totalFrete,
      totalPedagio,
      totalGeral: totalFrete + totalPedagio,
      viagens,
      mediaFrete: viagens > 0 ? Math.round((totalFrete / viagens) * 100) / 100 : 0,
    };
  }));
});

// ── Top destinations ───────────────────────────────────────────────────────────
router.get("/dashboard/top-cidades", async (req, res) => {
  const dateFrom = toDateStr(req.query.dateFrom);
  const dateTo   = toDateStr(req.query.dateTo);
  const frota    = req.query.frota ? String(req.query.frota) : undefined;
  const where    = freteWhere(dateFrom, dateTo, frota);

  const rows = await db.select({
    cidade:       fretesTable.cidade,
    viagens:      sql<number>`count(*)`,
    totalFrete:   sql<number>`sum(${fretesTable.frete})`,
    totalPedagio: sql<number>`sum(${fretesTable.pedagio})`,
  }).from(fretesTable).where(where)
    .groupBy(fretesTable.cidade)
    .orderBy(sql`count(*) desc`)
    .limit(10);

  res.json(rows.map(r => ({
    cidade:       r.cidade,
    viagens:      Number(r.viagens),
    totalFrete:   Number(r.totalFrete   ?? 0),
    totalPedagio: Number(r.totalPedagio ?? 0),
    totalGeral:   Number(r.totalFrete   ?? 0) + Number(r.totalPedagio ?? 0),
  })));
});

// ── Transport company stats ────────────────────────────────────────────────────
// Expenses use canonical formula: despesaCustosSql ONLY per frota.
// No abastecimentos diesel added (it is already in dieselRs inside despesaCustosSql).
router.get("/dashboard/por-transportadora", async (req, res) => {
  const dateFrom = toDateStr(req.query.dateFrom);
  const dateTo   = toDateStr(req.query.dateTo);
  const frota    = req.query.frota ? String(req.query.frota) : undefined;
  const freteW   = freteWhere(dateFrom, dateTo, frota);
  const despW    = despWhere(dateFrom, dateTo, frota);

  const [rows, frotaTranspPairs, despPerFrota] = await Promise.all([
    db.select({
      transp:       fretesTable.transp,
      viagens:      sql<number>`count(*)`,
      totalFrete:   sql<number>`sum(${fretesTable.frete})`,
      totalPedagio: sql<number>`sum(${fretesTable.pedagio})`,
    }).from(fretesTable).where(freteW)
      .groupBy(fretesTable.transp)
      .orderBy(sql`sum(${fretesTable.frete}) desc`),

    db.selectDistinct({
      transp: fretesTable.transp,
      frota:  fretesTable.frota,
    }).from(fretesTable).where(freteW),

    // Canonical: despesaCustosSql only — dieselRs is already included
    db.select({
      frota:       despesasTable.frota,
      totalCustos: sql<number>`coalesce(sum(${despesaCustosSql}), 0)`,
    }).from(despesasTable).where(despW).groupBy(despesasTable.frota),
  ]);

  const despMap: Record<string, number> = {};
  for (const d of despPerFrota) {
    despMap[d.frota ?? ""] = Number(d.totalCustos ?? 0);
  }

  const transpFrotas: Record<string, Set<string>> = {};
  for (const { transp, frota: f } of frotaTranspPairs) {
    const key = transp ?? "Sem Transportadora";
    if (!transpFrotas[key]) transpFrotas[key] = new Set();
    transpFrotas[key].add(f);
  }

  const totalGeral = rows.reduce(
    (s, r) => s + Number(r.totalFrete ?? 0) + Number(r.totalPedagio ?? 0), 0,
  );

  res.json(rows.map(r => {
    const totalFrete    = Number(r.totalFrete   ?? 0);
    const totalPedagio  = Number(r.totalPedagio ?? 0);
    const tGeral        = totalFrete + totalPedagio;
    const key           = r.transp ?? "Sem Transportadora";
    const totalDespesas = [...(transpFrotas[key] ?? [])].reduce(
      (s, f) => s + (despMap[f] ?? 0), 0,
    );
    return {
      transp:       key,
      viagens:      Number(r.viagens),
      totalFrete,
      totalPedagio,
      totalGeral:   tGeral,
      totalDespesas,
      pctTotal:     totalGeral > 0 ? Math.round((tGeral / totalGeral) * 1000) / 10 : 0,
    };
  }));
});

// ── Fleet performance ──────────────────────────────────────────────────────────
// Expenses use canonical formula: despesaCustosSql ONLY per frota.
// dieselRs is already one of the 14 columns in despesaCustosSql.
// No abastecimentos diesel added — that would double-count diesel.
router.get("/dashboard/fleet-performance", async (req, res) => {
  const dateFrom = toDateStr(req.query.dateFrom);
  const dateTo   = toDateStr(req.query.dateTo);
  const frota    = req.query.frota ? String(req.query.frota) : undefined;
  const freteW   = freteWhere(dateFrom, dateTo, frota);
  const despW    = despWhere(dateFrom, dateTo, frota);

  const [fretesPerFrota, despesasPerFrota] = await Promise.all([
    db.select({
      frota:        fretesTable.frota,
      totalFrete:   sql<number>`sum(${fretesTable.frete})`,
      totalPedagio: sql<number>`sum(${fretesTable.pedagio})`,
      viagens:      sql<number>`count(*)`,
      totalPeso:    sql<number>`coalesce(sum(${fretesTable.peso}), 0)`,
    }).from(fretesTable).where(freteW).groupBy(fretesTable.frota),

    // Canonical: despesaCustosSql only — no abastecimentos diesel
    db.select({
      frota:       despesasTable.frota,
      totalCustos: sql<number>`coalesce(sum(${despesaCustosSql}), 0)`,
      totalKm:     sql<number>`coalesce(sum(${despesasTable.km}), 0)`,
    }).from(despesasTable).where(despW).groupBy(despesasTable.frota),
  ]);

  const despMap: Record<string, { custos: number; km: number }> = {};
  for (const d of despesasPerFrota) {
    despMap[d.frota ?? ""] = { custos: Number(d.totalCustos ?? 0), km: Number(d.totalKm ?? 0) };
  }

  const result = fretesPerFrota.map(f => {
    const receita = Number(f.totalFrete ?? 0) + Number(f.totalPedagio ?? 0);
    const custos  = despMap[f.frota]?.custos ?? 0;
    const km      = despMap[f.frota]?.km     ?? 0;
    const viagens = Number(f.viagens);
    const lucro   = receita - custos;
    return {
      frota:        f.frota,
      totalReceita: receita,
      totalCustos:  custos,
      lucro,
      viagens,
      km,
      totalPeso:    Number(f.totalPeso ?? 0),
      receitaPerKm: km > 0 ? Math.round((receita / km) * 100) / 100 : null,
      lucroPerKm:   km > 0 ? Math.round((lucro   / km) * 100) / 100 : null,
    };
  }).sort((a, b) => b.totalReceita - a.totalReceita);

  res.json(result);
});

// ── Upcoming receivables (next 30 days) ────────────────────────────────────────
router.get("/dashboard/upcoming-receivables", async (req, res) => {
  const today    = new Date().toISOString().slice(0, 10);
  const in30days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const frota    = req.query.frota ? String(req.query.frota) : undefined;

  const conditions = [
    isNotNull(fretesTable.vencimento),
    sql`${fretesTable.vencimento} >= ${today}`,
    sql`${fretesTable.vencimento} <= ${in30days}`,
  ];
  if (frota) conditions.push(eq(fretesTable.frota, frota));

  const rows = await db.select({
    id:         fretesTable.id,
    dataCte:    fretesTable.dataCte,
    cliente:    fretesTable.cliente,
    frota:      fretesTable.frota,
    cidade:     fretesTable.cidade,
    frete:      fretesTable.frete,
    pedagio:    fretesTable.pedagio,
    vencimento: fretesTable.vencimento,
  }).from(fretesTable)
    .where(and(...conditions))
    .orderBy(fretesTable.vencimento)
    .limit(20);

  res.json(rows.map(r => ({
    id:           r.id,
    dataCte:      r.dataCte,
    cliente:      r.cliente,
    frota:        r.frota,
    cidade:       r.cidade,
    totalGeral:   Number(r.frete ?? 0) + Number(r.pedagio ?? 0),
    vencimento:   r.vencimento ?? null,
    diasFaltando: r.vencimento
      ? Math.ceil((new Date(r.vencimento).getTime() - new Date(today).getTime()) / 86400000)
      : null,
  })));
});

// ── Recent freight entries ─────────────────────────────────────────────────────
router.get("/dashboard/recent-fretes", async (req, res) => {
  const limit    = req.query.limit ? Math.min(Number(req.query.limit), 20) : 10;
  const frota    = req.query.frota ? String(req.query.frota) : undefined;
  const dateFrom = toDateStr(req.query.dateFrom);
  const dateTo   = toDateStr(req.query.dateTo);
  const where    = freteWhere(dateFrom, dateTo, frota);

  const rows = await db.select({
    id:      fretesTable.id,
    dataCte: fretesTable.dataCte,
    cliente: fretesTable.cliente,
    frota:   fretesTable.frota,
    cidade:  fretesTable.cidade,
    frete:   fretesTable.frete,
    pedagio: fretesTable.pedagio,
    transp:  fretesTable.transp,
  }).from(fretesTable)
    .where(where)
    .orderBy(sql`${fretesTable.dataCte} desc, ${fretesTable.id} desc`)
    .limit(limit);

  res.json(rows.map(r => ({
    id:         r.id,
    dataCte:    r.dataCte,
    cliente:    r.cliente,
    frota:      r.frota,
    cidade:     r.cidade,
    frete:      Number(r.frete   ?? 0),
    pedagio:    Number(r.pedagio ?? 0),
    totalGeral: Number(r.frete   ?? 0) + Number(r.pedagio ?? 0),
    transp:     r.transp ?? null,
  })));
});

export default router;
