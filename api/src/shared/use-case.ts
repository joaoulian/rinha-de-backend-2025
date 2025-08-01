import { FastifyBaseLogger } from "fastify";
import { IInstrumentation, Instrumentation } from "./instrumentation";

export abstract class UseCase<Request extends Record<string, any>, Response> {
  constructor(private readonly logger: FastifyBaseLogger) {}

  abstract serviceName: string;

  abstract run(
    instrumentation: IInstrumentation,
    request: Request
  ): Promise<Response>;

  async execute(request: Request): Promise<Response> {
    const instrumentation = new Instrumentation<Request>({
      logger: this.logger,
      request,
      serviceName: this.serviceName,
    });
    instrumentation.logStarted();
    try {
      const response = await this.run(instrumentation, request);
      return response;
    } catch (err: any) {
      instrumentation.logErrorOccurred(err);
      throw err;
    } finally {
      instrumentation.logEnded();
    }
  }
}
