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

  // Redis key patterns
  private readonly PAYMENT_KEY_PREFIX = "payment:";
  private readonly PROCESSOR_INDEX_PREFIX = "processor_index:";
  private readonly DATE_INDEX_PREFIX = "date_index:";
  private readonly SUMMARY_KEY_PREFIX = "summary:";

  // TTL for cache entries (24 hours)
  private readonly CACHE_TTL_SECONDS = 24 * 60 * 60;

  constructor(deps: PaymentRepositoryRedisImplDeps) {
    this.redis = deps.redis;
    this.logger = deps.logger;
  }

  async createPayment(input: CreatePaymentInput): Promise<void> {
    try {
      const paymentData: PaymentData = {
        correlationId: input.correlationId,
        amountInCents: input.amountInCents,
        requestedAt: input.requestedAt,
        processor: input.processor,
        createdAt: new Date(),
      };
      const paymentKey = this.getPaymentKey(input.correlationId);
      const dateKey = this.getDateKey(input.requestedAt);
      const pipeline = this.redis.pipeline();
      pipeline.setex(
        paymentKey,
        this.CACHE_TTL_SECONDS,
        JSON.stringify(paymentData)
      );
      pipeline.zadd(dateKey, input.requestedAt.getTime(), input.correlationId);
      pipeline.expire(dateKey, this.CACHE_TTL_SECONDS);
      if (input.processor) {
        const processorKey = this.getProcessorKey(input.processor);
        pipeline.zadd(
          processorKey,
          input.requestedAt.getTime(),
          input.correlationId
        );
        pipeline.expire(processorKey, this.CACHE_TTL_SECONDS);
      }
      await pipeline.exec();
      this.logger.info(
        {
          correlationId: input.correlationId,
          amountInCents: input.amountInCents,
        },
        "Payment record created in Redis"
      );
    } catch (error) {
      this.logger.error(
        { error, correlationId: input.correlationId },
        "Failed to create payment record in Redis"
      );
      throw error;
    }
  }

  async getPaymentByCorrelationId(
    correlationId: string
  ): Promise<PaymentData | null> {
    try {
      const paymentKey = this.getPaymentKey(correlationId);
      const paymentJson = await this.redis.get(paymentKey);

      if (!paymentJson) {
        return null;
      }
      const paymentData = JSON.parse(paymentJson);
      return {
        ...paymentData,
        requestedAt: new Date(paymentData.requestedAt),
        createdAt: new Date(paymentData.createdAt),
      };
    } catch (error) {
      this.logger.error(
        { error, correlationId },
        "Failed to get payment by correlation ID from Redis"
      );
      throw error;
    }
  }

  async getPaymentSummaryByProcessor(
    processor: "fallback" | "default",
    query: PaymentSummaryQuery = {}
  ): Promise<PaymentSummary> {
    try {
      // Check cache first
      const cacheKey = this.getSummaryCacheKey(processor, query);
      const cachedSummary = await this.redis.get(cacheKey);
      if (cachedSummary) {
        this.logger.debug({ processor, query }, "Using cached payment summary");
        return JSON.parse(cachedSummary);
      }
      const processorKey = this.getProcessorKey(processor);
      const minScore = query.from ? query.from.getTime() : "-inf";
      const maxScore = query.to ? query.to.getTime() : "+inf";
      const correlationIds = await this.redis.zrangebyscore(
        processorKey,
        minScore,
        maxScore
      );
      if (correlationIds.length === 0) {
        return { totalRequests: 0, totalAmount: 0 };
      }
      const paymentKeys = correlationIds.map((id) => this.getPaymentKey(id));
      const paymentDataList = await this.redis.mget(...paymentKeys);
      let totalRequests = 0;
      let totalAmount = 0;
      for (const paymentJson of paymentDataList) {
        if (paymentJson) {
          const payment = JSON.parse(paymentJson);
          totalRequests++;
          totalAmount += payment.amountInCents;
        }
      }
      const summary: PaymentSummary = { totalRequests, totalAmount };
      await this.redis.setex(cacheKey, 300, JSON.stringify(summary));
      return summary;
    } catch (error) {
      this.logger.error(
        { error, processor, query },
        "Failed to get payment summary by processor from Redis"
      );
      throw error;
    }
  }

  async updatePaymentProcessor(
    correlationId: string,
    processor: "fallback" | "default"
  ): Promise<boolean> {
    try {
      const paymentKey = this.getPaymentKey(correlationId);
      const paymentJson = await this.redis.get(paymentKey);
      if (!paymentJson) {
        return false;
      }
      const paymentData = JSON.parse(paymentJson);
      const oldProcessor = paymentData.processor;
      paymentData.processor = processor;
      const pipeline = this.redis.pipeline();
      pipeline.setex(
        paymentKey,
        this.CACHE_TTL_SECONDS,
        JSON.stringify(paymentData)
      );
      if (oldProcessor) {
        const oldProcessorKey = this.getProcessorKey(oldProcessor);
        pipeline.zrem(oldProcessorKey, correlationId);
      }
      const newProcessorKey = this.getProcessorKey(processor);
      pipeline.zadd(
        newProcessorKey,
        new Date(paymentData.requestedAt).getTime(),
        correlationId
      );
      pipeline.expire(newProcessorKey, this.CACHE_TTL_SECONDS);
      await this.invalidateSummaryCache(processor);
      if (oldProcessor && oldProcessor !== processor) {
        await this.invalidateSummaryCache(oldProcessor);
      }
      await pipeline.exec();
      this.logger.info(
        { correlationId, processor },
        "Payment processor updated in Redis"
      );
      return true;
    } catch (error) {
      this.logger.error(
        { error, correlationId, processor },
        "Failed to update payment processor in Redis"
      );
      throw error;
    }
  }

  // Helper methods for key generation
  private getPaymentKey(correlationId: string): string {
    return `${this.PAYMENT_KEY_PREFIX}${correlationId}`;
  }

  private getProcessorKey(processor: string): string {
    return `${this.PROCESSOR_INDEX_PREFIX}${processor}`;
  }

  private getDateKey(date: Date): string {
    const dateStr = date.toISOString().split("T")[0]; // YYYY-MM-DD
    return `${this.DATE_INDEX_PREFIX}${dateStr}`;
  }

  private getSummaryCacheKey(
    processor: string,
    query: PaymentSummaryQuery
  ): string {
    const fromStr = query.from ? query.from.toISOString() : "all";
    const toStr = query.to ? query.to.toISOString() : "all";
    return `${this.SUMMARY_KEY_PREFIX}${processor}:${fromStr}:${toStr}`;
  }

  private async invalidateSummaryCache(processor: string): Promise<void> {
    try {
      const pattern = `${this.SUMMARY_KEY_PREFIX}${processor}:*`;
      const keys = await this.redis.keys(pattern);

      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.logger.debug(
          { processor, deletedKeys: keys.length },
          "Invalidated summary cache"
        );
      }
    } catch (error) {
      this.logger.error(
        { error, processor },
        "Failed to invalidate summary cache"
      );
    }
  }

  // Utility method to clear all payment data (for testing/cleanup)
  async clearAllPayments(): Promise<void> {
    try {
      const patterns = [
        `${this.PAYMENT_KEY_PREFIX}*`,
        `${this.PROCESSOR_INDEX_PREFIX}*`,
        `${this.DATE_INDEX_PREFIX}*`,
        `${this.SUMMARY_KEY_PREFIX}*`,
      ];
      for (const pattern of patterns) {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      }
      this.logger.info("Cleared all payment data from Redis");
    } catch (error) {
      this.logger.error({ error }, "Failed to clear payment data from Redis");
      throw error;
    }
  }
}
