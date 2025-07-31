import type { FastifyPluginCallback } from "fastify";
import fp from "fastify-plugin";
import z from "zod";

const routes: FastifyPluginCallback = (fastify, _options, done) => {
  fastify.route<{ Body: { correlationId: string; amount: number } }>({
    method: "POST",
    url: "/payments",
    schema: {
      body: z.object({
        correlationId: z.uuidv4(),
        amount: z.coerce.number(),
      }),
      response: {
        200: z.void(),
      },
    },
    handler: async function (request, reply) {
      const { correlationId, amount } = request.body;
      const paymentQueueService = fastify.diContainer.resolve(
        "paymentQueueService"
      );
      const paymentRepository =
        fastify.diContainer.resolve("paymentRepository");

      // Create payment record in database
      await paymentRepository.createPayment({
        correlationId,
        amountInCents: amount * 100, // Convert to cents
        requestedAt: new Date(),
      });

      // Queue payment for processing
      await paymentQueueService.queuePayment({
        correlationId,
        amount,
        requestedAt: new Date(),
        preferredHost: "default",
      });

      return reply.status(200).send();
    },
  });

  fastify.route<{ Querystring: { from?: string; to?: string } }>({
    method: "GET",
    url: "/payments-summary",
    schema: {
      query: z.object({
        from: z.string().optional(),
        to: z.string().optional(),
      }),
      response: {
        200: z.object({
          default: z.object({
            totalRequests: z.number(),
            totalAmount: z.number(),
          }),
          fallback: z.object({
            totalRequests: z.number(),
            totalAmount: z.number(),
          }),
        }),
      },
    },
    handler: async function (request, reply) {
      const { from, to } = request.query;
      const paymentRepository =
        fastify.diContainer.resolve("paymentRepository");
      const query = {
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
      };
      const [defaultSummary, fallbackSummary] = await Promise.all([
        paymentRepository.getPaymentSummaryByProcessor("default", query),
        paymentRepository.getPaymentSummaryByProcessor("fallback", query),
      ]);
      return reply.status(200).send({
        default: {
          totalRequests: defaultSummary.totalRequests,
          totalAmount: defaultSummary.totalAmount / 100, // Convert from cents
        },
        fallback: {
          totalRequests: fallbackSummary.totalRequests,
          totalAmount: fallbackSummary.totalAmount / 100, // Convert from cents
        },
      });
    },
  });

  done();
};

export default fp(routes);
