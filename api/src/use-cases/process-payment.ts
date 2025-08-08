import type { FastifyBaseLogger } from "fastify";
import type { IInstrumentation } from "../shared/instrumentation";
import type {
  Host,
  PaymentProcessorGateway,
} from "../gateways/payment-processor-gateway";
import type {
  PaymentJobData,
  PaymentQueueService,
} from "../services/payment-queue.service";
import type { Job } from "bullmq";
import { UseCase } from "../shared/use-case";
import type {
  PaymentData,
  PaymentRepository,
} from "../repositories/payment-repository";
import { Cents } from "../shared/cents";
import { Either, failure, success } from "../shared/either";

export type ProcessPaymentRequest = Job<PaymentJobData>;

export type ProcessPaymentResponse = void;

export interface ProcessPaymentDeps {
  paymentQueueService: PaymentQueueService;
  paymentRepository: PaymentRepository;
  paymentProcessorGateway: PaymentProcessorGateway;
  logger: FastifyBaseLogger;
}

export class ProcessPayment extends UseCase<
  ProcessPaymentRequest,
  ProcessPaymentResponse
> {
  serviceName = "process-payment";
  private readonly paymentQueueService: ProcessPaymentDeps["paymentQueueService"];
  private readonly paymentRepository: ProcessPaymentDeps["paymentRepository"];
  private readonly paymentProcessorGateway: ProcessPaymentDeps["paymentProcessorGateway"];

  constructor(deps: ProcessPaymentDeps) {
    super(deps.logger);
    this.paymentQueueService = deps.paymentQueueService;
    this.paymentRepository = deps.paymentRepository;
    this.paymentProcessorGateway = deps.paymentProcessorGateway;
  }

  async run(
    instrumentation: IInstrumentation,
    job: ProcessPaymentRequest
  ): Promise<ProcessPaymentResponse> {
    const {
      correlationId,
      amount,
      requestedAt: rawRequestedAt,
      retryCount = 0,
      preferredHost = "default",
    } = job.data;
    const processedOrFailed = await this.processPayment(
      instrumentation,
      job,
      preferredHost,
      retryCount
    );
    if (processedOrFailed.isFailure()) {
      return;
    }
    const host = processedOrFailed.value.host;
    await this.paymentRepository.createPayment({
      correlationId,
      amountInCents: Cents.fromFloat(amount).value,
      requestedAt: new Date(rawRequestedAt),
      processor: host,
    });
  }

  private async processPayment(
    instrumentation: IInstrumentation,
    job: ProcessPaymentRequest,
    preferredHost: Host,
    retryCount: number
  ): Promise<Either<{ host: Host }, string>> {
    const { correlationId, amount, requestedAt: rawRequestedAt } = job.data;
    const requestedAt = new Date(rawRequestedAt);
    instrumentation.logDebug(
      `Processing payment job ${job.id} for ${correlationId}`
    );
    const isHealthy = await this.paymentProcessorGateway.quickCheckIsHealthy(
      preferredHost
    );
    const host = isHealthy
      ? preferredHost
      : ((preferredHost === "default" ? "fallback" : "default") as Host);
    try {
      await this.paymentProcessorGateway.processPayment(
        {
          correlationId: correlationId,
          amount: Cents.create(amount).toFloat(),
          requestedAt: new Date(requestedAt),
        },
        host
      );
      instrumentation.logDebug("Payment processed successfully", {
        jobId: job.id,
        correlationId,
        host,
      });
      return success({
        host,
      });
    } catch (error) {
      instrumentation.logErrorOccurred(error, "Payment processing failed");
      const otherHost = host === "default" ? "fallback" : "default";
      instrumentation.logDebug(`Retrying payment with ${otherHost} host`);
      const health = await this.paymentProcessorGateway.checkHealth(otherHost);
      await this.paymentQueueService.scheduleRetryPayment(
        {
          ...job.data,
          retryCount: retryCount + 1,
          preferredHost: otherHost,
        },
        health.failing ? health.minResponseTime : 0
      );
      return failure("Payment processing failed");
    }
  }
}
