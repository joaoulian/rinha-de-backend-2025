import type { FastifyBaseLogger } from "fastify";
import type { IInstrumentation } from "../shared/instrumentation";
import type { PaymentProcessorGateway } from "../gateways/payment-processor-gateway";
import type {
  PaymentJobData,
  PaymentQueueService,
} from "../services/payment-queue.service";
import type { Job } from "bullmq";
import { UseCase } from "../shared/use-case";
import { RedisPaymentRepository } from "../repositories/payment-repository";

export type ProcessPaymentRequest = Job<PaymentJobData>;

export type ProcessPaymentResponse = void;

export interface ProcessPaymentDeps {
  paymentQueueService: PaymentQueueService;
  redisPaymentRepository: RedisPaymentRepository;
  paymentProcessorGateway: PaymentProcessorGateway;
  logger: FastifyBaseLogger;
}

export class ProcessPayment extends UseCase<
  ProcessPaymentRequest,
  ProcessPaymentResponse
> {
  serviceName = "process-payment";
  private readonly paymentQueueService: ProcessPaymentDeps["paymentQueueService"];
  private readonly redisPaymentRepository: ProcessPaymentDeps["redisPaymentRepository"];
  private readonly paymentProcessorGateway: ProcessPaymentDeps["paymentProcessorGateway"];

  constructor(deps: ProcessPaymentDeps) {
    super(deps.logger);
    this.paymentQueueService = deps.paymentQueueService;
    this.redisPaymentRepository = deps.redisPaymentRepository;
    this.paymentProcessorGateway = deps.paymentProcessorGateway;
  }

  async run(
    instrumentation: IInstrumentation,
    job: ProcessPaymentRequest
  ): Promise<ProcessPaymentResponse> {
    const {
      correlationId,
      amount,
      requestedAt,
      retryCount = 0,
      preferredHost = "default",
    } = job.data;
    const existentPayment =
      await this.redisPaymentRepository.getPaymentByCorrelationId(
        correlationId
      );
    if (!existentPayment) {
      instrumentation.logErrorOccurred(
        new Error("Payment not found"),
        "Payment not found"
      );
      return;
    }
    if (existentPayment.processor) {
      instrumentation.logDebug("Payment already processed");
      return;
    }
    instrumentation.logDebug(
      `Processing payment job ${job.id} for ${correlationId}`
    );
    try {
      await this.paymentProcessorGateway.processPayment(
        {
          correlationId,
          amount,
          requestedAt: new Date(requestedAt),
        },
        preferredHost
      );
      instrumentation.logDebug("Payment processed successfully", {
        jobId: job.id,
        correlationId,
        host: preferredHost,
      });
    } catch (error) {
      instrumentation.logErrorOccurred(error, "Payment processing failed");
      const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 0) - 1;
      if (isLastAttempt) {
        const otherHost = preferredHost === "default" ? "fallback" : "default";
        instrumentation.logDebug(`Retrying payment with ${otherHost} host`);
        const health = await this.paymentProcessorGateway.checkHealth(
          otherHost
        );
        await this.paymentQueueService.scheduleRetryPayment(
          {
            ...job.data,
            retryCount: retryCount + 1,
            preferredHost: otherHost,
          },
          job.priority,
          health.minResponseTime // Retry after the minimum response time
        );
        return;
      }
      // If not the last attempt, let BullMQ handle the retry using the backoff strategy
      throw error;
    }
    await this.redisPaymentRepository.updatePaymentProcessor(
      correlationId,
      preferredHost
    );
  }
}
