import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { useTestDb } from "./testdb";

describe("accounts", () => {
  let a: typeof import("./accounts");
  let cleanup: () => Promise<void>;
  beforeAll(async () => {
    cleanup = useTestDb();
    a = await import("./accounts");
  });
  afterAll(async () => cleanup());

  it("registers, logs in, rejects bad credentials and duplicates", async () => {
    expect((await a.register("Alice", "secret1")).ok).toBe(true);
    expect((await a.register("alice", "secret1")).ok).toBe(false);
    expect((await a.register("x", "secret1")).ok).toBe(false);
    expect((await a.register("bob", "123")).ok).toBe(false);
    expect((await a.login("alice", "secret1")).ok).toBe(true);
    expect((await a.login("alice", "nope")).ok).toBe(false);
  });

  it("signs and verifies tokens", async () => {
    const u = ((await a.login("alice", "secret1")) as any).value;
    expect((await a.verifyToken(a.signToken(u.id)))?.username).toBe("Alice");
    expect(await a.verifyToken(a.signToken(u.id) + "x")).toBeNull();
    expect(await a.verifyToken(undefined)).toBeNull();
  });

  it("records games and updates Elo and stats", async () => {
    const u = ((await a.login("alice", "secret1")) as any).value;
    const r = (await a.recordGame(u.id, "Máy tính", 1500, "bot", true))!;
    expect(r.after).toBeGreaterThan(r.before);
    await a.recordGame(u.id, "Khách", 1200, "online", false);
    const s = await a.statsFor(u.id);
    expect(s.user.games).toBe(2);
    expect(s.user.wins).toBe(1);
    expect(s.recent).toHaveLength(2);
    expect(s.byMode.find((m) => m.mode === "bot")).toMatchObject({ games: 1, wins: 1 });
    expect((await a.leaderboard())[0]!.username).toBe("Alice");
  });

  it("creates a Google account once, with unique usernames and no password login", async () => {
    const g1 = await a.loginWithGoogle({ sub: "g-1", email: "carol@x.com", name: "Carol" });
    expect((await a.loginWithGoogle({ sub: "g-1", email: "carol@x.com", name: "Carol" })).id).toBe(g1.id);
    const g2 = await a.loginWithGoogle({ sub: "g-2", email: "carol@y.com", name: "Carol" });
    expect(g2.username).not.toBe(g1.username);
    expect((await a.login(g1.username, "")).ok).toBe(false);
  });

  it("stores a replay only for its owner", async () => {
    const u = (await a.register("dave", "secret1")) as any;
    const other = (await a.register("erin", "secret1")) as any;
    await a.recordGame(u.value.id, "Khách", 1200, "online", true, { frames: JSON.stringify([{ b: "." }]), seat: 1 });
    const row = (await a.statsFor(u.value.id)).recent[0]!;
    expect(row.has_replay).toBe(1);
    const r = (await a.replayFor(u.value.id, row.id))!;
    expect(r.frames).toEqual([{ b: "." }]);
    expect(r.game.my_seat).toBe(1);
    expect(await a.replayFor(other.value.id, row.id)).toBeNull();
    expect(await a.replayFor(u.value.id, "not-an-id")).toBeNull();
  });
});
