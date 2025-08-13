import type {
  FastifyBaseLogger,
  FastifyInstance,
  FastifyPluginAsync,
} from "fastify";
import fp from "fastify-plugin";
import { diContainer, fastifyAwilixPlugin } from "@fastify/awilix";
import { asClass, asValue } from "awilix";
import Redis from "ioredis";
import { PaymentProcessorGateway } from "../gateways/payment-processor-gateway";
import { AppConfig } from "./config-plugin";
import { BullMQWrapper } from "../queues/bullmq-wrapper";
import { PaymentQueueService } from "../services/payment-queue.service";
import { BatchProcessorService } from "../services/batch-processor.service";
import { CreatePayment } from "../use-cases/create-payment";
import { ProcessBulkPayment } from "../use-cases/process-bulk-payment";
import { type PaymentRepository } from "../repositories/payment-repository";
import { PaymentRepositoryFactory } from "../repositories/implementations/payment-repository-factory";

declare module "@fastify/awilix" {
  interface Cradle {
    appConfig: AppConfig;
    logger: FastifyBaseLogger;
    redis: Redis;
    paymentProcessorGateway: PaymentProcessorGateway;
    bullMQWrapper: BullMQWrapper;
    paymentQueueService: PaymentQueueService;
    batchProcessorService: BatchProcessorService;
    createPayment: CreatePayment;
    processBulkPayment: ProcessBulkPayment;
    paymentRepository: PaymentRepository;
  }
}

const diContainerPlugin: FastifyPluginAsync = async (
  fastify: FastifyInstance
) => {
  fastify.log.info("Registering DI Container plugin...");
  await fastify.register(fastifyAwilixPlugin, {
    disposeOnClose: true,
    disposeOnResponse: true,
  });
  const paymentRepository = PaymentRepositoryFactory.create("redis", {
    redis: fastify.redis,
    logger: fastify.log,
  });
  const batchProcessorConfig = {
    batchSize: fastify.appConfig.BATCH_SIZE,
    intervalMs: fastify.appConfig.BATCH_INTERVAL_MS,
  };
  diContainer.register({
    appConfig: asValue(fastify.appConfig),
    logger: asValue(fastify.log),
    redis: asValue(fastify.redis),
    paymentProcessorGateway: asClass(PaymentProcessorGateway).singleton(),
    bullMQWrapper: asClass(BullMQWrapper).singleton(),
    paymentQueueService: asClass(PaymentQueueService).singleton(),
    batchProcessorService: asClass(BatchProcessorService)
      .singleton()
      .inject(() => ({
        config: batchProcessorConfig,
      })),
    createPayment: asClass(CreatePayment).singleton(),
    processBulkPayment: asClass(ProcessBulkPayment).singleton(),
    paymentRepository: asValue(paymentRepository),
  });
  fastify.log.info("DI Container plugin registered successfully");
};

export default fp(diContainerPlugin);
