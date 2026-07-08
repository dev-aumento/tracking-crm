import { bootstrapMongo } from "./migrate-indexes";

let migrationPromise: Promise<void> | null = null;

export function ensureSchema() {
  if (!migrationPromise) {
    migrationPromise = bootstrapMongo().catch((error) => {
      migrationPromise = null;
      throw error;
    });
  }
  return migrationPromise;
}
