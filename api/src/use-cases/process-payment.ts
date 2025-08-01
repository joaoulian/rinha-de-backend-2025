import type { FastifyBaseLogger } from "fastify";
import type { PaymentRepository } from "../db/repositories/payment.repository";
import type { IInstrumentation } from "../shared/instrumentation";
import type { PaymentProcessorGateway } from "../gateways/payment-processor-gateway";
import type {
  PaymentJobData,
  PaymentQueueService,
} from "../services/payment-queue.service";
import type { Job } from "bullmq";
import { UseCase } from "../shared/use-case";

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
      requestedAt,
      retryCount = 0,
      preferredHost = "default",
    } = job.data;
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
      if (preferredHost === "default" && retryCount === 0) {
        instrumentation.logDebug("Retrying payment with fallback host");
        await this.paymentQueueService.scheduleRetryPayment(
          {
            ...job.data,
            retryCount: retryCount + 1,
            preferredHost: "fallback",
          },
          job.priority,
          5000
        ); // Retry in 5 seconds
        return;
      }
      throw error;
    }
    await this.paymentRepository.updatePaymentProcessor(
      correlationId,
      preferredHost
    );
  }
}
