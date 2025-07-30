import { AppManager } from "./app";

async function start() {
  try {
    const appManager = new AppManager();
    await appManager.start();
  } catch (error) {
    console.error("❌ Error starting server:", error);
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
