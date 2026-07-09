import { pgTable, serial, text, numeric, date, timestamp } from "drizzle-orm/pg-core";

export const employeeAdvancesTable = pgTable("employee_advances", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  tipoFuncionario: text("tipo_funcionario").notNull().default(""),
  data: date("data").notNull(),
  descricao: text("descricao").notNull().default(""),
  valor: numeric("valor", { precision: 12, scale: 2 }).notNull().default("0"),
  tipo: text("tipo").notNull().default("Adiantamento"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
