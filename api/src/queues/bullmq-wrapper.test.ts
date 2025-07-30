import { BullMQWrapper } from "./bullmq-wrapper";
import type { FastifyBaseLogger } from "fastify";
import type { AppConfig } from "../plugins/config-plugin";

// Mock Redis and BullMQ
jest.mock("ioredis");
jest.mock("bullmq");

const mockLogger: FastifyBaseLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
  fatal: jest.fn(),
  child: jest.fn(() => mockLogger),
  level: "info",
  silent: false,
} as any;

const mockAppConfig: AppConfig = {
  PORT: 3000,
  NODE_ENV: "test",
  LOG_LEVEL: "info",
  PROCESSOR_DEFAULT_URL: "http://localhost:8001",
  PROCESSOR_FALLBACK_URL: "http://localhost:8002",
  RABBITMQ_URL: "amqp://localhost:5672",
  REDIS_URL: "redis://localhost:6379",
};

describe("BullMQWrapper", () => {
  let bullMQWrapper: BullMQWrapper;

  beforeEach(() => {
    jest.clearAllMocks();
    bullMQWrapper = new BullMQWrapper({
      logger: mockLogger,
      appConfig: mockAppConfig,
    });
  });

  afterEach(async () => {
    await bullMQWrapper.shutdown();
  });

  describe("getQueue", () => {
    it("should create a new queue if it does not exist", () => {
      const queueName = "test-queue";
      const queue = bullMQWrapper.getQueue(queueName);

      expect(queue).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        { queueName },
        "Queue created"
      );
    });

    it("should return existing queue if it already exists", () => {
      const queueName = "test-queue";
      const queue1 = bullMQWrapper.getQueue(queueName);
      const queue2 = bullMQWrapper.getQueue(queueName);

      expect(queue1).toBe(queue2);
    });
  });

  describe("createWorker", () => {
    it("should create a worker for a queue", () => {
      const queueName = "test-queue";
      const handler = jest.fn().mockResolvedValue("success");

      const worker = bullMQWrapper.createWorker(queueName, handler);

      expect(worker).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        { queueName },
        "Worker created"
      );
    });

    it("should throw error if worker already exists for queue", () => {
      const queueName = "test-queue";
      const handler = jest.fn().mockResolvedValue("success");

      bullMQWrapper.createWorker(queueName, handler);

      expect(() => {
        bullMQWrapper.createWorker(queueName, handler);
      }).toThrow(`Worker for queue '${queueName}' already exists`);
    });
  });

  describe("addJob", () => {
    it("should add a job to the queue", async () => {
      const queueName = "test-queue";
      const jobName = "test-job";
      const jobData = { test: "data" };

      // Mock the queue.add method
      const mockQueue = {
        add: jest.fn().mockResolvedValue({ id: "job-123" }),
      };

      jest.spyOn(bullMQWrapper, "getQueue").mockReturnValue(mockQueue as any);

      const job = await bullMQWrapper.addJob(queueName, jobName, jobData);

      expect(mockQueue.add).toHaveBeenCalledWith(jobName, jobData, undefined);
      expect(job.id).toBe("job-123");
      expect(mockLogger.debug).toHaveBeenCalledWith(
        { jobId: "job-123", queueName, jobName },
        "Job added to queue"
      );
    });
  });

  describe("getQueueInfo", () => {
    it("should return queue information", async () => {
      const queueName = "test-queue";

      const mockQueue = {
        getWaiting: jest.fn().mockResolvedValue([1, 2]),
        getActive: jest.fn().mockResolvedValue([3]),
        getCompleted: jest.fn().mockResolvedValue([4, 5, 6]),
        getFailed: jest.fn().mockResolvedValue([7]),
        getDelayed: jest.fn().mockResolvedValue([]),
        isPaused: jest.fn().mockResolvedValue(false),
      };

      jest.spyOn(bullMQWrapper, "getQueue").mockReturnValue(mockQueue as any);

      const queueInfo = await bullMQWrapper.getQueueInfo(queueName);

      expect(queueInfo).toEqual({
        name: queueName,
        waiting: 2,
        active: 1,
        completed: 3,
        failed: 1,
        delayed: 0,
        paused: false,
      });
    });
  });

  describe("pauseQueue and resumeQueue", () => {
    it("should pause and resume a queue", async () => {
      const queueName = "test-queue";

      const mockQueue = {
        pause: jest.fn().mockResolvedValue(undefined),
        resume: jest.fn().mockResolvedValue(undefined),
      };

      jest.spyOn(bullMQWrapper, "getQueue").mockReturnValue(mockQueue as any);

      await bullMQWrapper.pauseQueue(queueName);
      expect(mockQueue.pause).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        { queueName },
        "Queue paused"
      );

      await bullMQWrapper.resumeQueue(queueName);
      expect(mockQueue.resume).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        { queueName },
        "Queue resumed"
      );
    });
  });

  describe("cleanQueue", () => {
    it("should clean jobs from a queue", async () => {
      const queueName = "test-queue";
      const cleanedJobIds = ["job-1", "job-2", "job-3"];

      const mockQueue = {
        clean: jest.fn().mockResolvedValue(cleanedJobIds),
      };

      jest.spyOn(bullMQWrapper, "getQueue").mockReturnValue(mockQueue as any);

      const result = await bullMQWrapper.cleanQueue(
        queueName,
        1000,
        50,
        "completed"
      );

      expect(mockQueue.clean).toHaveBeenCalledWith(1000, 50, "completed");
      expect(result).toEqual(cleanedJobIds);
      expect(mockLogger.info).toHaveBeenCalledWith(
        { queueName, cleanedCount: 3, type: "completed" },
        "Queue cleaned"
      );
    });
  });

  describe("getJob", () => {
    it("should get a job by ID", async () => {
      const queueName = "test-queue";
      const jobId = "job-123";
      const mockJob = { id: jobId, data: { test: "data" } };

      const mockQueue = {
        getJob: jest.fn().mockResolvedValue(mockJob),
      };

      jest.spyOn(bullMQWrapper, "getQueue").mockReturnValue(mockQueue as any);

      const job = await bullMQWrapper.getJob(queueName, jobId);

      expect(mockQueue.getJob).toHaveBeenCalledWith(jobId);
      expect(job).toEqual(mockJob);
    });
  });

  describe("removeJob", () => {
    it("should remove a job by ID", async () => {
      const queueName = "test-queue";
      const jobId = "job-123";

      const mockJob = {
        remove: jest.fn().mockResolvedValue(undefined),
      };

      const mockQueue = {
        getJob: jest.fn().mockResolvedValue(mockJob),
      };

      jest.spyOn(bullMQWrapper, "getQueue").mockReturnValue(mockQueue as any);

      await bullMQWrapper.removeJob(queueName, jobId);

      expect(mockQueue.getJob).toHaveBeenCalledWith(jobId);
      expect(mockJob.remove).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        { queueName, jobId },
        "Job removed"
      );
    });

    it("should handle case when job does not exist", async () => {
      const queueName = "test-queue";
      const jobId = "non-existent-job";

      const mockQueue = {
        getJob: jest.fn().mockResolvedValue(null),
      };

      jest.spyOn(bullMQWrapper, "getQueue").mockReturnValue(mockQueue as any);

      await bullMQWrapper.removeJob(queueName, jobId);

      expect(mockQueue.getJob).toHaveBeenCalledWith(jobId);
      expect(mockLogger.debug).not.toHaveBeenCalledWith(
        { queueName, jobId },
        "Job removed"
      );
    });
  });

  describe("utility methods", () => {
    it("should return queue names", () => {
      bullMQWrapper.getQueue("queue1");
      bullMQWrapper.getQueue("queue2");

      const queueNames = bullMQWrapper.getQueueNames();
      expect(queueNames).toContain("queue1");
      expect(queueNames).toContain("queue2");
    });

    it("should check if queue exists", () => {
      bullMQWrapper.getQueue("existing-queue");

      expect(bullMQWrapper.hasQueue("existing-queue")).toBe(true);
      expect(bullMQWrapper.hasQueue("non-existing-queue")).toBe(false);
    });

    it("should check if worker exists", () => {
      const handler = jest.fn();
      bullMQWrapper.createWorker("queue-with-worker", handler);

      expect(bullMQWrapper.hasWorker("queue-with-worker")).toBe(true);
      expect(bullMQWrapper.hasWorker("queue-without-worker")).toBe(false);
    });

    it("should return Redis connection", () => {
      const redis = bullMQWrapper.getRedisConnection();
      expect(redis).toBeDefined();
    });
  });
});
