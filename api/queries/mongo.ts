import { MongoClient, type Collection, type Db, type Document, type Filter } from "mongodb";
import { Collections, type CollectionName } from "@db/mongo/collections";
import { env, isMongoUriConfigured } from "../lib/env";

let client: MongoClient | null = null;
let db: Db | null = null;
let connectPromise: Promise<Db> | null = null;

export async function getMongoDb(): Promise<Db> {
  if (db) return db;

  if (!connectPromise) {
    connectPromise = (async () => {
      if (!isMongoUriConfigured()) {
        throw new Error(
          "MongoDB is not configured. Set MONGODB_CLUSTER_HOST (and MONGODB_USER / MONGODB_PASSWORD) in .env",
        );
      }
      client = new MongoClient(env.mongoUri, {
        serverSelectionTimeoutMS: 15000,
        connectTimeoutMS: 15000,
        family: 4,
      });
      await client.connect();
      db = client.db(env.mongoDbName);
      return db;
    })().catch((error) => {
      connectPromise = null;
      throw error;
    });
  }

  return connectPromise;
}

export async function getCollection<T extends Document>(
  name: CollectionName,
): Promise<Collection<T>> {
  const database = await getMongoDb();
  return database.collection<T>(name);
}

export async function nextId(name: CollectionName): Promise<number> {
  const counters = await getCollection<{ _id: string; seq: number }>(Collections.counters);
  const result = await counters.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" },
  );
  return result?.seq ?? 1;
}

export async function findById<T extends { id: number }>(
  name: CollectionName,
  id: number,
): Promise<T | null> {
  const col = await getCollection<T>(name);
  return col.findOne({ id } as Filter<T>);
}

export async function insertDoc<T extends { id: number }>(
  name: CollectionName,
  doc: Omit<T, "id">,
): Promise<T> {
  const id = await nextId(name);
  const full = { ...doc, id } as T;
  const col = await getCollection<T>(name);
  await col.insertOne(full as Document & T);
  return full;
}

export async function updateById<T extends { id: number }>(
  name: CollectionName,
  id: number,
  patch: Partial<T>,
): Promise<T | null> {
  const col = await getCollection<T>(name);
  await col.updateOne({ id } as Filter<T>, { $set: patch });
  return findById<T>(name, id);
}

export async function countDocs(
  name: CollectionName,
  filter: Document = {},
): Promise<number> {
  const col = await getCollection(name);
  return col.countDocuments(filter);
}

export function hasMongoConfigured() {
  return isMongoUriConfigured();
}
