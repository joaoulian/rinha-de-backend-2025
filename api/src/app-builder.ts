import { fastify } from "fastify";
import type { PinoLoggerOptions } from "fastify/types/logger";
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from "fastify-type-provider-zod";
import configPlugin from "./plugins/config-plugin";
import redisPlugin from "./plugins/redis-plugin";
import diContainerPlugin from "./plugins/di-container-plugin";
import routes from "./routes";

export class AppBuilder {
  async build() {
    const app = fastify({
      logger: this.getLoggerConfig(),
    });
    app.withTypeProvider<ZodTypeProvider>();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(configPlugin);
    await app.register(redisPlugin);
    await app.register(diContainerPlugin);
    await app.register(routes);
    app.setErrorHandler((error, request, reply) => {
      request.log.error(error);
      reply.status(500).send({
        error: "Internal Server Error",
        message: error.message,
      });
    });
    app.setNotFoundHandler((request, reply) => {
      reply.status(404).send({
        error: "Not Found",
        message: `Route ${request.method}:${request.url} not found`,
      });
    });
    return app;
  }

  private getLoggerConfig(): PinoLoggerOptions | boolean {
    if (process.env["DISABLE_LOG"] === "true") {
      return false;
    }
    if (
      process.env["NODE_ENV"] === "development" ||
      process.env["NODE_ENV"] === "test"
    ) {
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
            hideObject: false,
          },
        },
      };
    }
    return {
      level: "error",
      messageKey: "message",
    };
  }
}
