import { afterAll, beforeAll, expect, it } from "vitest";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { boot, ColyseusTestServer } from "@colyseus/testing";
import { useTestDb } from "./testdb";
import { Board, movesFrom, reviveSquares } from "@uno-chess/core";

let colyseus: ColyseusTestServer;
let acc: typeof import("./accounts");
let cleanup: () => Promise<void>;
beforeAll(async () => {
  cleanup = useTestDb();
  acc = await import("./accounts");
  const { UnoChessRoom } = await import("./rooms/UnoChessRoom");
  const server = new Server({ transport: new WebSocketTransport() });
  server.define("uno_chess", UnoChessRoom);
  colyseus = await boot(server);
});
afterAll(async () => {
  await colyseus.shutdown();
  await cleanup();
});

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)]!;

it("a finished game between two accounts is rated and stored as a replay for both", async () => {
  const users = await Promise.all(["rita", "sam"].map(async (n) => ((await acc.register(n, "secret1")) as any).value));
  const room = await colyseus.createRoom<any>("uno_chess");
  const clients = [
    await colyseus.connectTo(room, { token: acc.signToken(users[0].id) }),
    await colyseus.connectTo(room, { token: acc.signToken(users[1].id) }),
  ];
  await new Promise((r) => setTimeout(r, 50));
  const s = room.state;
  for (let step = 0; step < 4000 && s.phase !== "over"; step++) {
    const seat = s.turn;
    const c = clients[seat]!;
    const color = seat === 0 ? s.color0 : s.color1;
    const board: Board = Array(64).fill(null);
    s.pieces.forEach((p: any) => p.sq >= 0 && (board[p.sq] = { id: p.id, type: p.type, color: p.color }));
    if (s.phase === "flip") c.send("flip");
    else if (s.phase === "wild") c.send("chooseWild", { n: 1 + Math.floor(Math.random() * 9) });
    else if (s.phase === "move") {
      const opts = board.flatMap((p, i) => (p?.color === color ? movesFrom(board, i).map((t) => ({ from: i, to: t })) : []));
      if (opts.length === 0) c.send("endTurn");
      else c.send("move", pick(opts));
    } else if (s.phase === "revive") {
      const opts = s.pieces
        .filter((p: any) => p.sq < 0 && p.color === color)
        .flatMap((p: any) => reviveSquares(board, p.color, p.type).map((sq) => ({ pieceId: p.id, square: sq })));
      if (opts.length === 0) c.send("endTurn");
      else c.send("revive", pick(opts));
    }
    await new Promise((r) => setTimeout(r, 15));
  }
  expect(s.phase).toBe("over");
  await new Promise((r) => setTimeout(r, 300)); // rating is written asynchronously

  for (const u of users) {
    const row = (await acc.statsFor(u.id)).recent[0] as any;
    expect(row.has_replay).toBe(1);
    const { frames } = (await acc.replayFor(u.id, row.id))!;
    expect(frames.length).toBeGreaterThan(5);
    expect(frames[0].b).toHaveLength(64);
    expect(frames.at(-1).p).toBe("over");
  }
}, 120_000);
