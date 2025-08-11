import {
  Queue,
  Worker,
  Job,
  QueueEvents,
  JobsOptions,
  WorkerOptions,
} from "bullmq";
import Redis from "ioredis";
import type { FastifyBaseLogger } from "fastify";

export interface BullMQConfig {
  defaultJobOptions?: JobsOptions;
  defaultWorkerOptions?: Omit<WorkerOptions, "connection">;
}

export interface BullMQWrapperDeps {
  logger: FastifyBaseLogger;
  redis: Redis;
}

export interface JobHandler<T = any, R = any> {
  (job: Job<T, R>): Promise<R>;
}

export interface QueueInfo {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

export class BullMQWrapper {
  private readonly logger: FastifyBaseLogger;
  private readonly config: BullMQConfig;
  private readonly redis: Redis;
  private readonly queues = new Map<string, Queue>();
  private readonly workers = new Map<string, Worker>();
  private readonly queueEvents = new Map<string, QueueEvents>();
  private isShuttingDown = false;

  constructor(deps: BullMQWrapperDeps) {
    this.logger = deps.logger;
    this.config = this.buildConfig();
    this.redis = deps.redis;
  }

  private buildConfig(): BullMQConfig {
    return {
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
      },
      defaultWorkerOptions: {
        concurrency: 50,
      },
    };
  }

  getQueue(name: string, options?: JobsOptions): Queue {
    if (this.queues.has(name)) {
      return this.queues.get(name)!;
    }
    const queue = new Queue(name, {
      connection: this.redis,
      defaultJobOptions: {
        ...this.config.defaultJobOptions,
        ...options,
      },
    });
    this.queues.set(name, queue);
    this.logger.info({ queueName: name }, "Queue created");
    return queue;
  }

  /**
   * Create a worker for a queue
   */
  createWorker<T = any, R = any>(
    queueName: string,
    handler: JobHandler<T, R>,
    options?: Omit<WorkerOptions, "connection">
  ): Worker<T, R> {
    if (this.workers.has(queueName)) {
      throw new Error(`Worker for queue '${queueName}' already exists`);
    }
    const worker = new Worker<T, R>(
      queueName,
      async (job: Job<T, R>) => {
        this.logger.debug(
          { jobId: job.id, queueName, jobData: job.data },
          "Processing job"
        );
        try {
          const result = await handler(job);
          this.logger.debug(
            { jobId: job.id, queueName },
            "Job completed successfully"
          );
          return result;
        } catch (error) {
          this.logger.error({ jobId: job.id, queueName, error }, "Job failed");
          throw error;
        }
      },
      {
        connection: this.redis,
        ...this.config.defaultWorkerOptions,
        ...options,
      }
    );
    this.setupWorkerEventHandlers(worker, queueName);
    this.workers.set(queueName, worker);
    this.logger.debug({ queueName }, "Worker created");
    return worker;
  }

  private setupWorkerEventHandlers(worker: Worker, queueName: string): void {
    worker.on("completed", (job) => {
      this.logger.debug({ jobId: job.id, queueName }, "Job completed");
    });
    worker.on("failed", (job, err) => {
      this.logger.error(
        { jobId: job?.id, queueName, error: err },
        "Job failed"
      );
    });
    worker.on("error", (err) => {
      this.logger.error({ queueName, error: err }, "Worker error");
    });
    worker.on("stalled", (jobId) => {
      this.logger.warn({ jobId, queueName }, "Job stalled");
    });
  }

  /**
   * Add a job to a queue
   */
  async addJob<T = any>(
    queueName: string,
    jobName: string,
    data: T,
    options?: JobsOptions
  ): Promise<Job<T>> {
    const queue = this.getQueue(queueName);
    const job = await queue.add(jobName, data, options);
    this.logger.debug(
      { jobId: job.id, queueName, jobName },
      "Job added to queue"
    );
    return job;
  }

  async getQueueInfo(queueName: string): Promise<QueueInfo> {
    const queue = this.getQueue(queueName);
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed(),
    ]);
    return {
      name: queueName,
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
      paused: await queue.isPaused(),
    };
  }

  async pauseQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.pause();
    this.logger.debug({ queueName }, "Queue paused");
  }

  async resumeQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.resume();
    this.logger.debug({ queueName }, "Queue resumed");
  }

  async cleanQueue(
    queueName: string,
    grace: number = 0,
    limit: number = 100,
    type: "completed" | "failed" | "active" | "waiting" = "completed"
  ): Promise<string[]> {
    const queue = this.getQueue(queueName);
    const jobs = await queue.clean(grace, limit, type);
    this.logger.debug(
      { queueName, cleanedCount: jobs.length, type },
      "Queue cleaned"
    );
    return jobs;
  }

  async getJob<T = any>(
    queueName: string,
    jobId: string
  ): Promise<Job<T> | undefined> {
    const queue = this.getQueue(queueName);
    return queue.getJob(jobId);
  }

  async removeJob(queueName: string, jobId: string): Promise<void> {
    const queue = this.getQueue(queueName);
    const job = await queue.getJob(jobId);
    if (job) {
      await job.remove();
      this.logger.debug({ queueName, jobId }, "Job removed");
    }
  }

  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.logger.info("Shutting down BullMQ wrapper...");
    const workerPromises = Array.from(this.workers.values()).map((worker) =>
      worker.close()
    );
    await Promise.all(workerPromises);

    // Close all queue events
    const queueEventPromises = Array.from(this.queueEvents.values()).map(
      (queueEvent) => queueEvent.close()
    );
    await Promise.all(queueEventPromises);

    // Close all queues
    const queuePromises = Array.from(this.queues.values()).map((queue) =>
      queue.close()
    );
    await Promise.all(queuePromises);

    // Note: Redis connection is managed by the Redis plugin and will be closed there

    this.logger.info("BullMQ wrapper shutdown complete");
  }

  getRedisConnection(): Redis {
    return this.redis;
  }

  getQueueNames(): string[] {
    return Array.from(this.queues.keys());
  }
  hasQueue(queueName: string): boolean {
    return this.queues.has(queueName);
  }

  hasWorker(queueName: string): boolean {
    return this.workers.has(queueName);
  }
}
