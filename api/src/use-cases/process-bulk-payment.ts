import type { FastifyBaseLogger } from "fastify";
import type { IInstrumentation } from "../shared/instrumentation";
import type {
  Host,
  PaymentProcessorGateway,
  BulkProcessPaymentInput,
} from "../gateways/payment-processor-gateway";
import type {
  BulkPaymentJobData,
  PaymentQueueService,
} from "../services/payment-queue.service";
import type { Job } from "bullmq";
import { UseCase } from "../shared/use-case";
import type { PaymentRepository } from "../repositories/payment-repository";
import { Cents } from "../shared/cents";

export type ProcessBulkPaymentRequest = Job<BulkPaymentJobData>;

export type ProcessBulkPaymentResponse = void;

export interface ProcessBulkPaymentDeps {
  paymentQueueService: PaymentQueueService;
  paymentRepository: PaymentRepository;
  paymentProcessorGateway: PaymentProcessorGateway;
  logger: FastifyBaseLogger;
}

export class ProcessBulkPayment extends UseCase<
  ProcessBulkPaymentRequest,
  ProcessBulkPaymentResponse
> {
  serviceName = "process-bulk-payment";
  private readonly paymentQueueService: ProcessBulkPaymentDeps["paymentQueueService"];
  private readonly paymentRepository: ProcessBulkPaymentDeps["paymentRepository"];
  private readonly paymentProcessorGateway: ProcessBulkPaymentDeps["paymentProcessorGateway"];

  constructor(deps: ProcessBulkPaymentDeps) {
    super(deps.logger);
    this.paymentQueueService = deps.paymentQueueService;
    this.paymentRepository = deps.paymentRepository;
    this.paymentProcessorGateway = deps.paymentProcessorGateway;
  }

  async run(
    instrumentation: IInstrumentation,
    job: ProcessBulkPaymentRequest
  ): Promise<ProcessBulkPaymentResponse> {
    const { payments, batchId, preferredHost = "default" } = job.data;

    instrumentation.logInfo(
      `Processing bulk payment job ${job.id} with batchId ${batchId} containing ${payments.length} payments`
    );

    const { host, result } = await this.processBulkPayments(
      instrumentation,
      job,
      preferredHost
    );

    // Save successful payments to database
    await this.saveSuccessfulPayments(
      instrumentation,
      payments,
      result.failedPayments,
      host
    );

    if (result.failedPayments.length > 0) {
      await this.requeueFailedPaymentsFromResult(
        instrumentation,
        payments,
        result.failedPayments,
        host
      );
    }

    instrumentation.logDebug(
      `Bulk payment processing completed: ${result.processedCount} successful, ${result.failedPayments.length} failed`,
      {
        jobId: job.id,
        batchId,
        host,
        processedCount: result.processedCount,
        failedCount: result.failedPayments.length,
      }
    );
  }

  private async processBulkPayments(
    instrumentation: IInstrumentation,
    job: ProcessBulkPaymentRequest,
    preferredHost: Host
  ): Promise<{
    host: Host;
    result: {
      batchId: string;
      processedCount: number;
      failedPayments: { correlationId: string; error: string }[];
    };
  }> {
    const { payments, batchId } = job.data;

    // Check host health and determine which host to use
    const health = await this.paymentProcessorGateway.checkHealth(
      preferredHost
    );
    const host = !health.failing
      ? preferredHost
      : ((preferredHost === "default" ? "fallback" : "default") as Host);
    const bulkInput: BulkProcessPaymentInput = {
      batchId,
      payments: payments.map((payment) => ({
        correlationId: payment.correlationId,
        amount: Cents.create(payment.amount).toFloat(),
        requestedAt: new Date(payment.requestedAt),
      })),
    };

    const result = await this.paymentProcessorGateway.processBulkPayments(
      bulkInput,
      host
    );

    instrumentation.logDebug("Bulk payment processed successfully", {
      jobId: job.id,
      batchId,
      host,
      processedCount: result.processedCount,
      failedCount: result.failedPayments.length,
    });

    return {
      host,
      result,
    };
  }

  private async saveSuccessfulPayments(
    instrumentation: IInstrumentation,
    allPayments: BulkPaymentJobData["payments"],
    failedPayments: { correlationId: string; error: string }[],
    host: Host
  ): Promise<void> {
    const failedCorrelationIds = new Set(
      failedPayments.map((fp) => fp.correlationId)
    );
    const successfulPayments = allPayments.filter(
      (payment) => !failedCorrelationIds.has(payment.correlationId)
    );

    if (successfulPayments.length === 0) {
      instrumentation.logDebug("No successful payments to save");
      return;
    }

    // Use bulk create for better performance
    const paymentInputs = successfulPayments.map((payment) => ({
      correlationId: payment.correlationId,
      amountInCents: Cents.fromFloat(payment.amount).value,
      requestedAt: new Date(payment.requestedAt),
      processor: host,
    }));

    await this.paymentRepository.bulkCreatePayments(paymentInputs);
    instrumentation.logDebug(
      `Saved ${successfulPayments.length} successful payments to database`,
      {
        successfulCount: successfulPayments.length,
        host,
      }
    );
  }

  private async requeueFailedPaymentsFromResult(
    instrumentation: IInstrumentation,
    allPayments: BulkPaymentJobData["payments"],
    failedPayments: { correlationId: string; error: string }[],
    currentHost: Host
  ): Promise<void> {
    instrumentation.logInfo(
      `Re-queuing ${failedPayments.length} failed payments for individual retry`
    );
    const failedIds = new Set(failedPayments.map((fp) => fp.correlationId));
    const failedPaymentData = allPayments.filter((payment) =>
      failedIds.has(payment.correlationId)
    );
    const batchId = `retry-batch-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 11)}`;
    const otherHost = currentHost === "default" ? "fallback" : "default";
    await this.paymentQueueService.queueBulkPayment(
      failedPaymentData,
      batchId,
      otherHost
    );
  }
}
