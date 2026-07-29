import { bootstrapMongo } from "./migrate-indexes";
import { resetMongoConnection, withMongoRetry } from "../queries/mongo";

let migrationPromise: Promise<void> | null = null;

export function ensureSchema() {
  if (!migrationPromise) {
    migrationPromise = withMongoRetry(() => bootstrapMongo()).catch((error) => {
      migrationPromise = null;
      // Drop the cached client so the next attempt opens a fresh connection.
      void resetMongoConnection();
      throw error;
    });
  }
  return migrationPromise;
}
