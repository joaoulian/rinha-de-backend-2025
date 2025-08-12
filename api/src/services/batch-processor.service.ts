import type { FastifyBaseLogger } from "fastify";
import type { PaymentQueueService } from "./payment-queue.service";

export interface BatchProcessorConfig {
  batchSize: number;
  intervalMs: number;
}

export interface BatchProcessorServiceDeps {
  paymentQueueService: PaymentQueueService;
  logger: FastifyBaseLogger;
  config: BatchProcessorConfig;
}

export class BatchProcessorService {
  private readonly paymentQueueService: BatchProcessorServiceDeps["paymentQueueService"];
  private readonly logger: BatchProcessorServiceDeps["logger"];
  private readonly config: BatchProcessorServiceDeps["config"];
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isProcessing = false;

  constructor(deps: BatchProcessorServiceDeps) {
    this.paymentQueueService = deps.paymentQueueService;
    this.logger = deps.logger;
    this.config = deps.config;
  }

  start(): void {
    if (this.isRunning) {
      this.logger.warn("Batch processor is already running");
      return;
    }
    this.isRunning = true;
    this.logger.debug(
      {
        batchSize: this.config.batchSize,
        intervalMs: this.config.intervalMs,
      },
      "Starting batch processor"
    );
    this.intervalId = setInterval(async () => {
      if (!this.isProcessing) {
        await this.processBatch();
      }
    }, this.config.intervalMs);
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.logger.debug("Batch processor stopped");
  }

  async processBatch(): Promise<void> {
    if (this.isProcessing) {
      this.logger.debug("Batch processing already in progress, skipping");
      return;
    }
    this.isProcessing = true;
    try {
      const startTime = Date.now();
      const bulkJobId =
        await this.paymentQueueService.createBulkJobFromPendingPayments(
          this.config.batchSize
        );
      const processingTime = Date.now() - startTime;
      if (bulkJobId) {
        this.logger.debug(
          {
            bulkJobId,
            batchSize: this.config.batchSize,
            processingTimeMs: processingTime,
          },
          "Created bulk job from pending payments"
        );
      } else {
        this.logger.debug(
          {
            processingTimeMs: processingTime,
          },
          "No pending payments found for batch processing"
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        `Error during batch processing. Message: ${message}`
      );
    } finally {
      this.isProcessing = false;
    }
  }
}
