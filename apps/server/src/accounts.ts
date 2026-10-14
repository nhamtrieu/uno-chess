import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { ObjectId, type WithId } from "mongodb";
import { TIME_CATEGORIES, tcCategory, type TimeCategory } from "@uno-chess/core";
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
  /** Classic-chess rating per time-control category. */
  ratings: Record<TimeCategory, Rating>;
  created_at: number;
}
export interface Rating { elo: number; games: number; wins: number }
/** Each rating pool: Uno-Chess, or one of the classic-chess time-control categories. */
export type Variant = "uno" | TimeCategory;
export const isVariant = (v: unknown): v is Variant => v === "uno" || (TIME_CATEGORIES as string[]).includes(v as string);
/** `code` is stable and translated by the client; `error` is a Vietnamese fallback message. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string; code: string };

const publicUser = (d: WithId<UserDoc>): User => ({
  id: d._id.toHexString(), username: d.username, elo: d.elo, games: d.games, wins: d.wins,
  ratings: Object.fromEntries(
    TIME_CATEGORIES.map((c) => [c, d.ratings?.[c] ?? { elo: START_ELO, games: 0, wins: 0 }]),
  ) as Record<TimeCategory, Rating>,
  created_at: d.createdAt,
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
  if (!/^[\p{L}\p{N}_.-]{3,20}$/u.test(username)) return { ok: false, code: "bad_username", error: "Tên đăng nhập 3–20 ký tự (chữ, số, _ . -)" };
  if (typeof password !== "string" || password.length < 6 || password.length > 100) return { ok: false, code: "bad_password", error: "Mật khẩu tối thiểu 6 ký tự" };
  const salt = randomBytes(16).toString("hex");
  const doc: UserDoc = {
    username, uname: username.toLowerCase(), salt, passHash: hash(password, salt),
    elo: START_ELO, games: 0, wins: 0, createdAt: Date.now(),
  };
  try {
    const r = await (await users()).insertOne(doc);
    return { ok: true, value: publicUser({ ...doc, _id: r.insertedId }) };
  } catch (e) {
    if (isDuplicate(e)) return { ok: false, code: "username_taken", error: "Tên đăng nhập đã tồn tại" };
    throw e;
  }
}

export async function login(username: string, password: string): Promise<Result<User>> {
  const d = await (await users()).findOne({ uname: (username ?? "").trim().toLowerCase() });
  const bad: Result<User> = { ok: false, code: "bad_credentials", error: "Sai tên đăng nhập hoặc mật khẩu" };
  if (!d || typeof password !== "string" || !d.passHash) return bad; // Google-only accounts have no password
  const a = Buffer.from(hash(password, d.salt)), b = Buffer.from(d.passHash);
  return a.length === b.length && timingSafeEqual(a, b) ? { ok: true, value: publicUser(d) } : bad;
}

/** `score` is 1 for a win, 0.5 for a draw, 0 for a loss. */
export function eloAfter(elo: number, oppElo: number, score: number): number {
  const expected = 1 / (1 + 10 ** ((oppElo - elo) / 400));
  return Math.max(100, Math.round(elo + K * (score - expected)));
}

/** Rating of one pool for a user. */
const ratingOf = (u: User, variant: Variant): Rating =>
  variant === "uno" ? { elo: u.elo, games: u.games, wins: u.wins } : u.ratings[variant];

/** Records one finished game for a user and updates their rating in that pool. Returns the new Elo. */
export async function recordGame(
  userId: string, opponent: string, opponentElo: number, mode: string, score: number,
  replay?: { frames: string; seat: number }, variant: Variant = "uno", rated = true, tc?: string,
): Promise<{ before: number; after: number } | null> {
  const u = await getUser(userId);
  if (!u) return null;
  const before = ratingOf(u, variant).elo;
  const after = rated ? eloAfter(before, opponentElo, score) : before; // casual games leave ratings alone
  const won = score === 1;
  if (rated) {
    const update =
      variant === "uno"
        ? { $set: { elo: after }, $inc: { games: 1, wins: won ? 1 : 0 } }
        : { $set: { [`ratings.${variant}.elo`]: after }, $inc: { [`ratings.${variant}.games`]: 1, [`ratings.${variant}.wins`]: won ? 1 : 0 } };
    await (await users()).updateOne({ _id: new ObjectId(userId) }, update);
  }
  await (await games()).insertOne({
    userId, opponent, opponentElo, mode, won, draw: score === 0.5, rated, tc, eloBefore: before, eloAfter: after,
    variant: variant === "uno" ? "uno" : "classic", category: variant === "uno" ? undefined : variant,
    playedAt: Date.now(), mySeat: replay?.seat ?? 0, hasReplay: !!replay, replay: replay?.frames,
  });
  return { before, after };
}

/** The pool a classic game with this time control is rated in. */
export const variantForTc = (tc: string): Variant => tcCategory(tc);

// API-facing row shape (snake_case, same as before the move to MongoDB).
const gameRow = (g: any) => ({
  id: g._id.toHexString(), opponent: g.opponent, opponent_elo: g.opponentElo, mode: g.mode, won: g.won ? 1 : 0,
  draw: g.draw ? 1 : 0, variant: g.variant ?? "uno", category: g.category ?? null, rated: g.rated === false ? 0 : 1, tc: g.tc ?? null,
  elo_before: g.eloBefore, elo_after: g.eloAfter, played_at: g.playedAt, has_replay: g.hasReplay ? 1 : 0,
});

const variantFilter = (variant: Variant) =>
  variant === "uno" ? { variant: { $ne: "classic" as const } } : { variant: "classic" as const, category: variant };

export async function statsFor(userId: string, variant: Variant = "uno") {
  const g = await games();
  const full = (await getUser(userId))!;
  const r = ratingOf(full, variant);
  // `user` carries the rating of the requested pool in its elo/games/wins fields.
  const user = variant === "uno" ? full : { ...full, elo: r.elo, games: r.games, wins: r.wins };
  const match = { userId, rated: { $ne: false }, ...variantFilter(variant) }; // stats ignore casual games
  const listMatch = { userId, ...variantFilter(variant) };
  const eloPath = variant === "uno" ? "elo" : `ratings.${variant}.elo`;
  // players with no games in a pool count as 1200, so they rank ahead of anyone below that
  const ahead = { $or: [{ [eloPath]: { $gt: user.elo } }, ...(variant !== "uno" && user.elo < START_ELO ? [{ [eloPath]: { $exists: false } }] : [])] };
  const [recent, byMode, best, rank] = await Promise.all([
    g.find(listMatch, { projection: { replay: 0 } }).sort({ playedAt: -1 }).limit(50).toArray(),
    g.aggregate<{ _id: string; games: number; wins: number; draws: number }>([
      { $match: match },
      { $group: { _id: "$mode", games: { $sum: 1 }, wins: { $sum: { $cond: ["$won", 1, 0] } }, draws: { $sum: { $cond: ["$draw", 1, 0] } } } },
    ]).toArray(),
    g.find(match).sort({ eloAfter: -1 }).limit(1).project({ eloAfter: 1 }).toArray(),
    (await users()).countDocuments(ahead as never),
  ]);
  return {
    user,
    variant,
    recent: recent.map(gameRow),
    byMode: byMode.map((m) => ({ mode: m._id, games: m.games, wins: m.wins })),
    draws: byMode.reduce((n, m) => n + m.draws, 0),
    peak: Math.max(best[0]?.eloAfter ?? user.elo, user.elo),
    rank: rank + 1,
  };
}

export async function leaderboard(limit = 20, variant: Variant = "uno") {
  const gamesPath = variant === "uno" ? "games" : `ratings.${variant}.games`;
  const eloPath = variant === "uno" ? "elo" : `ratings.${variant}.elo`;
  const rows = await (await users()).find({ [gamesPath]: { $gt: 0 } } as never).sort({ [eloPath]: -1 }).limit(limit).toArray();
  return rows.map((d) => {
    const r = ratingOf(publicUser(d), variant);
    return { username: d.username, elo: r.elo, games: r.games, wins: r.wins };
  });
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
  if (!clientId) return { ok: false, code: "google_not_configured", error: "Server chưa cấu hình đăng nhập Google" };
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!res.ok) return { ok: false, code: "google_invalid", error: "Token Google không hợp lệ" };
    const c = (await res.json()) as GoogleClaims;
    const issOk = c.iss === "accounts.google.com" || c.iss === "https://accounts.google.com";
    if (c.aud !== clientId || !issOk || !c.sub || Number(c.exp) * 1000 < Date.now()) {
      return { ok: false, code: "google_invalid", error: "Token Google không hợp lệ" };
    }
    return { ok: true, value: c };
  } catch {
    return { ok: false, code: "google_unreachable", error: "Không xác thực được với Google" };
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
