import { Router } from "express";
import { db, fretesTable, abastecimentosTable, despesasTable, manutencoesTable } from "@workspace/db";
import { and, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import {
  toDateStr,
  freteWhere,
  despWhere,
  abastWhere,
  manutWhere,
  despesaCustosSql,
  trocaOleoParsed,
  DESPESA_CATEGORIAS,
  getDieselAbastPerFrota,
  getTotalDieselAbast,
  getTotalManutencaoCost,
  getManutencaoCostPerFrota,
  getManutencaoCostPerMonth,
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
    totalPeso:       Number(freightSummary.totalPeso),
    mediaPorViagem:  totalViagens > 0 ? Math.round((totalGeral / totalViagens) * 100) / 100 : 0,
    melhorFrota:     bestFrota[0]?.frota ?? null,
    totalDiesel:     Number(dieselSummary.totalDiesel),
    totalLitros:     Number(dieselSummary.totalLitros),
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

  const where = freteWhere(dateFrom, dateTo, frota);

  // ── Semestral: PostgreSQL has no native semester truncation ────────────────
  if (period === "semestral") {
    const semResult = await db.select({
      periodo:      sql<string>`
        CASE
          WHEN EXTRACT(MONTH FROM ${fretesTable.dataCte}::date) <= 6
          THEN TO_CHAR(DATE_TRUNC('year',  ${fretesTable.dataCte}::date), 'YYYY-MM-DD')
          ELSE TO_CHAR(DATE_TRUNC('year',  ${fretesTable.dataCte}::date) + INTERVAL '6 months', 'YYYY-MM-DD')
        END
      `,
      totalFrete:   sql<number>`sum(${fretesTable.frete})`,
      totalPedagio: sql<number>`sum(${fretesTable.pedagio})`,
      totalViagens: sql<number>`count(*)`,
    }).from(fretesTable).where(where)
      .groupBy(sql`
        EXTRACT(YEAR FROM ${fretesTable.dataCte}::date),
        CASE WHEN EXTRACT(MONTH FROM ${fretesTable.dataCte}::date) <= 6 THEN 1 ELSE 2 END
      `)
      .orderBy(sql`
        EXTRACT(YEAR FROM ${fretesTable.dataCte}::date),
        CASE WHEN EXTRACT(MONTH FROM ${fretesTable.dataCte}::date) <= 6 THEN 1 ELSE 2 END
      `);

    res.json(semResult.map(r => ({
      periodo:      r.periodo,
      totalFrete:   Number(r.totalFrete   ?? 0),
      totalPedagio: Number(r.totalPedagio ?? 0),
      totalGeral:   Number(r.totalFrete   ?? 0) + Number(r.totalPedagio ?? 0),
      totalViagens: Number(r.totalViagens),
    })));
    return;
  }

  const trunc = allowed[period ?? ""];
  if (!trunc) { res.status(400).json({ error: "period inválido" }); return; }

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

// ── Diesel by fleet / plate ────────────────────────────────────────────────────
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

// ── Monthly comparativo (fretes + diesel) ─────────────────────────────────────
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
      diesel,
      lucroLiquido: frete + pedagio - diesel,
      viagens:      Number(r.viagens),
    };
  }));
});

// ── Despesas KPI summary ───────────────────────────────────────────────────────
// Canonical expense formula: despesaCustosSql + abastecimentos.totalPago + manutencoes.custo
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

  const [[summary], [catRow], totalDieselAbast, totalManutencao] = await Promise.all([
    db.select({
      totalFrete:     sql<number>`coalesce(sum(${despesasTable.frete}), 0)`,
      totalCustos:    sql<number>`coalesce(sum(${despesaCustosSql}), 0)`,
      totalLucro:     sql<number>`coalesce(sum(${despesasTable.lucro}), 0)`,
      totalRegistros: sql<number>`count(*)`,
    }).from(despesasTable).where(where),

    db.select(catSelect).from(despesasTable).where(where),

    getTotalDieselAbast(dateFrom, dateTo, frota),
    getTotalManutencaoCost(dateFrom, dateTo, frota),
  ]);

  // Canonical total: despesasTable costs + abastecimentos diesel + manutencoes
  const totalCustos = Number(summary.totalCustos) + totalDieselAbast + totalManutencao;
  const totalLucro  = Number(summary.totalFrete) - totalCustos;

  // Build category breakdown, merging abastecimentos diesel + manutencao as their own categories
  const categorias = [
    ...DESPESA_CATEGORIAS.map((c, i) => ({ categoria: c.label, valor: Number(catRow[`c${i}`] ?? 0) })),
    { categoria: "Troca de Óleo", valor: Number(catRow["cTrocaOleo"] ?? 0) },
  ];
  const dieselEntry = categorias.find(c => c.categoria === "Diesel");
  if (dieselEntry) {
    dieselEntry.valor += totalDieselAbast;
  } else if (totalDieselAbast > 0) {
    categorias.push({ categoria: "Diesel", valor: totalDieselAbast });
  }
  if (totalManutencao > 0) {
    categorias.push({ categoria: "Manutenção", valor: totalManutencao });
  }
  const sortedCategorias = categorias.filter(c => c.valor > 0).sort((a, b) => b.valor - a.valor);

  res.json({
    totalFrete:     Number(summary.totalFrete),
    totalCustos,
    totalLucro,
    totalRegistros: Number(summary.totalRegistros),
    categorias: sortedCategorias,
  });
});

// ── Despesas monthly ───────────────────────────────────────────────────────────
// Canonical expense formula applied per month: despesaCustosSql + abastecimentos.totalPago + manutencoes.custo
router.get("/dashboard/despesas-mensal", async (req, res) => {
  const ano      = req.query.ano ? Number(req.query.ano) : new Date().getFullYear();
  const frota    = req.query.frota ? String(req.query.frota) : undefined;
  const dateFrom = toDateStr(req.query.dateFrom) || `${ano}-01-01`;
  const dateTo   = toDateStr(req.query.dateTo)   || `${ano}-12-31`;
  const where    = despWhere(dateFrom, dateTo, frota);

  const [result, dieselMensalRows, manutMensalMap] = await Promise.all([
    db.select({
      mes:      sql<string>`to_char(date_trunc('month', ${despesasTable.data}::date), 'YYYY-MM')`,
      frete:    sql<number>`coalesce(sum(${despesasTable.frete}), 0)`,
      custos:   sql<number>`coalesce(sum(${despesaCustosSql}), 0)`,
      lucro:    sql<number>`coalesce(sum(${despesasTable.lucro}), 0)`,
      registros:sql<number>`count(*)`,
    }).from(despesasTable).where(where)
      .groupBy(sql`date_trunc('month', ${despesasTable.data}::date)`)
      .orderBy(sql`date_trunc('month', ${despesasTable.data}::date)`),

    db.select({
      mes:         sql<string>`to_char(date_trunc('month', ${abastecimentosTable.data}::date), 'YYYY-MM')`,
      totalDiesel: sql<number>`coalesce(sum(${abastecimentosTable.totalPago}), 0)`,
    }).from(abastecimentosTable).where(abastWhere(dateFrom, dateTo, frota))
      .groupBy(sql`date_trunc('month', ${abastecimentosTable.data}::date)`),

    getManutencaoCostPerMonth(dateFrom, dateTo, frota),
  ]);

  const dieselMenMap: Record<string, number> = {};
  dieselMensalRows.forEach(d => { dieselMenMap[d.mes] = Number(d.totalDiesel ?? 0); });

  const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  res.json(result.map(r => {
    const monthIdx = parseInt(r.mes.split("-")[1]) - 1;
    const diesel   = dieselMenMap[r.mes] ?? 0;
    const manut    = manutMensalMap[r.mes] ?? 0;
    // Canonical: despesas costs + abastecimentos diesel + manutencoes
    const custos   = Number(r.custos ?? 0) + diesel + manut;
    return {
      mes:      MONTHS[monthIdx] ?? r.mes,
      frete:    Number(r.frete ?? 0),
      custos,
      lucro:    Number(r.frete ?? 0) - custos,
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

// ── Average diesel price ───────────────────────────────────────────────────────
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
// Canonical expense formula: despesaCustosSql + abastecimentos diesel + manutencoes per frota
router.get("/dashboard/por-transportadora", async (req, res) => {
  const dateFrom = toDateStr(req.query.dateFrom);
  const dateTo   = toDateStr(req.query.dateTo);
  const frota    = req.query.frota ? String(req.query.frota) : undefined;
  const freteW   = freteWhere(dateFrom, dateTo, frota);
  const despW    = despWhere(dateFrom, dateTo, frota);

  const [rows, frotaTranspPairs, despPerFrota, dieselAbastMap, manutMap] = await Promise.all([
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

    db.select({
      frota:       despesasTable.frota,
      totalCustos: sql<number>`coalesce(sum(${despesaCustosSql}), 0)`,
    }).from(despesasTable).where(despW).groupBy(despesasTable.frota),

    getDieselAbastPerFrota(dateFrom, dateTo, frota),
    getManutencaoCostPerFrota(dateFrom, dateTo, frota),
  ]);

  // Build per-frota cost map using canonical formula:
  // frota custos = despesaCustosSql + abastecimentos diesel + manutencoes
  const despMap: Record<string, number> = {};
  for (const d of despPerFrota) {
    const frotaKey    = d.frota ?? "";
    const despCosts   = Number(d.totalCustos ?? 0);
    const dieselCosts = dieselAbastMap[frotaKey] ?? 0;
    const manutCosts  = manutMap[frotaKey] ?? 0;
    despMap[frotaKey] = despCosts + dieselCosts + manutCosts;
  }
  // Frotas with abastecimentos/manutencoes but no despesas entries
  for (const frotaKey of new Set([...Object.keys(dieselAbastMap), ...Object.keys(manutMap)])) {
    if (!(frotaKey in despMap)) {
      despMap[frotaKey] = (dieselAbastMap[frotaKey] ?? 0) + (manutMap[frotaKey] ?? 0);
    }
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

// ── Fleet performance ─────────────────────────────────────────────────────────
// Canonical expense formula: despesaCustosSql + abastecimentos diesel + manutencoes per frota
router.get("/dashboard/fleet-performance", async (req, res) => {
  const dateFrom = toDateStr(req.query.dateFrom);
  const dateTo   = toDateStr(req.query.dateTo);
  const frota    = req.query.frota ? String(req.query.frota) : undefined;
  const freteW   = freteWhere(dateFrom, dateTo, frota);
  const despW    = despWhere(dateFrom, dateTo, frota);

  const [fretesPerFrota, despesasPerFrota, dieselAbastMap, manutMap] = await Promise.all([
    db.select({
      frota:        fretesTable.frota,
      totalFrete:   sql<number>`sum(${fretesTable.frete})`,
      totalPedagio: sql<number>`sum(${fretesTable.pedagio})`,
      viagens:      sql<number>`count(*)`,
      totalPeso:    sql<number>`coalesce(sum(${fretesTable.peso}), 0)`,
    }).from(fretesTable).where(freteW).groupBy(fretesTable.frota),

    db.select({
      frota:       despesasTable.frota,
      totalCustos: sql<number>`coalesce(sum(${despesaCustosSql}), 0)`,
      totalKm:     sql<number>`coalesce(sum(${despesasTable.km}), 0)`,
    }).from(despesasTable).where(despW).groupBy(despesasTable.frota),

    getDieselAbastPerFrota(dateFrom, dateTo, frota),
    getManutencaoCostPerFrota(dateFrom, dateTo, frota),
  ]);

  // Canonical per-frota cost: despesaCustosSql + abastecimentos diesel + manutencoes
  const despMap: Record<string, { custos: number; km: number }> = {};
  for (const d of despesasPerFrota) {
    const frotaKey    = d.frota ?? "";
    const despCosts   = Number(d.totalCustos ?? 0);
    const dieselCosts = dieselAbastMap[frotaKey] ?? 0;
    const manutCosts  = manutMap[frotaKey] ?? 0;
    despMap[frotaKey] = {
      custos: despCosts + dieselCosts + manutCosts,
      km:     Number(d.totalKm ?? 0),
    };
  }
  // Frotas with abastecimentos/manutencoes but no despesas entries
  for (const frotaKey of new Set([...Object.keys(dieselAbastMap), ...Object.keys(manutMap)])) {
    if (!(frotaKey in despMap)) {
      despMap[frotaKey] = { custos: (dieselAbastMap[frotaKey] ?? 0) + (manutMap[frotaKey] ?? 0), km: 0 };
    }
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

// ── Available years ───────────────────────────────────────────────────────────
// Returns distinct years + the most recent year and month with data.
// Used to smart-default the Dashboard filter to the most recent period with records.
router.get("/dashboard/available-years", async (req, res) => {
  const [freYear, despYear, manutYear, latestRow] = await Promise.all([
    db.select({ yr: sql<number>`DISTINCT EXTRACT(YEAR FROM ${fretesTable.dataCte}::date)::int` }).from(fretesTable),
    db.select({ yr: sql<number>`DISTINCT EXTRACT(YEAR FROM ${despesasTable.data}::date)::int` }).from(despesasTable),
    db.select({ yr: sql<number>`DISTINCT EXTRACT(YEAR FROM ${manutencoesTable.dataManutencao}::date)::int` }).from(manutencoesTable),
    // Most recent date across all three tables — .from() required before .limit()
    db.select({
      latestDate: sql<string>`GREATEST(
        (SELECT MAX(data_cte::text)          FROM fretes),
        (SELECT MAX(data::date::text)        FROM despesas_custos),
        (SELECT MAX(data_manutencao::date::text) FROM manutencoes)
      )`,
    }).from(fretesTable).limit(1),
  ]);

  const allYears = new Set<number>();
  [...freYear, ...despYear, ...manutYear].forEach(r => {
    if (r.yr != null) allYears.add(Number(r.yr));
  });
  const years = [...allYears].sort((a, b) => a - b);

  // Derive latestYear/latestMonth from the most recent date
  const latestDateStr = latestRow[0]?.latestDate ?? null;
  const fallbackYear = new Date().getFullYear();
  const fallbackMonth = new Date().getMonth() + 1;
  let latestYear = fallbackYear;
  let latestMonth = fallbackMonth;
  if (latestDateStr) {
    const d = new Date(latestDateStr);
    if (!isNaN(d.getTime())) {
      latestYear = d.getFullYear();
      latestMonth = d.getMonth() + 1;
    }
  }

  res.json({ years, latestYear, latestMonth });
});

// ── Available months for a given year ─────────────────────────────────────────
// Returns 1-based month numbers that contain at least one record in the given year.
// Used to populate the Month dropdown with only months that have real data.
router.get("/dashboard/available-months", async (req, res) => {
  const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
  const dateFrom = `${year}-01-01`;
  const dateTo   = `${year}-12-31`;

  const [freMonths, despMonths, manutMonths] = await Promise.all([
    db.select({ mo: sql<number>`DISTINCT EXTRACT(MONTH FROM ${fretesTable.dataCte}::date)::int` })
      .from(fretesTable)
      .where(and(gte(fretesTable.dataCte, dateFrom), lte(fretesTable.dataCte, dateTo))),
    db.select({ mo: sql<number>`DISTINCT EXTRACT(MONTH FROM ${despesasTable.data}::date)::int` })
      .from(despesasTable)
      .where(and(gte(despesasTable.data, dateFrom), lte(despesasTable.data, dateTo))),
    db.select({ mo: sql<number>`DISTINCT EXTRACT(MONTH FROM ${manutencoesTable.dataManutencao}::date)::int` })
      .from(manutencoesTable)
      .where(and(gte(manutencoesTable.dataManutencao, dateFrom), lte(manutencoesTable.dataManutencao, dateTo))),
  ]);

  const allMonths = new Set<number>();
  [...freMonths, ...despMonths, ...manutMonths].forEach(r => {
    if (r.mo != null) allMonths.add(Number(r.mo));
  });
  const months = [...allMonths].sort((a, b) => a - b);
  res.json({ months });
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
