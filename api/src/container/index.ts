import { diContainer, fastifyAwilixPlugin } from "@fastify/awilix";
import { asClass, asValue } from "awilix";
import type { FastifyInstance } from "fastify";
import type { Config } from "../config";
import { PaymentProcessorGateway } from "../gateways/payment-processor-gateway";

export async function createContainer(
  fastify: FastifyInstance,
  config: Config
) {
  await fastify.register(fastifyAwilixPlugin, {
    disposeOnClose: true,
    disposeOnResponse: true,
  });
  diContainer.register({
    config: asValue(config),
    logger: asValue(fastify.log),
    paymentProcessorGateway: asClass(PaymentProcessorGateway).singleton(),
  });
}
