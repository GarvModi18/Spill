import { parseEnvironment, createLogger } from "@spill/shared";
import { MongoAuthStore } from "./auth/mongo-store.js";
import { MongoReaderStore } from "./reader/mongo-store.js";
import { MongoAdminStore } from "./admin/mongo-store.js";
import { connectToDatabase } from "./database.js";
import { createApp } from "./app.js";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { createConciergeGraph, GroqConciergeModel } from "@spill/ai";
import { MongoConciergeStore } from "./concierge/mongo-store.js";

const env = parseEnvironment();
const logger = createLogger("api", env.LOG_LEVEL);

try {
  const database = await connectToDatabase(env.MONGODB_URI);
  const authStore = new MongoAuthStore(database.db());
  const readerStore = new MongoReaderStore(database.db());
  const adminStore = new MongoAdminStore(database.db());
  const conciergeStore = new MongoConciergeStore(database.db());
  const checkpointer = new MongoDBSaver({
    client: database,
    dbName: database.db().databaseName,
    checkpointCollectionName: "conciergeGraphCheckpoints",
    checkpointWritesCollectionName: "conciergeGraphCheckpointWrites",
  });
  const checkpointErrors = await checkpointer.setup();
  if (checkpointErrors.length)
    throw new AggregateError(checkpointErrors, "Could not prepare Concierge graph persistence");
  const conciergeGraph =
    env.GROQ_API_KEY && env.GROQ_MODEL
      ? createConciergeGraph(new GroqConciergeModel(env.GROQ_API_KEY, env.GROQ_MODEL), checkpointer)
      : null;
  await Promise.all([
    authStore.createIndexes(),
    readerStore.createIndexes(),
    adminStore.createIndexes(),
    conciergeStore.createIndexes(),
  ]);
  const server = createApp(
    database,
    authStore,
    env,
    readerStore,
    adminStore,
    conciergeStore,
    conciergeGraph,
  ).listen(env.PORT, () => {
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
