import { FastifyBaseLogger } from "fastify";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { AppConfig } from "../plugins/config-plugin";
import { schema } from "./schema";

export interface DatabaseConfig {
  connectionString: string;
  pool?: {
    min?: number;
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
  };
}

export type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;

export class DatabaseManager {
  private readonly logger: FastifyBaseLogger;
  private readonly config: DatabaseConfig;
  private pool: Pool | null = null;
  private db: DrizzleDB | null = null;

  constructor(appConfig: AppConfig, logger: FastifyBaseLogger) {
    this.logger = logger;
    this.config = this.buildDatabaseConfig(appConfig);
  }

  private buildDatabaseConfig(appConfig: AppConfig): DatabaseConfig {
    return {
      connectionString: appConfig.DATABASE_URL,
      pool: {
        min: 2,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      },
    };
  }

  async connect(): Promise<DrizzleDB> {
    if (this.db) {
      return this.db;
    }
    try {
      this.logger.info("Connecting to PostgreSQL database...");
      this.pool = new Pool({
        connectionString: this.config.connectionString,
        min: this.config.pool?.min,
        max: this.config.pool?.max,
        idleTimeoutMillis: this.config.pool?.idleTimeoutMillis,
        connectionTimeoutMillis: this.config.pool?.connectionTimeoutMillis,
      });
      const client = await this.pool.connect();
      await client.query("SELECT 1");
      client.release();
      this.db = drizzle(this.pool, { schema });
      this.setupPoolEventHandlers();
      this.logger.info("Successfully connected to PostgreSQL database");
      return this.db;
    } catch (error) {
      this.logger.error({ error }, "Failed to connect to PostgreSQL database");
      throw error;
    }
  }

  private setupPoolEventHandlers(): void {
    if (!this.pool) return;
    this.pool.on("connect", (client) => {
      this.logger.debug("New database client connected");
    });
    this.pool.on("acquire", (client) => {
      this.logger.debug("Database client acquired from pool");
    });
    this.pool.on("release", (client) => {
      this.logger.debug("Database client released back to pool");
    });
    this.pool.on("remove", (client) => {
      this.logger.debug("Database client removed from pool");
    });
    this.pool.on("error", (error, client) => {
      this.logger.error({ error }, "Database pool error");
    });
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      this.logger.info("Disconnecting from PostgreSQL database...");
      await this.pool.end();
      this.pool = null;
      this.db = null;
      this.logger.info("Disconnected from PostgreSQL database");
    }
  }

  getDatabase(): DrizzleDB {
    if (!this.db) {
      throw new Error("Database not connected. Call connect() first.");
    }
    return this.db;
  }
}
