import { pgTable, serial, text, numeric, date, integer, timestamp } from "drizzle-orm/pg-core";

export const abastecimentosTable = pgTable("abastecimentos", {
  id: serial("id").primaryKey(),
  mes: text("mes").notNull(),
  ano: integer("ano").notNull(),
  requisicao: text("requisicao"),
  posto: text("posto"),
  data: date("data").notNull(),
  placa: text("placa").notNull(),
  litros: numeric("litros", { precision: 10, scale: 3 }).notNull().default("0"),
  precoLitro: numeric("preco_litro", { precision: 10, scale: 4 }).notNull().default("0"),
  totalPago: numeric("total_pago", { precision: 12, scale: 2 }).notNull().default("0"),
  kmInicio: numeric("km_inicio", { precision: 12, scale: 1 }),
  kmFinal: numeric("km_final", { precision: 12, scale: 1 }),
  kmPercorrido: numeric("km_percorrido", { precision: 12, scale: 1 }),
  media: numeric("media", { precision: 8, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Abastecimento = typeof abastecimentosTable.$inferSelect;
