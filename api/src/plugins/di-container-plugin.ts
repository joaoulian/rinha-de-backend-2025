import type {
  FastifyBaseLogger,
  FastifyInstance,
  FastifyPluginAsync,
} from "fastify";
import { diContainer, fastifyAwilixPlugin } from "@fastify/awilix";
import { asClass, asValue } from "awilix";
import fp from "fastify-plugin";
import { PaymentProcessorGateway } from "../gateways/payment-processor-gateway";
import { RabbitMQClient } from "../messaging/rabbitmq-client";
import { AppConfig } from "./config-plugin";

declare module "@fastify/awilix" {
  interface Cradle {
    appConfig: AppConfig;
    logger: FastifyBaseLogger;
    paymentProcessorGateway: PaymentProcessorGateway;
    rabbitMQClient: RabbitMQClient;
  }
}

const diContainerPlugin: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  await fastify.register(fastifyAwilixPlugin, {
    disposeOnClose: true,
    disposeOnResponse: true,
  });
  diContainer.register({
    appConfig: asValue(fastify.appConfig),
    logger: asValue(fastify.log),
    paymentProcessorGateway: asClass(PaymentProcessorGateway).singleton(),
    rabbitMQClient: asClass(RabbitMQClient).singleton(),
  });
};

export default fp(diContainerPlugin);
