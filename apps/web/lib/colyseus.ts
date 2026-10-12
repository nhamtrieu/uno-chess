import { Client, Room } from "@colyseus/sdk";
import { getToken } from "./auth";

const ROOM_NAME = "uno_chess";

function serverUrl() {
  return (
    process.env.NEXT_PUBLIC_SERVER_URL ??
    `ws://${typeof window === "undefined" ? "localhost" : window.location.hostname}:2567`
  );
}

const client = () => new Client(serverUrl());

// One in-flight/open connection per room id: React strict mode runs effects twice in dev,
// and a second join would take the opponent's seat.
// Special ids are "<mode>-<random ticket>" ("new" friend room, "online" matchmaking, "bot");
// the ticket keeps each click on its own connection.
const connections = new Map<string, Promise<Room>>();
const tokenKey = (id: string) => `uno-chess:token:${id}`;

export function connect(id: string): Promise<Room> {
  const existing = connections.get(id);
  if (existing) return existing;

  const p = (async () => {
    let room: Room;
    const token0 = getToken(); // logged-in players get their games rated on the server
    const mode = id.split("-")[0];
    if (mode === "new") {
      room = await client().create(ROOM_NAME, { private: true, token: token0 });
    } else if (mode === "bot") {
      room = await client().create(ROOM_NAME, { bot: true, token: token0 });
    } else if (mode === "online") {
      room = await client().joinOrCreate(ROOM_NAME, { token: token0 });
    } else {
      const token = sessionStorage.getItem(tokenKey(id));
      try {
        if (!token) throw new Error("no token");
        room = await client().reconnect(token);
      } catch {
        room = await client().joinById(id, { token: token0 });
      }
    }
    sessionStorage.setItem(tokenKey(room.roomId), room.reconnectionToken);
    return room;
  })();
  connections.set(id, p);
  p.catch(() => connections.delete(id));
  return p;
}

export const newTicket = (mode: "new" | "online" | "bot") =>
  `${mode}-${Math.random().toString(36).slice(2, 10)}`;
