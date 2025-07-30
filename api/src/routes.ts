import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import z from "zod";
import { HealthService } from "./services/health.service";
import {
  Host,
  PaymentProcessorGateway,
} from "./gateways/payment-processor-gateway";

export async function routes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions
): Promise<void> {
  // Health check endpoint
  fastify.get("/", async (_request, reply) => {
    const healthService =
      fastify.diContainer.resolve<HealthService>("healthService");
    const healthStatus = healthService.getHealthStatus();
    return reply.status(200).send(healthStatus);
  });

  fastify.post(
    "/payments",
    {
      schema: {
        body: z.object({
          correlationId: z.string(),
          amount: z.coerce.number(),
        }),
        response: {
          200: z.void(),
        },
      },
    },
    async (_request, reply) => {
      const paymentProcessorGateway =
        fastify.diContainer.resolve<PaymentProcessorGateway>(
          "paymentProcessorGateway"
        );
      const healthStatus = await paymentProcessorGateway.checkHealth(
        "fallback"
      );
      fastify.log.info({ healthStatus });
      return reply.status(200).send();
    }
  );

  fastify.get(
    "/payments-summary",
    {
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
    },
    async (_request, reply) => {
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
    }
  );
}
