import { FastifyBaseLogger } from "fastify";
import Redis from "ioredis";
import {
  PaymentData,
  PaymentRepository,
  PaymentSummary,
  PaymentSummaryQuery,
} from "../payment-repository";

export interface PaymentRepositoryRedisImplDeps {
  redis: Redis;
  logger: FastifyBaseLogger;
}

export class PaymentRepositoryRedisImpl implements PaymentRepository {
  private readonly redis: Redis;
  private readonly logger: FastifyBaseLogger;
  private readonly PAYMENTS_LIST_KEY = "payments:list";

  constructor(deps: PaymentRepositoryRedisImplDeps) {
    this.redis = deps.redis;
    this.logger = deps.logger;
  }

  async bulkCreatePayments(input: PaymentData[]): Promise<PaymentData[]> {
    if (input.length === 0) {
      return input;
    }
    try {
      const pipeline = this.redis.pipeline();
      const serializedPayments = input.map((paymentData) =>
        JSON.stringify(paymentData)
      );
      if (serializedPayments.length > 0) {
        pipeline.rpush(this.PAYMENTS_LIST_KEY, ...serializedPayments);
      }
      const results = await pipeline.exec();
      if (results && results.some(([err]) => err)) {
        const errors = results.filter(([err]) => err).map(([err]) => err);
        throw new Error(
          `Pipeline execution failed: ${errors
            .map((e) => e?.message)
            .join(", ")}`
        );
      }
      this.logger.debug(
        {
          count: input.length,
          correlationIds: input.map((p) => p.correlationId),
          processors: input.map((p) => p.processor),
        },
        "Bulk payments created in Redis"
      );
      return input;
    } catch (error) {
      this.logger.error(
        {
          error,
          inputCount: input.length,
          correlationIds: input.map((i) => i.correlationId),
        },
        "Failed to bulk create payments in Redis"
      );
      throw error;
    }
  }

  async createPayment(input: PaymentData): Promise<PaymentData> {
    try {
      const paymentData: PaymentData = {
        correlationId: input.correlationId,
        amountInCents: input.amountInCents,
        requestedAt: input.requestedAt,
        processor: input.processor,
      };
      this.redis.lpush(this.PAYMENTS_LIST_KEY, JSON.stringify(paymentData));
      this.logger.debug(
        { correlationId: input.correlationId, processor: input.processor },
        "Payment created in Redis"
      );
      return paymentData;
    } catch (error) {
      this.logger.error({ error, input }, "Failed to create payment in Redis");
      throw error;
    }
  }

  async getPaymentSummary(
    query: PaymentSummaryQuery = {}
  ): Promise<PaymentSummary> {
    try {
      this.logger.debug(
        { query },
        "Getting payment summary from all payments (processor parameter ignored)"
      );
      const rawEntries = await this.redis.lrange(this.PAYMENTS_LIST_KEY, 0, -1);
      if (rawEntries.length === 0) {
        this.logger.debug({ query }, "No payments found in list");
        return {
          default: { totalRequests: 0, totalAmount: 0 },
          fallback: { totalRequests: 0, totalAmount: 0 },
        };
      }
      const summary = {
        default: {
          totalRequests: 0,
          totalAmount: 0,
        },
        fallback: {
          totalRequests: 0,
          totalAmount: 0,
        },
      };
      for (const rawEntry of rawEntries) {
        try {
          const payment: PaymentData = JSON.parse(rawEntry);
          const paymentDate = new Date(payment.requestedAt);
          if (query.from && paymentDate < query.from) {
            continue;
          }
          if (query.to && paymentDate > query.to) {
            continue;
          }
          summary[payment.processor].totalRequests++;
          summary[payment.processor].totalAmount += payment.amountInCents;
        } catch (error) {
          this.logger.error(
            { error, rawEntry },
            "Failed to parse payment data"
          );
        }
      }
      this.logger.debug(
        { query, summary },
        "Payment summary calculated from all payments (processor ignored)"
      );
      return summary;
    } catch (error) {
      this.logger.error(
        { error, query },
        "Failed to get payment summary from Redis"
      );
      throw error;
    }
  }
}
