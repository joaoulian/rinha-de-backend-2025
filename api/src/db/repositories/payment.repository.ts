import type { FastifyBaseLogger } from "fastify";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { DrizzleDB } from "../database-manager";
import { payments } from "../schema/payments";

export interface CreatePaymentInput {
  correlationId: string;
  amountInCents: number;
  requestedAt: Date;
  processor?: "default" | "fallback";
}

export interface PaymentSummaryQuery {
  from?: Date;
  to?: Date;
}

export interface PaymentSummary {
  totalRequests: number;
  totalAmount: number;
}

export interface PaymentServiceDeps {
  db: DrizzleDB;
  logger: FastifyBaseLogger;
}

export class PaymentRepository {
  private readonly db: DrizzleDB;
  private readonly logger: FastifyBaseLogger;

  constructor(deps: PaymentServiceDeps) {
    this.db = deps.db;
    this.logger = deps.logger;
  }

  async createPayment(input: CreatePaymentInput): Promise<void> {
    try {
      await this.db.insert(payments).values({
        correlationId: input.correlationId,
        amountInCents: input.amountInCents,
        requestedAt: input.requestedAt,
        processor: input.processor,
      });
      this.logger.info(
        {
          correlationId: input.correlationId,
          amountInCents: input.amountInCents,
        },
        "Payment record created"
      );
    } catch (error) {
      this.logger.error(
        { error, correlationId: input.correlationId },
        "Failed to create payment record"
      );
      throw error;
    }
  }

  async getPaymentByCorrelationId(correlationId: string) {
    try {
      const result = await this.db
        .select()
        .from(payments)
        .where(eq(payments.correlationId, correlationId))
        .limit(1);

      return result[0] || null;
    } catch (error) {
      this.logger.error(
        { error, correlationId },
        "Failed to get payment by correlation ID"
      );
      throw error;
    }
  }

  async getPaymentSummaryByProcessor(
    processor: "fallback" | "default",
    query: PaymentSummaryQuery = {}
  ): Promise<PaymentSummary> {
    try {
      const conditions = [eq(payments.processor, processor)];
      if (query.from) {
        conditions.push(gte(payments.requestedAt, query.from));
      }
      if (query.to) {
        conditions.push(lte(payments.requestedAt, query.to));
      }
      const result = await this.db
        .select({
          totalRequests: sql<number>`count(*)::int`,
          totalAmount: sql<number>`sum(${payments.amountInCents})::int`,
        })
        .from(payments)
        .where(and(...conditions));
      return {
        totalRequests: result[0]?.totalRequests || 0,
        totalAmount: result[0]?.totalAmount || 0,
      };
    } catch (error) {
      this.logger.error(
        { error, processor, query },
        "Failed to get payment summary by processor"
      );
      throw error;
    }
  }

  async updatePaymentProcessor(
    correlationId: string,
    processor: "fallback" | "default"
  ): Promise<boolean> {
    try {
      const result = await this.db
        .update(payments)
        .set({ processor })
        .where(eq(payments.correlationId, correlationId));
      const updated = (result.rowCount ?? 0) > 0;
      if (updated) {
        this.logger.info(
          { correlationId, processor },
          "Payment processor updated"
        );
      }
      return updated;
    } catch (error) {
      this.logger.error(
        { error, correlationId, processor },
        "Failed to update payment processor"
      );
      throw error;
    }
  }
}
