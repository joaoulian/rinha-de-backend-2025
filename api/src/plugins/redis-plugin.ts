import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import Redis from "ioredis";

declare module "fastify" {
  interface FastifyInstance {
    redis: Redis;
  }
}

const redisPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.log.info("Registering Redis plugin...");
  const redis = new Redis(fastify.appConfig.REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
  // Setup Redis event handlers
  redis.on("connect", () => {
    fastify.log.info("Connected to Redis");
  });
  redis.on("error", (error) => {
    fastify.log.error({ error }, "Redis connection error");
  });
  redis.on("close", () => {
    fastify.log.warn("Redis connection closed");
  });
  redis.on("reconnecting", () => {
    fastify.log.info("Reconnecting to Redis...");
  });
  fastify.decorate("redis", redis);
  fastify.addHook("onClose", async () => {
    fastify.log.info("Closing Redis connection...");
    await redis.quit();
  });
  fastify.log.info("Redis plugin registered successfully");
};

export default fp(redisPlugin);
