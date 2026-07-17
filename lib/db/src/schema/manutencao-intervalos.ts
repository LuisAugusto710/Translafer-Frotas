import { pgTable, serial, text, numeric, timestamp } from "drizzle-orm/pg-core";

export const manutencaoIntervalosTable = pgTable("manutencao_intervalos", {
  id: serial("id").primaryKey(),
  categoria: text("categoria").notNull().unique(),
  descricao: text("descricao"),
  intervaloKm: numeric("intervalo_km", { precision: 12, scale: 2 }).notNull().default("10000"),
  avisoPercentual: numeric("aviso_percentual", { precision: 5, scale: 2 }).notNull().default("20"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ManutencaoIntervalo = typeof manutencaoIntervalosTable.$inferSelect;
