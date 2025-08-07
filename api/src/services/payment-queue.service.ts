import type { Job } from "bullmq";
import type { FastifyBaseLogger } from "fastify";
import type { BullMQWrapper } from "../queues/bullmq-wrapper";
import type { Host } from "../gateways/payment-processor-gateway";

export interface PaymentJobData {
  correlationId: string;
  amount: number;
  requestedAt: string;
  retryCount?: number;
  preferredHost?: Host;
}

export interface PaymentQueueServiceDeps {
  bullMQWrapper: BullMQWrapper;
  logger: FastifyBaseLogger;
}

export class PaymentQueueService {
  private readonly bullMQWrapper: PaymentQueueServiceDeps["bullMQWrapper"];
  private readonly logger: PaymentQueueServiceDeps["logger"];

  private readonly PAYMENT_QUEUE = "payments";
  private readonly PAYMENT_JOB = "process-payment";
  private readonly RETRY_PAYMENT_JOB = "retry-payment";

  constructor(deps: PaymentQueueServiceDeps) {
    this.bullMQWrapper = deps.bullMQWrapper;
    this.logger = deps.logger;
  }

  registerWorker(callback: (job: Job<PaymentJobData>) => Promise<void>): void {
    if (this.bullMQWrapper.hasWorker(this.PAYMENT_QUEUE)) {
      this.logger.info("Payment queue worker already registered");
      return;
    }
    this.logger.info("Registering payment queue worker");
    this.bullMQWrapper.createWorker(this.PAYMENT_QUEUE, callback, {
      concurrency: 10, // Process up to 10 payments concurrently
      removeOnComplete: {
        count: 100,
        age: 60000, // 1 minute
      },
      removeOnFail: {
        count: 50,
        age: 60000, // 1 minute
      },
    });
  }

  async queuePayment(
    paymentData: Omit<PaymentJobData, "retryCount">
  ): Promise<string> {
    const job = await this.bullMQWrapper.addJob(
      this.PAYMENT_QUEUE,
      this.PAYMENT_JOB,
      paymentData,
      {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        jobId: paymentData.correlationId,
      }
    );
    this.logger.info(
      { jobId: job.id, correlationId: paymentData.correlationId },
      "Payment queued for processing"
    );
    return job.id!;
  }

  async scheduleRetryPayment(
    paymentData: PaymentJobData,
    delayMs: number
  ): Promise<string> {
    const job = await this.bullMQWrapper.addJob(
      this.PAYMENT_QUEUE,
      this.RETRY_PAYMENT_JOB,
      paymentData,
      {
        delay: delayMs,
        attempts: 2, // Fewer attempts for retries
        backoff: {
          type: "fixed",
          delay: 3000,
        },
      }
    );
    this.logger.info(
      {
        jobId: job.id,
        correlationId: paymentData.correlationId,
        delayMs,
        retryCount: paymentData.retryCount,
      },
      "Payment retry scheduled"
    );
    return job.id!;
  }
}
