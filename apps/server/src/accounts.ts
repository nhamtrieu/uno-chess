import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { ObjectId, type WithId } from "mongodb";
import { games, users, type UserDoc } from "./db";

export const START_ELO = 1200;
export const BOT_ELO = 1500;
export const GUEST_ELO = 1200;
const K = 32;
const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000;
// Set AUTH_SECRET in production, otherwise tokens stop working after every restart.
const SECRET = process.env.AUTH_SECRET ?? randomBytes(32).toString("hex");

export interface User {
  id: string;
  username: string;
  elo: number;
  games: number;
  wins: number;
  created_at: number;
}
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const publicUser = (d: WithId<UserDoc>): User => ({
  id: d._id.toHexString(), username: d.username, elo: d.elo, games: d.games, wins: d.wins, created_at: d.createdAt,
});

const hash = (password: string, salt: string) => scryptSync(password, salt, 64).toString("hex");
const oid = (id: string) => (ObjectId.isValid(id) ? new ObjectId(id) : null);

export function signToken(userId: string): string {
  const body = Buffer.from(JSON.stringify({ u: userId, e: Date.now() + TOKEN_TTL_MS })).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export async function verifyToken(token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", SECRET).update(body).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { u, e } = JSON.parse(Buffer.from(body, "base64url").toString());
    if (typeof u !== "string" || typeof e !== "number" || e < Date.now()) return null;
    return await getUser(u);
  } catch {
    return null;
  }
}

export async function getUser(id: string): Promise<User | null> {
  const _id = oid(id);
  const d = _id && (await (await users()).findOne({ _id }));
  return d ? publicUser(d) : null;
}

const isDuplicate = (e: any) => e?.code === 11000;

export async function register(username: string, password: string): Promise<Result<User>> {
  username = (username ?? "").trim();
  if (!/^[\p{L}\p{N}_.-]{3,20}$/u.test(username)) return { ok: false, error: "Tên đăng nhập 3–20 ký tự (chữ, số, _ . -)" };
  if (typeof password !== "string" || password.length < 6 || password.length > 100) return { ok: false, error: "Mật khẩu tối thiểu 6 ký tự" };
  const salt = randomBytes(16).toString("hex");
  const doc: UserDoc = {
    username, uname: username.toLowerCase(), salt, passHash: hash(password, salt),
    elo: START_ELO, games: 0, wins: 0, createdAt: Date.now(),
  };
  try {
    const r = await (await users()).insertOne(doc);
    return { ok: true, value: publicUser({ ...doc, _id: r.insertedId }) };
  } catch (e) {
    if (isDuplicate(e)) return { ok: false, error: "Tên đăng nhập đã tồn tại" };
    throw e;
  }
}

export async function login(username: string, password: string): Promise<Result<User>> {
  const d = await (await users()).findOne({ uname: (username ?? "").trim().toLowerCase() });
  const bad: Result<User> = { ok: false, error: "Sai tên đăng nhập hoặc mật khẩu" };
  if (!d || typeof password !== "string" || !d.passHash) return bad; // Google-only accounts have no password
  const a = Buffer.from(hash(password, d.salt)), b = Buffer.from(d.passHash);
  return a.length === b.length && timingSafeEqual(a, b) ? { ok: true, value: publicUser(d) } : bad;
}

export function eloAfter(elo: number, oppElo: number, won: boolean): number {
  const expected = 1 / (1 + 10 ** ((oppElo - elo) / 400));
  return Math.max(100, Math.round(elo + K * ((won ? 1 : 0) - expected)));
}

/** Records one finished game for a user and updates their rating. Returns the new Elo. */
export async function recordGame(
  userId: string, opponent: string, opponentElo: number, mode: string, won: boolean,
  replay?: { frames: string; seat: number },
): Promise<{ before: number; after: number } | null> {
  const u = await getUser(userId);
  if (!u) return null;
  const after = eloAfter(u.elo, opponentElo, won);
  await (await users()).updateOne({ _id: new ObjectId(userId) }, { $set: { elo: after }, $inc: { games: 1, wins: won ? 1 : 0 } });
  await (await games()).insertOne({
    userId, opponent, opponentElo, mode, won, eloBefore: u.elo, eloAfter: after, playedAt: Date.now(),
    mySeat: replay?.seat ?? 0, hasReplay: !!replay, replay: replay?.frames,
  });
  return { before: u.elo, after };
}

// API-facing row shape (snake_case, same as before the move to MongoDB).
const gameRow = (g: any) => ({
  id: g._id.toHexString(), opponent: g.opponent, opponent_elo: g.opponentElo, mode: g.mode, won: g.won ? 1 : 0,
  elo_before: g.eloBefore, elo_after: g.eloAfter, played_at: g.playedAt, has_replay: g.hasReplay ? 1 : 0,
});

export async function statsFor(userId: string) {
  const g = await games();
  const user = (await getUser(userId))!;
  const [recent, byMode, best, ahead] = await Promise.all([
    g.find({ userId }, { projection: { replay: 0 } }).sort({ playedAt: -1 }).limit(50).toArray(),
    g.aggregate<{ _id: string; games: number; wins: number }>([
      { $match: { userId } },
      { $group: { _id: "$mode", games: { $sum: 1 }, wins: { $sum: { $cond: ["$won", 1, 0] } } } },
    ]).toArray(),
    g.find({ userId }).sort({ eloAfter: -1 }).limit(1).project({ eloAfter: 1 }).toArray(),
    (await users()).countDocuments({ elo: { $gt: user.elo } }),
  ]);
  return {
    user,
    recent: recent.map(gameRow),
    byMode: byMode.map((m) => ({ mode: m._id, games: m.games, wins: m.wins })),
    peak: Math.max(best[0]?.eloAfter ?? user.elo, user.elo),
    rank: ahead + 1,
  };
}

export async function leaderboard(limit = 20) {
  const rows = await (await users()).find({ games: { $gt: 0 } }).sort({ elo: -1 }).limit(limit).toArray();
  return rows.map((u) => ({ username: u.username, elo: u.elo, games: u.games, wins: u.wins }));
}

/** A finished game with its frames; only its owner may load it. */
export async function replayFor(userId: string, gameId: string) {
  const _id = oid(gameId);
  const d = _id && (await (await games()).findOne({ _id, userId }));
  if (!d || !d.replay) return null;
  return { game: { ...gameRow(d), my_seat: d.mySeat }, frames: JSON.parse(d.replay) };
}

interface GoogleClaims { sub: string; email?: string; name?: string; aud: string; iss?: string; exp: string; email_verified?: string }

/** Verifies a Google Identity Services ID token (needs GOOGLE_CLIENT_ID) via Google's tokeninfo endpoint. */
export async function verifyGoogleToken(idToken: string): Promise<Result<GoogleClaims>> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return { ok: false, error: "Server chưa cấu hình đăng nhập Google" };
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!res.ok) return { ok: false, error: "Token Google không hợp lệ" };
    const c = (await res.json()) as GoogleClaims;
    const issOk = c.iss === "accounts.google.com" || c.iss === "https://accounts.google.com";
    if (c.aud !== clientId || !issOk || !c.sub || Number(c.exp) * 1000 < Date.now()) {
      return { ok: false, error: "Token Google không hợp lệ" };
    }
    return { ok: true, value: c };
  } catch {
    return { ok: false, error: "Không xác thực được với Google" };
  }
}

/** Finds the account linked to this Google id, or creates one with a unique username. */
export async function loginWithGoogle(c: Pick<GoogleClaims, "sub" | "email" | "name">): Promise<User> {
  const col = await users();
  const existing = await col.findOne({ googleSub: c.sub });
  if (existing) return publicUser(existing);

  const base = ((c.name || c.email?.split("@")[0] || "player").replace(/[^\p{L}\p{N}_.-]+/gu, "") || "player").slice(0, 16);
  for (let i = 0; i < 20; i++) {
    const username = i === 0 ? base.padEnd(3, "_") : `${base}${Math.floor(Math.random() * 9000 + 1000)}`;
    const doc: UserDoc = {
      username, uname: username.toLowerCase(), salt: "", passHash: "", googleSub: c.sub,
      elo: START_ELO, games: 0, wins: 0, createdAt: Date.now(),
    };
    try {
      const r = await col.insertOne(doc);
      return publicUser({ ...doc, _id: r.insertedId });
    } catch (e) {
      if (!isDuplicate(e)) throw e;
      // username taken: retry with a numeric suffix (a concurrent sign-in with the same Google id also lands here)
      const again = await col.findOne({ googleSub: c.sub });
      if (again) return publicUser(again);
    }
  }
  throw new Error("could not allocate a username");
}
