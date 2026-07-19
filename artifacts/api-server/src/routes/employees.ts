import { Router } from "express";
import { db, despesasTable, employeeAdvancesTable } from "@workspace/db";
import { sql, and, eq, gte, lte } from "drizzle-orm";

const router = Router();

router.get("/employees", async (_req, res) => {
  const [motoristas, ajudantes] = await Promise.all([
    db.selectDistinct({ nome: despesasTable.motoristaNome })
      .from(despesasTable)
      .where(sql`coalesce(trim(${despesasTable.motoristaNome}), '') <> ''`),
    db.selectDistinct({ nome: despesasTable.ajudanteNome })
      .from(despesasTable)
      .where(sql`coalesce(trim(${despesasTable.ajudanteNome}), '') <> ''`),
  ]);

  const employees = [
    ...motoristas.map(r => ({ nome: r.nome, tipo: "Motorista" as const })),
    ...ajudantes.map(r => ({ nome: r.nome, tipo: "Ajudante" as const })),
  ].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  res.json(employees);
});

router.get("/employees/active", async (req, res) => {
  const { dateFrom, dateTo } = req.query as Record<string, string>;

  if (!dateFrom || !dateTo) {
    return res.status(400).json({ error: "dateFrom and dateTo are required" });
  }

  const dateFilter = (nameCol: typeof despesasTable.motoristaNome) =>
    and(
      sql`coalesce(trim(${nameCol}), '') <> ''`,
      gte(despesasTable.data, dateFrom),
      lte(despesasTable.data, dateTo),
    );

  const [motoristas, ajudantes] = await Promise.all([
    db.selectDistinct({ nome: despesasTable.motoristaNome })
      .from(despesasTable)
      .where(dateFilter(despesasTable.motoristaNome)),
    db.selectDistinct({ nome: despesasTable.ajudanteNome })
      .from(despesasTable)
      .where(dateFilter(despesasTable.ajudanteNome)),
  ]);

  const employees = [
    ...motoristas.map(r => ({ nome: r.nome, tipo: "Motorista" as const })),
    ...ajudantes.map(r => ({ nome: r.nome, tipo: "Ajudante" as const })),
  ].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  res.json(employees);
});

router.get("/employees/calendar", async (req, res) => {
  const { nome, tipo, dateFrom, dateTo } = req.query as Record<string, string>;

  if (!nome || !tipo || !dateFrom || !dateTo) {
    return res.status(400).json({ error: "nome, tipo, dateFrom, dateTo are required" });
  }

  const startDate = new Date(`${dateFrom}T00:00:00`);
  const endDate   = new Date(`${dateTo}T00:00:00`);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate > endDate) {
    return res.status(400).json({ error: "Invalid dateFrom or dateTo" });
  }

  const totalDays = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  if (totalDays > 400) {
    return res.status(400).json({ error: "Range too large (max 400 days)" });
  }

  const valueCol = tipo === "Motorista" ? despesasTable.motorista : despesasTable.ajudante;
  const nameCol  = tipo === "Motorista" ? despesasTable.motoristaNome : despesasTable.ajudanteNome;

  const records = await db
    .select({
      data:  despesasTable.data,
      valor: sql<number>`coalesce(sum(${valueCol}), 0)`,
    })
    .from(despesasTable)
    .where(and(
      eq(nameCol, nome),
      gte(despesasTable.data, dateFrom),
      lte(despesasTable.data, dateTo),
    ))
    .groupBy(despesasTable.data)
    .orderBy(despesasTable.data);

  const workedMap = new Map<string, number>();
  for (const r of records) {
    workedMap.set(r.data, Math.round(Number(r.valor) * 100) / 100);
  }

  const dias = [];
  const cursor = new Date(startDate);
  for (let i = 0; i < totalDays; i++) {
    const date  = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    const valor = workedMap.get(date) ?? 0;
    dias.push({ date, worked: workedMap.has(date), valor });
    cursor.setDate(cursor.getDate() + 1);
  }

  const totalGanho         = dias.reduce((s, d) => s + d.valor, 0);
  const diasTrabalhados    = dias.filter(d => d.worked).length;
  const diasNaoTrabalhados = totalDays - diasTrabalhados;
  const mediaPorDia        = diasTrabalhados > 0 ? totalGanho / diasTrabalhados : 0;

  return res.json({
    dias,
    totalGanho:         Math.round(totalGanho * 100) / 100,
    diasTrabalhados,
    diasNaoTrabalhados,
    mediaPorDia:        Math.round(mediaPorDia * 100) / 100,
  });
});

// ── Employee Advances ──────────────────────────────────────────────────────────
router.get("/employees/advances", async (req, res) => {
  const { nome, tipoFuncionario, dateFrom, dateTo } = req.query as Record<string, string>;

  const conditions = [];
  if (nome)            conditions.push(eq(employeeAdvancesTable.nome, nome));
  if (tipoFuncionario) conditions.push(eq(employeeAdvancesTable.tipoFuncionario, tipoFuncionario));
  if (dateFrom)        conditions.push(gte(employeeAdvancesTable.data, dateFrom));
  if (dateTo)          conditions.push(lte(employeeAdvancesTable.data, dateTo));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db.select().from(employeeAdvancesTable).where(where)
    .orderBy(employeeAdvancesTable.data);

  res.json(rows.map(r => ({
    ...r,
    valor: Number(r.valor),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  })));
});

router.post("/employees/advances", async (req, res) => {
  const { nome, tipoFuncionario, data, descricao, valor, tipo } = req.body;

  const [row] = await db.insert(employeeAdvancesTable).values({
    nome:            nome ?? "",
    tipoFuncionario: tipoFuncionario ?? "",
    data,
    descricao:       descricao ?? "",
    valor:           String(valor ?? 0),
    tipo:            tipo ?? "Adiantamento",
  }).returning();

  res.status(201).json({
    ...row,
    valor: Number(row.valor),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
});

router.put("/employees/advances/:id", async (req, res) => {
  const { nome, tipoFuncionario, data, descricao, valor, tipo } = req.body;

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (nome !== undefined)            update.nome = nome;
  if (tipoFuncionario !== undefined) update.tipoFuncionario = tipoFuncionario;
  if (data !== undefined)            update.data = data;
  if (descricao !== undefined)       update.descricao = descricao;
  if (valor !== undefined)           update.valor = String(valor);
  if (tipo !== undefined)            update.tipo = tipo;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [row] = await db.update(employeeAdvancesTable).set(update as any)
    .where(eq(employeeAdvancesTable.id, Number(req.params.id))).returning();

  if (!row) { res.status(404).json({ error: "Não encontrado" }); return; }
  res.json({
    ...row,
    valor: Number(row.valor),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
});

router.delete("/employees/advances/:id", async (req, res) => {
  await db.delete(employeeAdvancesTable)
    .where(eq(employeeAdvancesTable.id, Number(req.params.id)));
  res.status(204).send();
});

export default router;
