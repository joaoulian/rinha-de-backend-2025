export interface CreatePaymentInput {
  correlationId: string;
  amountInCents: number;
  requestedAt: Date;
  processor?: "default" | "fallback";
}

export interface PaymentSummaryQuery {
  from?: Date;
  to?: Date;
}

export interface PaymentSummary {
  totalRequests: number;
  totalAmount: number;
}

export interface PaymentData {
  correlationId: string;
  amountInCents: number;
  requestedAt: Date;
  processor?: "default" | "fallback";
  createdAt: Date;
}

export interface PaymentRepository {
  createPayment(input: CreatePaymentInput): Promise<void>;
  getPaymentByCorrelationId(correlationId: string): Promise<PaymentData | null>;
  getPaymentSummaryByProcessor(
    processor: "fallback" | "default",
    query?: PaymentSummaryQuery
  ): Promise<PaymentSummary>;
  updatePaymentProcessor(
    correlationId: string,
    processor: "fallback" | "default"
  ): Promise<boolean>;
  clearAllPayments?(): Promise<void>;
}
