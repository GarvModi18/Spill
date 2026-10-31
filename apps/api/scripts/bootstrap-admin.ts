import { z } from "zod";
import { parseEnvironment } from "@spill/shared";
import { MongoAuthStore } from "../src/auth/mongo-store.js";
import { hashPassword } from "../src/auth/password.js";
import { connectToDatabase } from "../src/database.js";

const bootstrapSchema = z.object({
  BOOTSTRAP_ADMIN_EMAIL: z.email().transform((email) => email.trim().toLowerCase()),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(12).max(128),
});

const environment = parseEnvironment();
const credentials = bootstrapSchema.safeParse(process.env);
if (!credentials.success) {
  throw new Error(
    "Set a valid BOOTSTRAP_ADMIN_EMAIL and a BOOTSTRAP_ADMIN_PASSWORD of 12–128 characters.",
  );
}

const databaseClient = await connectToDatabase(environment.MONGODB_URI);
try {
  const store = new MongoAuthStore(databaseClient.db());
  await store.createIndexes();
  if (await store.findUserByEmail(credentials.data.BOOTSTRAP_ADMIN_EMAIL)) {
    throw new Error(
      "That account already exists. Admin bootstrap does not change existing accounts.",
    );
  }
  const admin = await store.createUser({
    name: "Spill Admin",
    email: credentials.data.BOOTSTRAP_ADMIN_EMAIL,
    passwordHash: await hashPassword(credentials.data.BOOTSTRAP_ADMIN_PASSWORD),
    role: "admin",
    emailPreferences: { teaUpdates: true, productUpdates: false },
    createdAt: new Date(),
  });
  process.stdout.write(`Created admin account ${admin.email} (${admin.id}).\n`);
} finally {
  await databaseClient.close();
}
