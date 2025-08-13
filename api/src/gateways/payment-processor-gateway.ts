import axios from "axios";
import type { FastifyBaseLogger } from "fastify";
import type { AppConfig } from "../plugins/config-plugin";

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
}

export class PaymentProcessorGateway {
  private readonly serverUrls: {
    [key in Host]: string;
  };
  private readonly logger: PaymentProcessorGatewayDeps["logger"];

  constructor(deps: PaymentProcessorGatewayDeps) {
    this.serverUrls = {
      default: deps.appConfig.PROCESSOR_DEFAULT_URL,
      fallback: deps.appConfig.PROCESSOR_FALLBACK_URL,
    };
    this.logger = deps.logger;
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
    let chunkIndex = 0;
    let hasFailures = false;
    while (!hasFailures && chunkIndex < chunks.length) {
      const chunk = chunks[chunkIndex];
      const promises = chunk.map(async (payment) => {
        try {
          await this.processPayment(payment, host);
          return { success: true, payment };
        } catch (error: any) {
          return { success: false, payment, error };
        }
      });
      const settledResults = await Promise.allSettled(promises);
      // Process results from this chunk
      for (const settledResult of settledResults) {
        if (settledResult.status === "fulfilled") {
          const { success, payment, error } = settledResult.value;
          if (success) {
            results.processedCount++;
          } else {
            results.failedPayments.push({
              correlationId: payment.correlationId,
              error: error?.message || "Unknown error",
            });
            hasFailures = true;
          }
        } else {
          // This should rarely happen since we're catching errors inside the promise
          this.logger.error(
            { error: settledResult.reason },
            "Unexpected promise rejection in bulk payment processing"
          );
          hasFailures = true;
        }
      }
      chunkIndex++;
    }
    if (hasFailures) {
      const remainingChunks = chunks.slice(chunkIndex);
      for (const remainingChunk of remainingChunks) {
        for (const payment of remainingChunk) {
          results.failedPayments.push({
            correlationId: payment.correlationId,
            error: "Processing stopped due to failures in previous chunk",
          });
        }
      }
      this.logger.debug(
        {
          batchId: input.batchId,
          chunkIndex,
          remainingChunks: remainingChunks.length,
          stoppedPayments: remainingChunks.reduce(
            (sum, chunk) => sum + chunk.length,
            0
          ),
        },
        "Stopped processing remaining chunks due to failures"
      );
    }
    this.logger.debug(
      {
        batchId: input.batchId,
        processedCount: results.processedCount,
        failedCount: results.failedPayments.length,
        host,
      },
      "Bulk payment processing completed"
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

  private getHostUrl(host: Host): string {
    return this.serverUrls[host];
  }
}
