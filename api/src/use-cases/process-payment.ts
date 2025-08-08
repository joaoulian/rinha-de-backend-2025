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
    const requestedAt = new Date(rawRequestedAt);
    const payment = await this.getOrCreatePayment(
      instrumentation,
      correlationId,
      amount,
      requestedAt
    );
    if (payment.processor) {
      instrumentation.logDebug("Payment already processed");
      return;
    }
    const { processed } = await this.processPayment(
      instrumentation,
      job,
      payment,
      preferredHost,
      retryCount
    );
    if (!processed) {
      return;
    }
    await this.paymentRepository.updatePaymentProcessor(
      correlationId,
      preferredHost
    );
  }

  private async getOrCreatePayment(
    instrumentation: IInstrumentation,
    correlationId: string,
    amount: number,
    requestedAt: Date
  ): Promise<PaymentData> {
    let existentPayment =
      await this.paymentRepository.getPaymentByCorrelationId(correlationId);
    if (existentPayment) {
      return existentPayment;
    }
    const paymentData = {
      correlationId,
      amountInCents: Cents.fromFloat(amount),
      requestedAt,
    };
    instrumentation.logDebug("Creating payment record", { paymentData });
    const createdPayment = await this.paymentRepository.createPayment({
      ...paymentData,
      amountInCents: paymentData.amountInCents.value,
    });
    instrumentation.logDebug("Payment record created");
    return createdPayment;
  }

  private async processPayment(
    instrumentation: IInstrumentation,
    job: ProcessPaymentRequest,
    payment: PaymentData,
    preferredHost: Host,
    retryCount: number
  ): Promise<{ processed: boolean }> {
    instrumentation.logDebug(
      `Processing payment job ${job.id} for ${payment.correlationId}`
    );
    const health = await this.paymentProcessorGateway.quickCheckHealth(
      preferredHost
    );
    const host = health
      ? preferredHost
      : ((preferredHost === "default" ? "fallback" : "default") as Host);
    try {
      await this.paymentProcessorGateway.processPayment(
        {
          correlationId: payment.correlationId,
          amount: Cents.create(payment.amountInCents).toFloat(),
          requestedAt: new Date(payment.requestedAt),
        },
        host
      );
      instrumentation.logDebug("Payment processed successfully", {
        jobId: job.id,
        correlationId: payment.correlationId,
        host,
      });
      return { processed: true };
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
      return { processed: false };
    }
  }
}
