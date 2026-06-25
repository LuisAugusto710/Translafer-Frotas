import { pgTable, serial, text, numeric, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createUpdateSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tripsTable = pgTable("trips", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  truckId: text("truck_id").notNull(),
  driverName: text("driver_name").notNull(),
  customerName: text("customer_name").notNull(),
  route: text("route").notNull(),
  freightDescription: text("freight_description"),
  revenueAmount: numeric("revenue_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  fuelCost: numeric("fuel_cost", { precision: 12, scale: 2 }).notNull().default("0"),
  otherExpenses: numeric("other_expenses", { precision: 12, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTripSchema = createInsertSchema(tripsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateTripSchema = createUpdateSchema(tripsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTrip = z.infer<typeof insertTripSchema>;
export type UpdateTrip = z.infer<typeof updateTripSchema>;
export type Trip = typeof tripsTable.$inferSelect;
