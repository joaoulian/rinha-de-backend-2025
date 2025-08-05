import { WorkerBuilder } from "./worker-builder";

async function start() {
  try {
    const appManager = new WorkerBuilder();
    await appManager.build();
  } catch (error) {
    console.error("❌ Error starting workers:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n👋 Gracefully shutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n👋 Gracefully shutting down...");
  process.exit(0);
});

start();
