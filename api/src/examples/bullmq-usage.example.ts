import type { FastifyInstance } from "fastify";
import { v4 as uuidv4 } from "uuid";

export async function paymentProcessingExample(fastify: FastifyInstance) {
  const paymentQueueService = fastify.diContainer.resolve(
    "paymentQueueService"
  );

  // Queue a single payment
  const paymentJobId = await paymentQueueService.queuePayment({
    correlationId: uuidv4(),
    amount: 299.99,
    requestedAt: new Date(),
    preferredHost: "default",
  });

  console.log(`Payment job queued: ${paymentJobId}`);

  // Check job status
  setTimeout(async () => {
    const status = await paymentQueueService.getPaymentJobStatus(paymentJobId);
    console.log("Payment job status:", status);
  }, 2000);
}
