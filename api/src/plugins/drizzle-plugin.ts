import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { DatabaseManager, DrizzleDB } from "../db/database-manager";

declare module "fastify" {
  interface FastifyInstance {
    db: DrizzleDB;
  }
}

const drizzlePlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.log.info("Registering Drizzle plugin...");

  const databaseManager = new DatabaseManager(fastify.appConfig, fastify.log);
  const db = await databaseManager.connect();

  fastify.decorate("db", db);

  fastify.addHook("onClose", async () => {
    await databaseManager.disconnect();
  });

  fastify.log.info("Drizzle plugin registered successfully");
};

export default fp(drizzlePlugin);
