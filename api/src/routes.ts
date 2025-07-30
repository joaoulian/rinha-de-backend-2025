import type { FastifyPluginCallback } from "fastify";
import fp from "fastify-plugin";
import z from "zod";
import { PaymentProcessorGateway } from "./gateways/payment-processor-gateway";
import { RabbitMQClient } from "./messaging/rabbitmq-client";

const routes: FastifyPluginCallback = (fastify, _options, done) => {
  fastify.route<{ Body: { correlationId: string; amount: number } }>({
    method: "POST",
    url: "/payments",
    schema: {
      body: z.object({
        correlationId: z.string(),
        amount: z.coerce.number(),
      }),
      response: {
        200: z.void(),
      },
    },
    handler: async function (request, reply) {
      const { correlationId, amount } = request.body;
      const paymentProcessorGateway =
        fastify.diContainer.resolve<PaymentProcessorGateway>(
          "paymentProcessorGateway"
        );
      const healthStatus = await paymentProcessorGateway.checkHealth(
        "fallback"
      );
      const rabbitMQClient =
        fastify.diContainer.resolve<RabbitMQClient>("rabbitMQClient");

      await rabbitMQClient.publishPayment({
        correlationId,
        amount,
        requestedAt: new Date(),
      });
      fastify.log.info({ healthStatus });
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
