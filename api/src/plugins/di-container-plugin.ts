import type {
  FastifyBaseLogger,
  FastifyInstance,
  FastifyPluginAsync,
} from "fastify";
import { diContainer, fastifyAwilixPlugin } from "@fastify/awilix";
import { asClass, asValue } from "awilix";
import fp from "fastify-plugin";
import { PaymentProcessorGateway } from "../gateways/payment-processor-gateway";
import { AppConfig } from "./config-plugin";
import { BullMQWrapper } from "../queues/bullmq-wrapper";
import { PaymentQueueService } from "../services/payment-queue.service";
import { PaymentService } from "../services/payment.service";
import type { DrizzleDB } from "./drizzle-plugin";

declare module "@fastify/awilix" {
  interface Cradle {
    appConfig: AppConfig;
    logger: FastifyBaseLogger;
    db: DrizzleDB;
    paymentProcessorGateway: PaymentProcessorGateway;
    bullMQWrapper: BullMQWrapper;
    paymentQueueService: PaymentQueueService;
    paymentService: PaymentService;
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
    db: asValue(fastify.db),
    paymentProcessorGateway: asClass(PaymentProcessorGateway).singleton(),
    bullMQWrapper: asClass(BullMQWrapper).singleton(),
    paymentQueueService: asClass(PaymentQueueService).singleton(),
    paymentService: asClass(PaymentService).singleton(),
  });
};

export default fp(diContainerPlugin, {
  name: "di-container-plugin",
  dependencies: ["drizzle-plugin"],
});
