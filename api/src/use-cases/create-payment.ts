import type { FastifyBaseLogger } from "fastify";
import type { PaymentQueueService } from "../services/payment-queue.service";
import type { IInstrumentation } from "../shared/instrumentation";
import { UseCase } from "../shared/use-case";
import { Either, failure, success } from "../shared/either";
import { Cents } from "../shared/cents";
import type { PaymentRepository } from "../repositories/payment-repository";

export interface CreatePaymentRequest {
  correlationId: string;
  amount: number;
}

export type CreatePaymentResponse = Either<
  {
    jobId: string;
  },
  { error: string }
>;

export interface CreatePaymentDeps {
  paymentQueueService: PaymentQueueService;
  paymentRepository: PaymentRepository;
  logger: FastifyBaseLogger;
}

export class CreatePayment extends UseCase<
  CreatePaymentRequest,
  CreatePaymentResponse
> {
  serviceName = "create-payment";
  private readonly paymentQueueService: CreatePaymentDeps["paymentQueueService"];
  private readonly paymentRepository: CreatePaymentDeps["paymentRepository"];

  constructor(deps: CreatePaymentDeps) {
    super(deps.logger);
    this.paymentQueueService = deps.paymentQueueService;
    this.paymentRepository = deps.paymentRepository;
  }

  async run(
    instrumentation: IInstrumentation,
    { correlationId, amount }: CreatePaymentRequest
  ): Promise<CreatePaymentResponse> {
    const existentPayment =
      await this.paymentRepository.getPaymentByCorrelationId(correlationId);
    if (existentPayment) {
      instrumentation.logWarning("Payment already exists");
      return failure({ error: "Payment already exists" });
    }
    const paymentData = {
      correlationId,
      amountInCents: Cents.fromFloat(amount),
      requestedAt: new Date(),
    };
    instrumentation.logDebug("Creating payment record", { paymentData });
    await this.paymentRepository.createPayment({
      ...paymentData,
      amountInCents: paymentData.amountInCents.value,
    });
    instrumentation.logDebug("Payment record created");
    const priority = this.calculatePriority(paymentData.amountInCents);
    instrumentation.logDebug("Queueing payment for processing", {
      priority,
      paymentData,
    });
    const jobId = await this.paymentQueueService.queuePayment(
      {
        correlationId,
        amount: paymentData.amountInCents.toFloat(),
        requestedAt: paymentData.requestedAt,
      },
      priority
    );
    instrumentation.logDebug("Payment queued for processing", {
      jobId: jobId,
      correlationId: paymentData,
    });
    return success({ jobId: jobId });
  }

  private calculatePriority(amount: Cents): number {
    const units = amount.toFloat();
    if (units >= 10000) return 1;
    if (units >= 1000) return 5;
    return 10;
  }
}
