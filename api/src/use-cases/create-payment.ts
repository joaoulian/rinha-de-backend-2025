import type { FastifyBaseLogger } from "fastify";
import type { PaymentQueueService } from "../services/payment-queue.service";
import type { IInstrumentation } from "../shared/instrumentation";
import { UseCase } from "../shared/use-case";
import { Either, failure, success } from "../shared/either";
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
    const jobId = await this.paymentQueueService.queuePayment({
      correlationId,
      amount: amount,
      requestedAt: new Date().toISOString(),
    });
    instrumentation.logDebug("Payment queued for processing", {
      jobId: jobId,
      correlationId,
    });
    return success({ jobId: jobId });
  }
}
