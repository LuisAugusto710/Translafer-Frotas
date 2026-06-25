import { pgTable, serial, text, numeric, date, timestamp } from "drizzle-orm/pg-core";

export const fretesTable = pgTable("fretes", {
  id: serial("id").primaryKey(),
  dataCte: date("data_cte").notNull(),
  origem: text("origem").notNull(),
  transporte: text("transporte"),
  frota: text("frota").notNull(),
  transp: text("transp"),
  cliente: text("cliente").notNull(),
  cidade: text("cidade").notNull(),
  cteNf: text("cte_nf"),
  peso: numeric("peso", { precision: 12, scale: 2 }).notNull().default("0"),
  frete: numeric("frete", { precision: 12, scale: 2 }).notNull().default("0"),
  pedagio: numeric("pedagio", { precision: 12, scale: 2 }).notNull().default("0"),
  dtaFrete: date("dta_frete"),
  vencimento: date("vencimento"),
  obs: text("obs"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Frete = typeof fretesTable.$inferSelect;
