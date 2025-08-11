import axios from "axios";
import type { FastifyBaseLogger } from "fastify";
import type { AppConfig } from "../plugins/config-plugin";
import type { HostHealthCacheService } from "../services/host-health-cache.service";

export type ProcessPaymentInput = {
  amount: number;
  correlationId: string;
  requestedAt: Date;
};

export type BulkProcessPaymentInput = {
  payments: ProcessPaymentInput[];
  batchId: string;
};

export type BulkProcessPaymentResult = {
  batchId: string;
  processedCount: number;
  failedPayments: {
    correlationId: string;
    error: string;
  }[];
};

export type Host = "default" | "fallback";

export interface PaymentProcessorGatewayDeps {
  logger: FastifyBaseLogger;
  appConfig: AppConfig;
  hostHealthCacheService: HostHealthCacheService;
}

export class PaymentProcessorGateway {
  private readonly serverUrls: {
    [key in Host]: string;
  };
  private readonly logger: PaymentProcessorGatewayDeps["logger"];
  private readonly hostHealthCacheService: PaymentProcessorGatewayDeps["hostHealthCacheService"];

  constructor(deps: PaymentProcessorGatewayDeps) {
    this.serverUrls = {
      default: deps.appConfig.PROCESSOR_DEFAULT_URL,
      fallback: deps.appConfig.PROCESSOR_FALLBACK_URL,
    };
    this.logger = deps.logger;
    this.hostHealthCacheService = deps.hostHealthCacheService;
  }

  async processPayment(
    input: ProcessPaymentInput,
    host: Host = "default"
  ): Promise<void> {
    try {
      this.logger.debug(
        `Processing payment: ${JSON.stringify(input)}, host: ${host}`
      );
      const response = await axios.post<ProcessPaymentInput>(
        this.getHostUrl(host) + "/payments",
        {
          amount: input.amount,
          correlationId: input.correlationId,
          requestedAt: input.requestedAt.toISOString(),
        }
      );
      if (response.status !== 200) {
        throw new Error(`Unexpected status code: ${response.status}`);
      }
      return;
    } catch (e: any) {
      this.logger.debug(
        { error: e.message },
        `Error in ${host} payment processor`
      );
      throw e;
    }
  }

  async processBulkPayments(
    input: BulkProcessPaymentInput,
    host: Host
  ): Promise<BulkProcessPaymentResult> {
    const results: BulkProcessPaymentResult = {
      batchId: input.batchId,
      processedCount: 0,
      failedPayments: [],
    };
    // Process payments in parallel with controlled concurrency
    const concurrencyLimit = 10;
    const chunks = this.chunkArray(input.payments, concurrencyLimit);
    for (const chunk of chunks) {
      const promises = chunk.map(async (payment) => {
        try {
          await this.processPayment(payment, host);
          results.processedCount++;
        } catch (error: any) {
          results.failedPayments.push({
            correlationId: payment.correlationId,
            error: error.message,
          });
        }
      });
      await Promise.all(promises);
    }
    this.logger.debug(
      {
        batchId: input.batchId,
        processedCount: results.processedCount,
        failedCount: results.failedPayments.length,
        host,
      },
      "Individual bulk payment processing completed"
    );
    return results;
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  async quickCheckIsHealthy(host: Host = "default"): Promise<boolean> {
    const cachedHealth = await this.hostHealthCacheService.getCachedHealth(
      host
    );
    if (cachedHealth) {
      return !cachedHealth.failing;
    }
    this.checkHealth(host);
    // If we don't have a cached health, we assume the host is healthy
    return true;
  }

  async checkHealth(
    host: Host = "default"
  ): Promise<{ failing: boolean; minResponseTime: number }> {
    this.logger.debug({ host }, "Checking host health");
    const cachedHealth = await this.hostHealthCacheService.getCachedHealth(
      host
    );
    if (cachedHealth) {
      this.logger.debug(
        { host, cachedAt: cachedHealth.cachedAt },
        "Using cached health data"
      );
      return {
        failing: cachedHealth.failing,
        minResponseTime: cachedHealth.minResponseTime,
      };
    }
    const healthData = await this.fetchHealth(host);
    await this.hostHealthCacheService.cacheHealth(host, healthData);
    return healthData;
  }

  async fetchHealth(
    host: Host = "default"
  ): Promise<{ failing: boolean; minResponseTime: number }> {
    try {
      this.logger.debug({ host }, "Fetching host health");
      const response = await axios.get<{
        failing: boolean;
        minResponseTime: number;
      }>(this.getHostUrl(host) + "/payments/service-health");
      return response.data;
    } catch (e: any) {
      this.logger.error(
        { error: e.message },
        `Error in ${host} payment processor`
      );
      return {
        failing: true,
        minResponseTime: 0,
      };
    }
  }

  private getHostUrl(host: Host): string {
    return this.serverUrls[host];
  }
}
