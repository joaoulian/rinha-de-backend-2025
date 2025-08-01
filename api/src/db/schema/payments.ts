import { InferSelectModel } from "drizzle-orm";
import { integer, pgEnum, timestamp } from "drizzle-orm/pg-core";
import { text } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";

export const processorEnum = pgEnum("processor", ["default", "fallback"]);

export const payments = pgTable("payments", {
  correlationId: text("correlation_id").primaryKey(),
  amountInCents: integer("amount_in_cents").notNull(),
  requestedAt: timestamp("requested_at", { mode: "date" }).notNull(),
  processor: processorEnum("processor"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export type PaymentType = InferSelectModel<typeof payments>;
