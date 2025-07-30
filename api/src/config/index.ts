import * as dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

export interface Config {
  port: number;
  host: string;
  nodeEnv: string;
  logLevel: string;
  disableLog?: boolean;
  processorDefaultUrl: string;
  processorFallbackUrl: string;
}

export const config: Config = {
  port: Number(process.env["PORT"]) || 3000,
  host: process.env["HOST"] || "0.0.0.0",
  nodeEnv: process.env["NODE_ENV"] || "development",
  logLevel: process.env["LOG_LEVEL"] || "info",
  processorDefaultUrl: process.env["PROCESSOR_DEFAULT_URL"]!,
  processorFallbackUrl: process.env["PROCESSOR_FALLBACK_URL"]!,
};
