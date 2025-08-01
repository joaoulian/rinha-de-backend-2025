import { AppBuilder } from "./app-builder";

async function start() {
  try {
    const appManager = new AppBuilder();
    const app = await appManager.build();
    const appConfig = app.diContainer.resolve("appConfig");
    await app.listen({
      host: "0.0.0.0",
      port: app.appConfig.PORT,
    });
    app.log.info(`📝 Environment: ${appConfig.NODE_ENV}`);
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
