import type { Config } from ".";

export const testConfig: Config = {
  port: 30001,
  host: "0.0.0.0",
  nodeEnv: "test",
  logLevel: "debug",
  disableLog: true,
  processorDefaultUrl: "http://localhost:30001",
  processorFallbackUrl: "http://localhost:30001",
};
