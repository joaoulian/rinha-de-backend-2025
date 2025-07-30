import type { AwilixContainer } from "awilix";
import type { Container } from ".";
import type { FastifyBaseLogger } from "fastify";
import { PaymentProcessorGateway } from "../gateways/payment-processor-gateway";

declare module "fastify" {
  interface FastifyRequest {
    diContainer: AwilixContainer<Container>;
  }

  interface FastifyInstance {
    diContainer: AwilixContainer<Container>;
  }
}

declare module "@fastify/awilix" {
  interface Cradle {
    config: typeof config;
    logger: FastifyBaseLogger;
    paymentProcessorGateway: PaymentProcessorGateway;
  }
}
