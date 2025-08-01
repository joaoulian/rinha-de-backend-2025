import { FastifyBaseLogger } from "fastify";

export interface IInstrumentation {
  logStarted(): void;
  logEnded(): void;
  logInfo(message: string, data?: Record<string, any>): void;
  logWarning(message: string, data?: Record<string, any>): void;
  logDebug(message: string, data?: Record<string, any>): void;
  logErrorOccurred(error: Error | unknown, message?: string): void;
}

export class Instrumentation<Request extends Record<string, any>>
  implements IInstrumentation
{
  private readonly request: Request;
  private readonly startDate: Date;
  private readonly serviceName: string;
  private readonly logger: FastifyBaseLogger;

  constructor(config: {
    logger: FastifyBaseLogger;
    request: Request;
    serviceName: string;
  }) {
    this.logger = config.logger;
    this.request = config.request;
    this.startDate = new Date();
    this.serviceName = config.serviceName;
  }

  getServiceId(): string {
    return `[${this.serviceName}]-${this.startDate.getTime()}`;
  }

  buildArguments(args?: Record<string, any>): Record<string, any> {
    return {
      request: this.request,
      serviceId: this.getServiceId(),
      serviceName: this.serviceName,
      ...args,
    };
  }

  buildMessage(message: string): string {
    return `${this.getServiceId()} ${message}`;
  }

  logInfo(message: string, data?: Record<string, any>): void {
    this.logger.info(this.buildArguments(data), this.buildMessage(message));
  }

  logWarning(message: string, data?: Record<string, any>): void {
    this.logger.warn(this.buildArguments(data), this.buildMessage(message));
  }

  logDebug(message: string, data?: Record<string, any>): void {
    this.logger.debug(this.buildArguments(data), this.buildMessage(message));
  }

  logErrorOccurred(error: Error | unknown, message?: string): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const finalMessage = message ?? "Service failed";
    this.logger.error(
      this.buildArguments({
        error: errorMessage,
        rawError: JSON.stringify(error),
      }),
      this.buildMessage(finalMessage)
    );
  }

  logStarted(): void {
    this.logInfo("Service started");
  }

  logEnded(): void {
    this.logInfo("Service ended");
  }
}
