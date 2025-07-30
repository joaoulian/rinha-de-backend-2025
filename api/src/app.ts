import fastify, { type FastifyInstance } from "fastify";
import type { PinoLoggerOptions } from "fastify/types/logger";
import { type Config, config as defaultConfig } from "./config";
import { createContainer } from "./container";
import { routes } from "./routes";
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from "fastify-type-provider-zod";

export class AppManager {
  app: FastifyInstance;

  constructor(private readonly config: Config = defaultConfig) {
    this.app = fastify({
      logger: AppManager.getLoggerConfig(config),
    });
    this.config = config;
  }

  async start() {
    await this.init();
    const config = this.app.diContainer.resolve("config");
    await this.app.listen({
      port: config.port,
      host: config.host,
    });
    this.app.log.info(
      `🚀 Server running on http://${config.host}:${config.port}`
    );
    this.app.log.info(`📝 Environment: ${config.nodeEnv}`);
    this.app.log.info(`📊 Log Level: ${config.logLevel}`);
    if (config.nodeEnv === "development") {
      this.app.log.info(
        `🏥 Health check: http://${config.host}:${config.port}/health`
      );
    }
  }

  private async init() {
    this.configurePlugins();
    await createContainer(this.app, this.config);
    await this.app.register(routes);
    this.configureErrorHandlers();
  }

  private configurePlugins() {
    this.app.withTypeProvider<ZodTypeProvider>();
    this.app.setSerializerCompiler(serializerCompiler);
    this.app.setValidatorCompiler(validatorCompiler);
  }

  private configureErrorHandlers() {
    this.app.setErrorHandler((error, request, reply) => {
      request.log.error(error);
      reply.status(500).send({
        error: "Internal Server Error",
        message: error.message,
      });
    });
    this.app.setNotFoundHandler((request, reply) => {
      reply.status(404).send({
        error: "Not Found",
        message: `Route ${request.method}:${request.url} not found`,
      });
    });
  }

  private static getLoggerConfig(config: Config): PinoLoggerOptions | boolean {
    if (config.disableLog) {
      return false;
    }
    if (config.nodeEnv === "development" || config.nodeEnv === "test") {
      return {
        level: config.logLevel,
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
      level: config.logLevel,
      messageKey: "message",
    };
  }

  async close() {
    await this.app.close();
  }
}
