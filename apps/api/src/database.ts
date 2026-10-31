import { MongoClient } from "mongodb";

export async function connectToDatabase(uri: string): Promise<MongoClient> {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  await client.db().command({ ping: 1 });
  return client;
}
