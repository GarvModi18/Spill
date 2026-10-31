import { parseEnvironment, createLogger } from "@spill/shared";
import { MongoAuthStore } from "./auth/mongo-store.js";
import { connectToDatabase } from "./database.js";
import { createApp } from "./app.js";

const env = parseEnvironment();
const logger = createLogger("api", env.LOG_LEVEL);

try {
  const database = await connectToDatabase(env.MONGODB_URI);
  const authStore = new MongoAuthStore(database.db());
  await authStore.createIndexes();
  const server = createApp(database, authStore, env).listen(env.PORT, () => {
    logger.info("API listening", { port: env.PORT, environment: env.NODE_ENV });
  });

  const shutdown = async (signal: string) => {
    logger.info("Shutting down API", { signal });
    server.close(async () => {
      await database.close();
      process.exit(0);
    });
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
} catch (error) {
  logger.error("API startup failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
}
