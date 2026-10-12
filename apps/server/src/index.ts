import { defineRoom, defineServer } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { UnoChessRoom } from "./rooms/UnoChessRoom";
import { apiRoutes } from "./http";

const port = Number(process.env.PORT ?? 2567);
const server = defineServer({
  transport: new WebSocketTransport(),
  rooms: { uno_chess: defineRoom(UnoChessRoom) },
  routes: apiRoutes,
});
await server.listen(port);
console.log(`Uno-Chess server listening on ws://localhost:${port} (API: http://localhost:${port}/api)`);
