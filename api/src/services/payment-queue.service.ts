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

export interface BulkPaymentJobData {
  payments: PaymentJobData[];
  batchId: string;
  preferredHost?: Host;
  retryCount?: number;
}

export interface PaymentQueueServiceDeps {
  bullMQWrapper: BullMQWrapper;
  logger: FastifyBaseLogger;
}

export class PaymentQueueService {
  private readonly bullMQWrapper: PaymentQueueServiceDeps["bullMQWrapper"];
  private readonly logger: PaymentQueueServiceDeps["logger"];

  private readonly PAYMENT_QUEUE = "payments";
  private readonly BULK_PAYMENT_QUEUE = "bulk-payments";
  private readonly PAYMENT_JOB = "process-payment";
  private readonly BULK_PAYMENT_JOB = "process-bulk-payment";

  constructor(deps: PaymentQueueServiceDeps) {
    this.bullMQWrapper = deps.bullMQWrapper;
    this.logger = deps.logger;
  }

  registerBulkWorker(
    callback: (job: Job<BulkPaymentJobData>) => Promise<void>
  ): void {
    if (this.bullMQWrapper.hasWorker(this.BULK_PAYMENT_QUEUE)) {
      this.logger.debug("Bulk payment queue worker already registered");
      return;
    }
    this.logger.debug("Registering bulk payment queue worker");
    this.bullMQWrapper.createWorker(this.BULK_PAYMENT_QUEUE, callback, {
      concurrency: 3, // Process fewer bulk jobs concurrently since each handles multiple payments
      removeOnComplete: {
        count: 50,
        age: 300000, // 5 minutes
      },
      removeOnFail: {
        count: 25,
        age: 300000, // 5 minutes
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
      }
    );
    this.logger.debug(
      { jobId: job.id, correlationId: paymentData.correlationId },
      "Payment queued for processing"
    );
    return job.id!;
  }

  async queueBulkPayment(
    payments: PaymentJobData[],
    batchId: string,
    preferredHost?: Host,
    delay?: number,
    retryCount?: number
  ): Promise<string> {
    const job = await this.bullMQWrapper.addJob(
      this.BULK_PAYMENT_QUEUE,
      this.BULK_PAYMENT_JOB,
      {
        payments,
        batchId,
        preferredHost,
        retryCount,
      },
      {
        delay,
        attempts: 2,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
      }
    );
    this.logger.debug(
      {
        jobId: job.id,
        batchId,
        paymentCount: payments.length,
        preferredHost,
      },
      "Bulk payment batch queued for processing"
    );
    return job.id!;
  }

  async pullPendingPayments(
    limit: number = 50
  ): Promise<Job<PaymentJobData>[]> {
    const queue = this.bullMQWrapper.getQueue(this.PAYMENT_QUEUE);
    const waitingJobs = await queue.getWaiting(0, limit - 1);
    this.logger.debug(
      { pulledCount: waitingJobs?.length, limit },
      "Pulled pending payments from queue"
    );
    return waitingJobs.filter(Boolean) ?? [];
  }

  async createBulkJobFromPendingPayments(
    batchSize: number = 50,
    preferredHost?: Host
  ): Promise<string | null> {
    const pendingJobs = await this.pullPendingPayments(batchSize);
    if (pendingJobs.length === 0) {
      return null;
    }
    // Extract payment data from jobs
    const payments = pendingJobs.map((job) => job.data);
    const batchId = `batch-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 11)}`;
    await Promise.all(pendingJobs.map((job) => job.remove()));
    const bulkJobId = await this.queueBulkPayment(
      payments,
      batchId,
      preferredHost
    );
    this.logger.debug(
      {
        batchId,
        bulkJobId,
        paymentCount: payments.length,
        removedJobIds: pendingJobs.map((j) => j.id),
      },
      "Created bulk job from pending payments"
    );
    return bulkJobId;
  }
}
