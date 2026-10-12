import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { boot, ColyseusTestServer } from "@colyseus/testing";
import { UnoChessRoom } from "./rooms/UnoChessRoom";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("UnoChessRoom", () => {
  let colyseus: ColyseusTestServer;

  beforeAll(async () => {
    const server = new Server({ transport: new WebSocketTransport() });
    server.define("uno_chess", UnoChessRoom);
    colyseus = await boot(server);
  });
  afterAll(async () => colyseus.shutdown());

  it("starts when two players join and enforces turn order and rules", async () => {
    const room = await colyseus.createRoom<UnoChessRoom>("uno_chess");
    const a = await colyseus.connectTo(room);
    expect(room.state.status).toBe("waiting");
    const b = await colyseus.connectTo(room);
    await sleep(50);

    expect(room.state.status).toBe("playing");
    expect(room.state.pieces.length).toBe(32);
    expect(room.state.player0).toBe(a.sessionId);
    expect(room.state.player1).toBe(b.sessionId);

    const errors: string[] = [];
    a.onMessage("error", (m: string) => errors.push(`a:${m}`));
    b.onMessage("error", (m: string) => errors.push(`b:${m}`));

    b.send("flip"); // not b's turn
    a.send("move", { from: 12, to: 28 }); // must flip first
    await sleep(100);
    expect(errors).toEqual(["b:Not your turn", expect.stringMatching(/^a:Expected phase/)]);
    expect(room.state.flipCount).toBe(0);

    a.send("flip");
    await sleep(100);
    expect(room.state.flipCount).toBe(1);
    expect(room.state.lastCard).not.toBe("");
    expect(room.state.deckCount).toBe(107);
  });
});
