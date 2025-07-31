import type { Job } from "bullmq";
import type { FastifyBaseLogger } from "fastify";
import { BullMQWrapper } from "../queues/bullmq-wrapper";
import {
  PaymentProcessorGateway,
  Host,
} from "../gateways/payment-processor-gateway";
import { PaymentRepository } from "../db/repositories/payment.repository";

export interface PaymentJobData {
  correlationId: string;
  amount: number;
  requestedAt: Date;
  retryCount?: number;
  preferredHost?: Host;
}

export interface PaymentQueueServiceDeps {
  bullMQWrapper: BullMQWrapper;
  paymentProcessorGateway: PaymentProcessorGateway;
  paymentRepository: PaymentRepository;
  logger: FastifyBaseLogger;
}

export class PaymentQueueService {
  private readonly bullMQWrapper: PaymentQueueServiceDeps["bullMQWrapper"];
  private readonly paymentProcessorGateway: PaymentQueueServiceDeps["paymentProcessorGateway"];
  private readonly logger: PaymentQueueServiceDeps["logger"];
  private readonly paymentRepository: PaymentQueueServiceDeps["paymentRepository"];

  private readonly PAYMENT_QUEUE = "payments";
  private readonly PAYMENT_JOB = "process-payment";
  private readonly RETRY_PAYMENT_JOB = "retry-payment";
  private readonly HEALTH_CHECK_JOB = "health-check";

  constructor(deps: PaymentQueueServiceDeps) {
    this.bullMQWrapper = deps.bullMQWrapper;
    this.paymentProcessorGateway = deps.paymentProcessorGateway;
    this.logger = deps.logger;
    this.paymentRepository = deps.paymentRepository;
    this.setupWorkers();
  }

  private setupWorkers(): void {
    // Create worker for payment processing
    this.bullMQWrapper.createWorker(
      this.PAYMENT_QUEUE,
      this.processPaymentJob.bind(this),
      {
        concurrency: 10, // Process up to 10 payments concurrently
        removeOnComplete: {
          count: 100,
          age: 60000, // 1 minute
        },
        removeOnFail: {
          count: 50,
          age: 60000, // 1 minute
        },
      }
    );
    this.logger.info("Payment queue workers initialized");
  }

  private async processPaymentJob(job: Job<PaymentJobData>): Promise<void> {
    const {
      correlationId,
      amount,
      requestedAt,
      retryCount = 0,
      preferredHost = "default",
    } = job.data;

    this.logger.info(
      {
        jobId: job.id,
        correlationId,
        amount,
        retryCount,
        preferredHost,
      },
      "Processing payment job"
    );

    try {
      // Try to process with preferred host first
      await this.paymentProcessorGateway.processPayment(
        {
          correlationId,
          amount,
          requestedAt: new Date(requestedAt),
        },
        preferredHost
      );
      this.logger.info(
        { jobId: job.id, correlationId, host: preferredHost },
        "Payment processed successfully"
      );
    } catch (error) {
      this.logger.error(
        { jobId: job.id, correlationId, error, host: preferredHost },
        "Payment processing failed"
      );

      // If default host failed and we haven't tried fallback, try fallback
      if (preferredHost === "default" && retryCount === 0) {
        this.logger.info(
          { jobId: job.id, correlationId },
          "Retrying payment with fallback host"
        );

        await this.scheduleRetryPayment(
          {
            ...job.data,
            retryCount: retryCount + 1,
            preferredHost: "fallback",
          },
          5000
        ); // Retry in 5 seconds

        return;
      }

      // If both hosts failed or max retries reached, throw error to trigger BullMQ retry mechanism
      throw error;
    }
    await this.paymentRepository.updatePaymentProcessor(
      correlationId,
      preferredHost
    );
  }

  /**
   * Add a payment to the processing queue
   */
  async queuePayment(
    paymentData: Omit<PaymentJobData, "retryCount">
  ): Promise<string> {
    const job = await this.bullMQWrapper.addJob(
      this.PAYMENT_QUEUE,
      this.PAYMENT_JOB,
      paymentData,
      {
        priority: this.calculatePriority(paymentData.amount),
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
      }
    );

    this.logger.info(
      { jobId: job.id, correlationId: paymentData.correlationId },
      "Payment queued for processing"
    );

    return job.id!;
  }

  /**
   * Schedule a retry payment with delay
   */
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
        priority: this.calculatePriority(paymentData.amount),
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

  /**
   * Get payment job status
   */
  async getPaymentJobStatus(jobId: string): Promise<{
    id: string;
    status: string;
    progress: number;
    data: PaymentJobData;
    failedReason?: string;
    finishedOn?: Date;
    processedOn?: Date;
  } | null> {
    const job = await this.bullMQWrapper.getJob(this.PAYMENT_QUEUE, jobId);

    if (!job) {
      return null;
    }

    return {
      id: job.id!,
      status: await job.getState(),
      progress: +job.progress,
      data: job.data,
      failedReason: job.failedReason,
      finishedOn: job.finishedOn ? new Date(job.finishedOn) : undefined,
      processedOn: job.processedOn ? new Date(job.processedOn) : undefined,
    };
  }

  /**
   * Cancel a payment job
   */
  async cancelPaymentJob(jobId: string): Promise<boolean> {
    const job = await this.bullMQWrapper.getJob(this.PAYMENT_QUEUE, jobId);

    if (!job) {
      return false;
    }

    try {
      await job.remove();
      this.logger.info({ jobId }, "Payment job cancelled");
      return true;
    } catch (error) {
      this.logger.error({ jobId, error }, "Failed to cancel payment job");
      return false;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    const queueInfo = await this.bullMQWrapper.getQueueInfo(this.PAYMENT_QUEUE);

    return {
      ...queueInfo,
      totalJobs:
        queueInfo.waiting +
        queueInfo.active +
        queueInfo.completed +
        queueInfo.failed +
        queueInfo.delayed,
    };
  }

  /**
   * Pause payment processing
   */
  async pauseProcessing(): Promise<void> {
    await this.bullMQWrapper.pauseQueue(this.PAYMENT_QUEUE);
    this.logger.info("Payment processing paused");
  }

  /**
   * Resume payment processing
   */
  async resumeProcessing(): Promise<void> {
    await this.bullMQWrapper.resumeQueue(this.PAYMENT_QUEUE);
    this.logger.info("Payment processing resumed");
  }

  /**
   * Clean completed jobs
   */
  async cleanCompletedJobs(
    olderThanMs: number = 24 * 60 * 60 * 1000
  ): Promise<number> {
    const cleanedJobs = await this.bullMQWrapper.cleanQueue(
      this.PAYMENT_QUEUE,
      olderThanMs,
      100,
      "completed"
    );

    this.logger.info(
      { cleanedCount: cleanedJobs.length, olderThanMs },
      "Cleaned completed payment jobs"
    );

    return cleanedJobs.length;
  }

  /**
   * Clean failed jobs
   */
  async cleanFailedJobs(
    olderThanMs: number = 7 * 24 * 60 * 60 * 1000
  ): Promise<number> {
    const cleanedJobs = await this.bullMQWrapper.cleanQueue(
      this.PAYMENT_QUEUE,
      olderThanMs,
      50,
      "failed"
    );

    this.logger.info(
      { cleanedCount: cleanedJobs.length, olderThanMs },
      "Cleaned failed payment jobs"
    );

    return cleanedJobs.length;
  }

  /**
   * Schedule periodic health checks for payment processors
   */
  async scheduleHealthChecks(): Promise<void> {
    // Schedule health check every 30 seconds
    await this.bullMQWrapper.addJob(
      this.PAYMENT_QUEUE,
      this.HEALTH_CHECK_JOB,
      { timestamp: new Date() },
      {
        repeat: { every: 30000 }, // Every 30 seconds
        removeOnComplete: 5,
        removeOnFail: 5,
      }
    );

    this.logger.info("Health check jobs scheduled");
  }

  /**
   * Calculate job priority based on payment amount
   * Higher amounts get higher priority (lower number = higher priority in BullMQ)
   */
  private calculatePriority(amount: number): number {
    if (amount >= 10000) return 1; // High priority for large amounts
    if (amount >= 1000) return 5; // Medium priority
    return 10; // Normal priority
  }
}
