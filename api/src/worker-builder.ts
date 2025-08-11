import { fastify, FastifyInstance } from "fastify";
import type { PinoLoggerOptions } from "fastify/types/logger";
import configPlugin from "./plugins/config-plugin";
import redisPlugin from "./plugins/redis-plugin";
import diContainerPlugin from "./plugins/di-container-plugin";

export class WorkerBuilder {
  async build() {
    const app = fastify({
      logger: this.getLoggerConfig(),
    });
    await app.register(configPlugin);
    await app.register(redisPlugin);
    await app.register(diContainerPlugin);
    this.createWorkers(app);
    return app;
  }

  private createWorkers(app: FastifyInstance): void {
    const processBulkPayment = app.diContainer.resolve("processBulkPayment");
    const paymentQueueService = app.diContainer.resolve("paymentQueueService");
    const batchProcessorService = app.diContainer.resolve(
      "batchProcessorService"
    );
    paymentQueueService.registerBulkWorker(
      processBulkPayment.execute.bind(processBulkPayment)
    );
    batchProcessorService.start();
    const gracefulShutdown = async () => {
      app.log.info("Shutting down batch processor...");
      batchProcessorService.stop();
    };
    process.on("SIGINT", gracefulShutdown);
    process.on("SIGTERM", gracefulShutdown);
  }

  private getLoggerConfig(): PinoLoggerOptions | boolean {
    if (process.env["DISABLE_LOG"] === "true") {
      return false;
    }
    return {
      level: process.env["LOG_LEVEL"] || "info",
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
          messageFormat: "{msg}",
          customLevels: "trace:10,debug:20,info:30,warn:40,error:50,fatal:60",
          useOnlyCustomProps: false,
          singleLine: false,
          hideObject: true,
        },
      },
    };
  }
}
