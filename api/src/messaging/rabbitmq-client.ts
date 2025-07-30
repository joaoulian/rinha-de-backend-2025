import amqp, { type ChannelModel, type Channel, type Message } from "amqplib";
import type { FastifyBaseLogger } from "fastify";
import type { AppConfig } from "../plugins/config-plugin";

export interface RabbitMQConfig {
  url: string;
  retryAttempts?: number;
  retryDelay?: number;
}

export interface RabbitMQClientDeps {
  logger: FastifyBaseLogger;
  appConfig: AppConfig;
}

export interface PaymentMessage {
  correlationId: string;
  amount: number;
  requestedAt: Date;
}

export class RabbitMQClient {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private readonly logger: FastifyBaseLogger;
  private readonly config: RabbitMQConfig;
  private isConnecting = false;

  private readonly PAYMENTS_QUEUE = "payments";

  constructor(deps: RabbitMQClientDeps) {
    this.logger = deps.logger;
    this.config = {
      retryAttempts: 3,
      retryDelay: 1000,
      url: deps.appConfig.RABBITMQ_URL,
    };
  }

  private async ensureConnection(): Promise<void> {
    if (this.connection && this.channel) {
      return;
    }
    if (this.isConnecting) {
      // Wait for ongoing connection
      while (this.isConnecting) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return;
    }
    this.isConnecting = true;
    try {
      this.logger.info(`Connecting to RabbitMQ: ${this.config.url}`);
      this.connection = await amqp.connect(this.config.url);
      this.channel = await this.connection.createChannel();
      this.connection.on("error", (err) => {
        this.logger.error({ error: err }, "RabbitMQ connection error");
        this.resetConnection();
      });
      this.connection.on("close", () => {
        this.logger.warn("RabbitMQ connection closed");
        this.resetConnection();
      });
      await this.setupQueuesAndExchanges();
      this.logger.info("Connected to RabbitMQ successfully");
    } catch (error) {
      this.logger.error({ error }, "Failed to connect to RabbitMQ");
      this.resetConnection();
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  private async setupQueuesAndExchanges(): Promise<void> {
    if (!this.channel) return;
    // Create queue
    await this.channel.assertQueue(this.PAYMENTS_QUEUE, {
      durable: true,
    });
    this.logger.info("RabbitMQ queues configured");
  }

  private resetConnection(): void {
    this.connection = null;
    this.channel = null;
    this.isConnecting = false;
  }

  async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      this.logger.info("Disconnected from RabbitMQ");
    } catch (error) {
      this.logger.error({ error }, "Error disconnecting from RabbitMQ");
      throw error;
    }
  }

  async publishPayment(payment: PaymentMessage): Promise<void> {
    await this.ensureConnection();
    const buffer = Buffer.from(JSON.stringify(payment));
    await this.channel!.sendToQueue(this.PAYMENTS_QUEUE, buffer, {
      persistent: true,
    });
    this.logger.debug({ payment }, "Payment message published to RabbitMQ");
  }

  async consumePayments(
    handler: (payment: PaymentMessage) => Promise<void>
  ): Promise<void> {
    await this.ensureConnection();

    await this.channel!.consume(
      this.PAYMENTS_QUEUE,
      async (msg: Message | null) => {
        if (!msg) return;
        try {
          const payment: PaymentMessage = JSON.parse(msg.content.toString());
          await handler(payment);
          this.channel!.ack(msg);
          this.logger.debug(
            { payment },
            "Payment message processed successfully"
          );
        } catch (error) {
          this.logger.error({ error }, "Error processing payment message");
          this.channel!.nack(msg, false, false);
        }
      }
    );

    this.logger.info("Started consuming payment messages");
  }
}
