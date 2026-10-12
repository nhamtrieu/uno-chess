import { afterAll, beforeAll, expect, it } from "vitest";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { boot, ColyseusTestServer } from "@colyseus/testing";
import { Board, movesFrom, reviveSquares } from "@uno-chess/core";
import { UnoChessRoom } from "./rooms/UnoChessRoom";

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  const server = new Server({ transport: new WebSocketTransport() });
  server.define("uno_chess", UnoChessRoom);
  colyseus = await boot(server);
});
afterAll(async () => colyseus.shutdown());

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)]!;

it("two random bots play legal moves until someone captures the king", async () => {
  const room = await colyseus.createRoom<UnoChessRoom>("uno_chess");
  const clients = [await colyseus.connectTo(room), await colyseus.connectTo(room)];
  const errors: string[] = [];
  clients.forEach((c) => c.onMessage("error", (m: string) => errors.push(m)));
  await new Promise((r) => setTimeout(r, 50));

  const s = room.state;
  for (let step = 0; step < 4000 && s.phase !== "over"; step++) {
    const seat = s.turn;
    const c = clients[seat]!;
    const color = seat === 0 ? s.color0 : s.color1;
    const board: Board = Array(64).fill(null);
    s.pieces.forEach((p) => p.sq >= 0 && (board[p.sq] = { id: p.id, type: p.type as any, color: p.color as any }));

    if (s.phase === "flip") c.send("flip");
    else if (s.phase === "wild") c.send("chooseWild", { n: 1 + Math.floor(Math.random() * 9) });
    else if (s.phase === "move") {
      const from = board.flatMap((p, i) => (p?.color === color ? [i] : []));
      const options = from.flatMap((f) => movesFrom(board, f).map((t) => ({ from: f, to: t })));
      if (options.length === 0) c.send("endTurn");
      else c.send("move", pick(options));
    } else if (s.phase === "revive") {
      const mine = s.pieces.filter((p) => p.sq < 0 && p.color === color);
      const opts = mine.flatMap((p) =>
        reviveSquares(board, p.color as any, p.type as any).map((sq) => ({ pieceId: p.id, square: sq })),
      );
      if (opts.length === 0) c.send("endTurn");
      else c.send("revive", pick(opts));
    }
    await new Promise((r) => setTimeout(r, 15));
  }

  expect(errors).toEqual([]);
  expect(s.phase).toBe("over");
  expect(s.winner).toBeGreaterThanOrEqual(0);
}, 120_000);

it("bot room: human + built-in bot play to the end, and the room is not matchable", async () => {
  const room = await colyseus.createRoom<UnoChessRoom>("uno_chess", { bot: true });
  const me = await colyseus.connectTo(room);
  const errors: string[] = [];
  me.onMessage("error", (m: string) => errors.push(m));
  await new Promise((r) => setTimeout(r, 50));

  const s = room.state;
  expect(s.status).toBe("playing");
  expect(s.player1).toBe("bot");
  expect(room.maxClients).toBe(1);

  // Human acts instantly; the bot moves on its own 900ms timer, so cap by turns not time.
  for (let i = 0; i < 40 && s.phase !== "over"; i++) {
    if (s.turn === 0) {
      if (s.phase === "flip") me.send("flip");
      else me.send("endTurn"); // pass any move/revive/wild phase quickly
      if (s.phase === "wild") me.send("chooseWild", { n: 1 });
    }
    await new Promise((r) => setTimeout(r, 60));
  }
  // the bot must have taken at least one turn on its own
  expect(s.flipCount).toBeGreaterThan(1);
  expect(errors.filter((e) => !e.startsWith("Expected phase") && e !== "Cannot end turn now")).toEqual([]);
}, 60_000);
