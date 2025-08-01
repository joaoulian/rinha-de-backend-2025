import axios from "axios";
import type { FastifyBaseLogger } from "fastify";
import type { AppConfig } from "../plugins/config-plugin";
import type { HostHealthCacheService } from "../services/host-health-cache.service";

export type ProcessPaymentInput = {
  amount: number;
  correlationId: string;
  requestedAt: Date;
};

export type Host = "default" | "fallback";

export interface PaymentProcessorGatewayDeps {
  logger: FastifyBaseLogger;
  appConfig: AppConfig;
  hostHealthCacheService: HostHealthCacheService;
}

export class PaymentProcessorGateway {
  private readonly serverUrls: {
    [key in Host]: string;
  };
  private readonly logger: PaymentProcessorGatewayDeps["logger"];
  private readonly hostHealthCacheService: PaymentProcessorGatewayDeps["hostHealthCacheService"];

  constructor(deps: PaymentProcessorGatewayDeps) {
    this.serverUrls = {
      ["default"]: deps.appConfig.PROCESSOR_DEFAULT_URL,
      ["fallback"]: deps.appConfig.PROCESSOR_FALLBACK_URL,
    };
    this.logger = deps.logger;
    this.hostHealthCacheService = deps.hostHealthCacheService;
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
        {
          amount: input.amount,
          correlationId: input.correlationId,
          requestedAt: input.requestedAt.toISOString(),
        }
      );
      return;
    } catch (e: any) {
      this.logger.error(
        { error: e.message },
        `Error in ${host} payment processor`
      );
      throw e;
    }
  }

  async checkHealth(
    host: Host = "default"
  ): Promise<{ failing: boolean; minResponseTime: number }> {
    this.logger.debug({ host }, "Checking host health");
    const cachedHealth = await this.hostHealthCacheService.getCachedHealth(
      host
    );
    if (cachedHealth) {
      this.logger.debug(
        { host, cachedAt: cachedHealth.cachedAt },
        "Using cached health data"
      );
      return {
        failing: cachedHealth.failing,
        minResponseTime: cachedHealth.minResponseTime,
      };
    }
    const healthData = await this.fetchHealth(host);
    await this.hostHealthCacheService.cacheHealth(host, healthData);
    return healthData;
  }

  async fetchHealth(
    host: Host = "default"
  ): Promise<{ failing: boolean; minResponseTime: number }> {
    try {
      this.logger.debug({ host }, "Fetching host health");
      const response = await axios.get<{
        failing: boolean;
        minResponseTime: number;
      }>(this.getHostUrl(host) + "/payments/service-health");
      return response.data;
    } catch (e: any) {
      this.logger.error(
        { error: e.message },
        `Error in ${host} payment processor`
      );
      return {
        failing: true,
        minResponseTime: 0,
      };
    }
  }

  async getBestAvailableHost(): Promise<{
    host: Host;
    minResponseTime: number;
    failing: boolean;
  }> {
    const [defaultHealth, fallbackHealth] = await Promise.all([
      this.checkHealth("default"),
      this.checkHealth("fallback"),
    ]);
    if (!defaultHealth.failing) {
      return {
        host: "default",
        minResponseTime: defaultHealth.minResponseTime,
        failing: defaultHealth.failing,
      };
    } else if (!fallbackHealth.failing) {
      return {
        host: "fallback",
        minResponseTime: fallbackHealth.minResponseTime,
        failing: fallbackHealth.failing,
      };
    } else {
      this.logger.warn("Both hosts appear unhealthy, using default");
      return {
        host: "default",
        minResponseTime: defaultHealth.minResponseTime,
        failing: defaultHealth.failing,
      };
    }
  }

  private getHostUrl(host: Host): string {
    return this.serverUrls[host];
  }
}
