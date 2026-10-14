import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { boot, ColyseusTestServer } from "@colyseus/testing";
import { useTestDb } from "./testdb";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("ClassicChessRoom", () => {
  let colyseus: ColyseusTestServer;
  let acc: typeof import("./accounts");
  let cleanup: () => Promise<void>;
  beforeAll(async () => {
    cleanup = useTestDb();
    acc = await import("./accounts");
    const { ClassicChessRoom } = await import("./rooms/ClassicChessRoom");
    const server = new Server({ transport: new WebSocketTransport() });
    server.define("classic_chess", ClassicChessRoom).filterBy(["tc", "rated"]); // same as index.ts
    colyseus = await boot(server);
  });
  afterAll(async () => {
    await colyseus.shutdown();
    await cleanup();
  });

  /** Joins two players (optionally logged in) and returns them keyed by the colour they were dealt. */
  async function twoPlayers(tokens: (string | undefined)[] = []) {
    const room = await colyseus.createRoom<any>("classic_chess");
    const p1 = await colyseus.connectTo(room, { token: tokens[0] });
    const p2 = await colyseus.connectTo(room, { token: tokens[1] });
    await sleep(100);
    return room.state.whiteId === p1.sessionId ? { room, w: p1, b: p2 } : { room, w: p2, b: p1 };
  }

  it("deals colours and enforces turn order and legality", async () => {
    const { room, w, b } = await twoPlayers();
    expect(room.state.status).toBe("playing");
    expect(room.state.whiteId).not.toBe(room.state.blackId);
    const errors: string[] = [];
    w.onMessage("error", (m: string) => errors.push(`w:${m}`));
    b.onMessage("error", (m: string) => errors.push(`b:${m}`));

    b.send("move", { from: "e7", to: "e5" }); // not black's turn
    w.send("move", { from: "e2", to: "e5" }); // illegal for a pawn
    w.send("move", { from: "e2", to: "e4" });
    await sleep(100);
    expect(errors).toEqual(["b:not_your_turn", "w:illegal_move"]);
    expect(room.state.turn).toBe("b");
    expect(JSON.parse(room.state.moves)).toEqual(["e4"]);
  });

  it("ends on checkmate (fool's mate) and rates both accounts, with a replay", async () => {
    const users = await Promise.all(["wanda", "boris"].map(async (n) => ((await acc.register(n, "secret1")) as any).value));
    const { room, w, b } = await twoPlayers(users.map((u: any) => acc.signToken(u.id)));
    const send = async (c: any, from: string, to: string) => { c.send("move", { from, to }); await sleep(60); };
    const wc = w, bc = b;
    await send(wc, "f2", "f3"); await send(bc, "e7", "e5"); await send(wc, "g2", "g4"); await send(bc, "d8", "h4");
    await sleep(300);
    expect(room.state.status).toBe("over");
    expect(room.state.winner).toBe("b");
    expect(room.state.reason).toBe("checkmate");
    for (const u of users) {
      const stats = await acc.statsFor(u.id, "rapid");
      expect(stats.recent).toHaveLength(1);
      expect(stats.recent[0]!.variant).toBe("classic");
      const { frames } = (await acc.replayFor(u.id, stats.recent[0]!.id))!;
      expect(frames).toHaveLength(5);
      expect(frames[4].s).toBe("Qh4#");
    }
    const ratings = await Promise.all(users.map((u: any) => acc.getUser(u.id)));
    expect(ratings.map((r) => r!.ratings.rapid.elo).sort()).toEqual([1184, 1216]);
    expect(ratings.every((r) => r!.elo === 1200)).toBe(true); // Uno rating untouched
    expect(ratings.every((r) => r!.ratings.blitz.elo === 1200 && r!.ratings.bullet.elo === 1200)).toBe(true); // other time controls too
  });

  it("supports resignation and draw by agreement; declines are cleared", async () => {
    const r1 = await twoPlayers();
    r1.w.send("resign");
    await sleep(80);
    expect([r1.room.state.status, r1.room.state.winner, r1.room.state.reason]).toEqual(["over", "b", "resignation"]);

    const r2 = await twoPlayers();
    r2.w.send("offerDraw");
    await sleep(60);
    expect(r2.room.state.drawOffer).toBe("w");
    r2.b.send("declineDraw");
    await sleep(60);
    expect(r2.room.state.drawOffer).toBe("");
    r2.w.send("offerDraw");
    await sleep(60);
    r2.b.send("acceptDraw");
    await sleep(80);
    expect([r2.room.state.winner, r2.room.state.reason]).toEqual(["draw", "agreement"]);
  });

  it("records a drawn game with half a point", async () => {
    const users = await Promise.all(["dora", "eli"].map(async (n) => ((await acc.register(n, "secret1")) as any).value));
    const { room, w, b } = await twoPlayers(users.map((u: any) => acc.signToken(u.id)));
    w.send("offerDraw"); await sleep(60);
    b.send("acceptDraw"); await sleep(300);
    expect(room.state.winner).toBe("draw");
    for (const u of users) {
      const s = await acc.statsFor(u.id, "rapid");
      expect(s.draws).toBe(1);
      expect(s.recent[0]).toMatchObject({ draw: 1, won: 0 });
      expect(s.user.elo).toBe(1200); // equal ratings: a draw changes nothing
    }
  });

  it("applies the chosen time control with increment, and falls back to 10+0 for junk", async () => {
    const room = await colyseus.createRoom<any>("classic_chess", { tc: "3+2" });
    expect([room.state.tc, room.state.clockW, room.state.incMs]).toEqual(["3+2", 180_000, 2000]);
    const junk = await colyseus.createRoom<any>("classic_chess", { tc: "99+99" });
    expect([junk.state.tc, junk.state.clockW, junk.state.incMs]).toEqual(["10+0", 600_000, 0]);

    const p1 = await colyseus.connectTo(room);
    const p2 = await colyseus.connectTo(room);
    await sleep(100);
    const [w] = room.state.whiteId === p1.sessionId ? [p1, p2] : [p2, p1];
    w.send("move", { from: "e2", to: "e4" });
    await sleep(100);
    expect(room.state.clockW).toBeGreaterThan(180_000); // 2s increment minus a few ms of thinking
    expect(room.state.clockW).toBeLessThanOrEqual(182_000);
    expect(room.state.clockB).toBe(180_000);
  });

  it("casual games are saved but change no rating and are left out of the stats", async () => {
    const users = await Promise.all(["casy", "moe"].map(async (n) => ((await acc.register(n, "secret1")) as any).value));
    const room = await colyseus.createRoom<any>("classic_chess", { rated: false });
    const a = await colyseus.connectTo(room, { token: acc.signToken(users[0].id) });
    const b = await colyseus.connectTo(room, { token: acc.signToken(users[1].id) });
    await sleep(100);
    expect(room.state.rated).toBe(false);
    (room.state.whiteId === a.sessionId ? a : b).send("resign");
    await sleep(300);
    for (const u of users) {
      const st = await acc.statsFor(u.id, "rapid");
      expect(st.recent).toHaveLength(1);
      expect(st.recent[0]).toMatchObject({ rated: 0, elo_before: 1200, elo_after: 1200 });
      expect(st.user.games).toBe(0);
      expect(st.byMode).toEqual([]);
    }
  });

  it("rates each time-control category separately", async () => {
    const users = await Promise.all(["blix", "zara"].map(async (n) => ((await acc.register(n, "secret1")) as any).value));
    const room = await colyseus.createRoom<any>("classic_chess", { tc: "3+2" }); // blitz
    const a = await colyseus.connectTo(room, { token: acc.signToken(users[0].id) });
    const b = await colyseus.connectTo(room, { token: acc.signToken(users[1].id) });
    await sleep(100);
    (room.state.whiteId === a.sessionId ? a : b).send("resign");
    await sleep(300);
    for (const u of users) {
      const got = (await acc.getUser(u.id))!;
      expect(got.ratings.rapid.elo).toBe(1200);
      expect(got.ratings.bullet.elo).toBe(1200);
      expect(got.ratings.blitz.games).toBe(1);
      expect([1184, 1216]).toContain(got.ratings.blitz.elo);
      expect((await acc.statsFor(u.id, "blitz")).recent).toHaveLength(1);
      expect((await acc.statsFor(u.id, "rapid")).recent).toHaveLength(0);
      expect((await acc.statsFor(u.id, "uno")).recent).toHaveLength(0);
    }
    expect((await acc.leaderboard(20, "blitz")).map((p) => p.username).sort()).toEqual(["blix", "zara"]);
    expect(await acc.leaderboard(20, "bullet")).toEqual([]);
  });

  it("matchmaking only pairs players who asked for the same time control and rating", async () => {
    const sdk = (colyseus as any).sdk;
    const a = await sdk.joinOrCreate("classic_chess", { tc: "5+0", rated: true });
    const b = await sdk.joinOrCreate("classic_chess", { tc: "3+2", rated: true });
    const c = await sdk.joinOrCreate("classic_chess", { tc: "5+0", rated: true });
    const d = await sdk.joinOrCreate("classic_chess", { tc: "5+0", rated: false });
    expect(c.roomId).toBe(a.roomId);
    expect(new Set([a.roomId, b.roomId, d.roomId]).size).toBe(3);
  });

  it("bot room: the computer answers a move", async () => {
    const room = await colyseus.createRoom<any>("classic_chess", { bot: true });
    const me = await colyseus.connectTo(room);
    await sleep(100);
    expect(room.state.status).toBe("playing");
    const iAmWhite = room.state.whiteId === me.sessionId;
    if (iAmWhite) me.send("move", { from: "e2", to: "e4" });
    // the bot thinks in a worker thread (cold start + up to 1.5s of search), so poll instead of a fixed sleep
    const want = iAmWhite ? 2 : 1;
    for (let i = 0; i < 100 && JSON.parse(room.state.moves).length < want; i++) await sleep(100);
    expect(JSON.parse(room.state.moves).length).toBeGreaterThanOrEqual(want);
  }, 30_000);
});
