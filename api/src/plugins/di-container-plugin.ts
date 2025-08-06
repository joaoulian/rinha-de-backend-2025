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
import { HostHealthCacheService } from "../services/host-health-cache.service";
import { CreatePayment } from "../use-cases/create-payment";
import { ProcessPayment } from "../use-cases/process-payment";
import Redis from "ioredis";
import { RedisPaymentRepository } from "../repositories/payment-repository";

declare module "@fastify/awilix" {
  interface Cradle {
    appConfig: AppConfig;
    logger: FastifyBaseLogger;
    redis: Redis;
    hostHealthCacheService: HostHealthCacheService;
    paymentProcessorGateway: PaymentProcessorGateway;
    bullMQWrapper: BullMQWrapper;
    paymentQueueService: PaymentQueueService;
    createPayment: CreatePayment;
    processPayment: ProcessPayment;
    redisPaymentRepository: RedisPaymentRepository;
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
  diContainer.register({
    appConfig: asValue(fastify.appConfig),
    logger: asValue(fastify.log),
    redis: asValue(fastify.redis),
    hostHealthCacheService: asClass(HostHealthCacheService).singleton(),
    paymentProcessorGateway: asClass(PaymentProcessorGateway).singleton(),
    bullMQWrapper: asClass(BullMQWrapper).singleton(),
    paymentQueueService: asClass(PaymentQueueService).singleton(),
    createPayment: asClass(CreatePayment).singleton(),
    processPayment: asClass(ProcessPayment).singleton(),
    redisPaymentRepository: asClass(RedisPaymentRepository).singleton(),
  });
  fastify.log.info("DI Container plugin registered successfully");
};

export default fp(diContainerPlugin);
