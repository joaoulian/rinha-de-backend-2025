import type { FastifyBaseLogger } from "fastify";
import type Redis from "ioredis";
import type { Host } from "../gateways/payment-processor-gateway";

export interface HostHealthData {
  failing: boolean;
  minResponseTime: number;
  cachedAt: Date;
}

export interface HostHealthCacheServiceDeps {
  redis: Redis;
  logger: FastifyBaseLogger;
}

export class HostHealthCacheService {
  private readonly redis: Redis;
  private readonly logger: FastifyBaseLogger;
  private readonly CACHE_TTL_SECONDS = 5;
  private readonly CACHE_KEY_PREFIX = "host_health:";

  constructor(deps: HostHealthCacheServiceDeps) {
    this.redis = deps.redis;
    this.logger = deps.logger;
  }

  async getCachedHealth(host: Host): Promise<HostHealthData | null> {
    try {
      const cacheKey = this.getCacheKey(host);
      const cachedData = await this.redis.get(cacheKey);
      if (!cachedData) {
        this.logger.debug({ host }, "No cached health data found");
        return null;
      }
      const healthData: HostHealthData = JSON.parse(cachedData);
      this.logger.debug({ host, healthData }, "Retrieved cached health data");
      return healthData;
    } catch (error) {
      this.logger.error({ error, host }, "Failed to get cached health data");
      return null;
    }
  }

  async cacheHealth(
    host: Host,
    healthData: Omit<HostHealthData, "cachedAt">
  ): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(host);
      const dataToCache: HostHealthData = {
        ...healthData,
        cachedAt: new Date(),
      };
      await this.redis.setex(
        cacheKey,
        this.CACHE_TTL_SECONDS,
        JSON.stringify(dataToCache)
      );
      this.logger.debug(
        { host, healthData: dataToCache, ttl: this.CACHE_TTL_SECONDS },
        "Cached health data"
      );
    } catch (error) {
      this.logger.error(
        { error, host, healthData },
        "Failed to cache health data"
      );
    }
  }

  async isCacheValid(host: Host): Promise<boolean> {
    try {
      const cacheKey = this.getCacheKey(host);
      const ttl = await this.redis.ttl(cacheKey);
      return ttl > 0;
    } catch (error) {
      this.logger.error({ error, host }, "Failed to check cache validity");
      return false;
    }
  }

  async invalidateCache(host: Host): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(host);
      await this.redis.del(cacheKey);
      this.logger.debug({ host }, "Invalidated cached health data");
    } catch (error) {
      this.logger.error({ error, host }, "Failed to invalidate cache");
    }
  }

  async getAllCachedHealth(): Promise<Record<Host, HostHealthData | null>> {
    const hosts: Host[] = ["default", "fallback"];
    const results: Record<Host, HostHealthData | null> = {} as any;

    await Promise.all(
      hosts.map(async (host) => {
        results[host] = await this.getCachedHealth(host);
      })
    );

    return results;
  }

  async clearAllCache(): Promise<void> {
    try {
      const pattern = `${this.CACHE_KEY_PREFIX}*`;
      const keys = await this.redis.keys(pattern);

      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.logger.info(
          { deletedKeys: keys.length },
          "Cleared all cached health data"
        );
      }
    } catch (error) {
      this.logger.error({ error }, "Failed to clear all cached health data");
    }
  }

  private getCacheKey(host: Host): string {
    return `${this.CACHE_KEY_PREFIX}${host}`;
  }
}
