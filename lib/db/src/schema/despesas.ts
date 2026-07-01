import { pgTable, serial, text, numeric, date, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const despesasTable = pgTable(
  "despesas",
  {
    id: serial("id").primaryKey(),
    data: date("data").notNull(),
    frota: text("frota").notNull(),
    cidade: text("cidade").notNull().default(""),
    motoristaNome: text("motorista_nome").notNull().default(""),
    ajudanteNome: text("ajudante_nome").notNull().default(""),
    frete: numeric("frete", { precision: 12, scale: 2 }).notNull().default("0"),
    km: numeric("km", { precision: 12, scale: 2 }).notNull().default("0"),
    dieselLt: numeric("diesel_lt", { precision: 12, scale: 2 }).notNull().default("0"),
    dieselRs: numeric("diesel_rs", { precision: 12, scale: 2 }).notNull().default("0"),
    das: numeric("das", { precision: 12, scale: 2 }).notNull().default("0"),
    motorista: numeric("motorista", { precision: 12, scale: 2 }).notNull().default("0"),
    almoco: numeric("almoco", { precision: 12, scale: 2 }).notNull().default("0"),
    ajudante: numeric("ajudante", { precision: 12, scale: 2 }).notNull().default("0"),
    pedagio: numeric("pedagio", { precision: 12, scale: 2 }).notNull().default("0"),
    unimed: numeric("unimed", { precision: 12, scale: 2 }).notNull().default("0"),
    seguro: numeric("seguro", { precision: 12, scale: 2 }).notNull().default("0"),
    gasto: numeric("gasto", { precision: 12, scale: 2 }).notNull().default("0"),
    rastreador: numeric("rastreador", { precision: 12, scale: 2 }).notNull().default("0"),
    inss: numeric("inss", { precision: 12, scale: 2 }).notNull().default("0"),
    escritorio: numeric("escritorio", { precision: 12, scale: 2 }).notNull().default("0"),
    ipva: numeric("ipva", { precision: 12, scale: 2 }).notNull().default("0"),
    bsoft: numeric("bsoft", { precision: 12, scale: 2 }).notNull().default("0"),
    lucro: numeric("lucro", { precision: 12, scale: 2 }).notNull().default("0"),
    trocaOleoParcela: text("troca_oleo_parcela").notNull().default(""),
    obs: text("obs"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    frotaDataUnique: uniqueIndex("despesas_frota_data_unique").on(t.frota, t.data),
  }),
);

export type Despesa = typeof despesasTable.$inferSelect;
