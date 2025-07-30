import axios from "axios";
import type { FastifyBaseLogger } from "fastify";
import type { Config } from "../config";

export type ProcessPaymentInput = {
  amount: number;
  correlationId: string;
  requestedAt: Date;
};

export type Host = "default" | "fallback";

export interface PaymentProcessorGatewayDeps {
  logger: FastifyBaseLogger;
  config: Config;
}

export class PaymentProcessorGateway {
  private readonly serverUrls: {
    [key in Host]: string;
  };
  private readonly logger: PaymentProcessorGatewayDeps["logger"];

  constructor(deps: PaymentProcessorGatewayDeps) {
    this.serverUrls = {
      ["default"]: deps.config.processorDefaultUrl,
      ["fallback"]: deps.config.processorFallbackUrl,
    };
    this.logger = deps.logger;
  }

  async processPayment(
    input: ProcessPaymentInput,
    host: Host = "default"
  ): Promise<void> {
    try {
      this.logger.info(
        `Processing payment: ${JSON.stringify(input)}, host: ${host}`
      );
      await axios.post<ProcessPaymentInput>(
        this.getHostUrl(host) + "/payments",
        input
      );
      return;
    } catch (e) {
      this.logger.error(`Error in ${host} payment processor`);
      throw e;
    }
  }

  async checkHealth(
    host: Host = "default"
  ): Promise<{ failing: boolean; minResponseTime: number }> {
    try {
      this.logger.info(`Checking health of ${host} payment processor`);
      const response = await axios.get<{
        failing: boolean;
        minResponseTime: number;
      }>(this.getHostUrl(host) + "/payments/service-health");
      return response.data;
    } catch (e) {
      this.logger.error({ error: e }, `Error in ${host} payment processor`);
      throw e;
    }
  }

  private getHostUrl(host: Host): string {
    return this.serverUrls[host];
  }
}
