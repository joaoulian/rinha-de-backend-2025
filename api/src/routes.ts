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
      await paymentQueueService.queuePayment({
        correlationId,
        amount,
        requestedAt: new Date(),
        preferredHost: "default",
      });
      return reply.status(200).send();
    },
  });

  fastify.route({
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
      return reply.status(200).send({
        default: {
          totalRequests: 0,
          totalAmount: 0,
        },
        fallback: {
          totalRequests: 0,
          totalAmount: 0,
        },
      });
    },
  });

  done();
};

export default fp(routes);
