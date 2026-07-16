import { pgTable, serial, text, numeric, date, timestamp } from "drizzle-orm/pg-core";

export const manutencoesTable = pgTable("manutencoes", {
  id: serial("id").primaryKey(),
  dataManutencao: date("data_manutencao").notNull(),
  frota: text("frota").notNull(),
  km: numeric("km", { precision: 12, scale: 2 }).notNull().default("0"),
  tipo: text("tipo").notNull(),
  procedimento: text("procedimento").notNull(),
  categoria: text("categoria").notNull(),
  oficina: text("oficina").notNull(),
  custo: numeric("custo", { precision: 12, scale: 2 }).notNull().default("0"),
  obs: text("obs"),
  anexoNome: text("anexo_nome"),
  anexoTipo: text("anexo_tipo"),
  anexoDados: text("anexo_dados"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Manutencao = typeof manutencoesTable.$inferSelect;
