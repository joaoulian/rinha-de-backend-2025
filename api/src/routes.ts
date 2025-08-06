import type { FastifyPluginCallback } from "fastify";
import fp from "fastify-plugin";
import z from "zod";
import { Cents } from "./shared/cents";

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
      const createPayment = fastify.diContainer.resolve("createPayment");
      const response = await createPayment.execute({
        correlationId,
        amount,
      });
      if (response.isFailure()) {
        return reply.status(400).send(response.getError().error);
      }
      return reply.status(200).send();
    },
  });

  fastify.route<{ Querystring: { from?: string; to?: string } }>({
    method: "GET",
    url: "/payments-summary",
    schema: {
      querystring: z.object({
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
      const redisPaymentRepository = fastify.diContainer.resolve(
        "redisPaymentRepository"
      );
      const query = {
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
      };
      const [defaultSummary, fallbackSummary] = await Promise.all([
        redisPaymentRepository.getPaymentSummaryByProcessor("default", query),
        redisPaymentRepository.getPaymentSummaryByProcessor("fallback", query),
      ]);
      return reply.status(200).send({
        default: {
          totalRequests: defaultSummary.totalRequests,
          totalAmount: Cents.create(defaultSummary.totalAmount).toFloat(),
        },
        fallback: {
          totalRequests: fallbackSummary.totalRequests,
          totalAmount: Cents.create(fallbackSummary.totalAmount).toFloat(),
        },
      });
    },
  });

  done();
};

export default fp(routes);
