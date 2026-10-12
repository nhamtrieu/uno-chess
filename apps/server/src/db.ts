import { MongoClient, type Collection, type Db } from "mongodb";

export interface UserDoc {
  username: string;
  uname: string; // lower-cased, for case-insensitive uniqueness
  salt: string;
  passHash: string; // empty for Google-only accounts
  googleSub?: string;
  elo: number;
  games: number;
  wins: number;
  createdAt: number;
}

export interface GameDoc {
  userId: string;
  opponent: string;
  opponentElo: number;
  mode: string;
  won: boolean;
  eloBefore: number;
  eloAfter: number;
  playedAt: number;
  mySeat: number;
  hasReplay: boolean;
  replay?: string; // JSON frames
}

let client: MongoClient | undefined;
let db: Promise<Db> | undefined;

/** Connects lazily on first use, so rooms that never touch accounts (and their tests) need no database. */
export function getDb(): Promise<Db> {
  db ??= (async () => {
    const uri = process.env.MONGODB_URI ?? "mongodb://localhost:27017/uno-chess";
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    const d = client.db(process.env.MONGODB_DB); // falls back to the database named in the URI
    await Promise.all([
      d.collection("users").createIndex({ uname: 1 }, { unique: true }),
      d.collection("users").createIndex({ googleSub: 1 }, { unique: true, sparse: true }),
      d.collection("users").createIndex({ elo: -1 }),
      d.collection("games").createIndex({ userId: 1, playedAt: -1 }),
    ]);
    return d;
  })();
  db.catch(() => (db = undefined)); // allow a retry after a failed connection
  return db;
}

export const users = async (): Promise<Collection<UserDoc>> => (await getDb()).collection<UserDoc>("users");
export const games = async (): Promise<Collection<GameDoc>> => (await getDb()).collection<GameDoc>("games");

export async function closeDb() {
  await client?.close();
  client = undefined;
  db = undefined;
}
