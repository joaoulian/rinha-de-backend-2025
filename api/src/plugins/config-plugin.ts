import * as dotenv from "dotenv";
import { type FastifyInstance, type FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";

const environmentConfigSchema = z.object({
  PORT: z.coerce.number().default(3004),
  NODE_ENV: z
    .enum(["local", "development", "production", "test"])
    .default("development"),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
  PROCESSOR_DEFAULT_URL: z.string().default("http://localhost:8001"),
  PROCESSOR_FALLBACK_URL: z.string().default("http://localhost:8002"),
  RABBITMQ_URL: z.string().default("amqp://localhost:5672"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
});

// Load environment variables
if (process.env.NODE_ENV !== "test") {
  dotenv.config();
}

// Local overrides
if (process.env.NODE_ENV === "local") {
  dotenv.config({ path: ".env.local", override: true });
}

export type AppConfig = z.infer<typeof environmentConfigSchema>;

declare module "fastify" {
  interface FastifyInstance {
    appConfig: AppConfig;
  }
}

const configPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const config = environmentConfigSchema.parse(process.env);
  fastify.decorate("appConfig", config);
};

export default fp(configPlugin);
