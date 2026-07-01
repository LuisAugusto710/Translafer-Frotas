import { pgTable, text, numeric, timestamp } from "drizzle-orm/pg-core";

export const fleetConfigsTable = pgTable("fleet_configs", {
  frota: text("frota").primaryKey(),
  kmPorLitro: numeric("km_por_litro", { precision: 8, scale: 2 }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type FleetConfig = typeof fleetConfigsTable.$inferSelect;
