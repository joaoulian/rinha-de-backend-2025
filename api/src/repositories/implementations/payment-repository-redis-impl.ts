import { FastifyBaseLogger } from "fastify";
import Redis from "ioredis";
import {
  CreatePaymentInput,
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

  async createPayment(input: CreatePaymentInput): Promise<PaymentData> {
    try {
      const paymentData: PaymentData = {
        correlationId: input.correlationId,
        amountInCents: input.amountInCents,
        requestedAt: input.requestedAt,
        processor: input.processor,
      };
      this.redis.lpush(this.PAYMENTS_LIST_KEY, JSON.stringify(paymentData));
      this.logger.info(
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
