export interface CreatePaymentInput {
  correlationId: string;
  amountInCents: number;
  requestedAt: Date;
  processor: "default" | "fallback";
}

export interface PaymentSummaryQuery {
  from?: Date;
  to?: Date;
}

export interface Summary {
  totalRequests: number;
  totalAmount: number;
}

export interface PaymentSummary {
  default: Summary;
  fallback: Summary;
}

export interface PaymentData {
  correlationId: string;
  amountInCents: number;
  requestedAt: Date;
  processor: "default" | "fallback";
}

export interface PaymentRepository {
  createPayment(input: CreatePaymentInput): Promise<PaymentData>;
  getPaymentSummary(query?: PaymentSummaryQuery): Promise<PaymentSummary>;
}
