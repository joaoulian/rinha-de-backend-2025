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
      const paymentRepository =
        fastify.diContainer.resolve("paymentRepository");
      const query = {
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
      };
      const summary = await paymentRepository.getPaymentSummary(query);
      return reply.status(200).send({
        default: {
          totalRequests: summary.default.totalRequests,
          totalAmount: Cents.create(summary.default.totalAmount).toFloat(),
        },
        fallback: {
          totalRequests: summary.fallback.totalRequests,
          totalAmount: Cents.create(summary.fallback.totalAmount).toFloat(),
        },
      });
    },
  });

  done();
};

export default fp(routes);
