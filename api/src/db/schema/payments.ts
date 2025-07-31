import { date, integer } from "drizzle-orm/pg-core";
import { text, varchar } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";

export const payments = pgTable("payments", {
  correlationId: text().primaryKey(),
  amountInCents: integer().notNull(),
  requestedAt: date({ mode: "date" }).notNull(),
  processor: varchar({ length: 20 }),
  createdAt: date({ mode: "date" }).notNull().defaultNow(),
});
