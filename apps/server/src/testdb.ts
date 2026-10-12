import { getDb, closeDb } from "./db";

/** Gives a test file its own throw-away database; call before importing accounts/rooms. */
export function useTestDb() {
  process.env.MONGODB_DB = `uno-chess-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  return async () => {
    await (await getDb()).dropDatabase();
    await closeDb();
  };
}
