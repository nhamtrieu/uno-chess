import { Client, Delayed, Room } from "@colyseus/core";
import {
  Card, GameState, Rng, Seat, botStep, chooseWild, createGame, endTurnEarly, flip, move,
  revive, seededRng,
} from "@uno-chess/core";
import { BOT_ELO, GUEST_ELO, getUser, recordGame, verifyToken } from "../accounts";
import { GameSchema, PieceState } from "../schema/GameSchema";

/** Blitz 5:00 per player; the clock runs only on the side to move. */
export const CLOCK_MS = 300_000;
const RECONNECT_S = 60;

const cardLabel = (c: Card) =>
  c.kind === "number" ? `number:${c.color}:${c.n}` : "color" in c ? `${c.kind}:${c.color}` : c.kind;

/**
 * One replay frame per game state. `b`/`c`: board (64 chars, '.' empty) and captured pieces, upper case = white;
 * `k`: last card label; `t`: seat to move; `p`: phase; `w`: colour of seat 0 (flips on Reverse).
 */
export interface Frame { b: string; c: string; k: string; t: number; p: string; w: string; m: number }
const code = (p: { type: string; color: string }) => (p.color === "w" ? p.type : p.type.toLowerCase());

export class UnoChessRoom extends Room<{ state: GameSchema }> {
  maxClients = 2;
  private game!: GameState;
  private rng!: Rng;
  private seats = new Map<string, Seat>();
  private timer?: Delayed;
  private vsBot = false;
  private botPending = false;
  private mode = "online";
  private rated = false;
  private frames: Frame[] = [];
  /** seat -> account id for logged-in players. */
  private accounts = new Map<Seat, string>();

  onCreate(options?: { bot?: boolean; private?: boolean }) {
    this.vsBot = !!options?.bot;
    this.mode = this.vsBot ? "bot" : options?.private ? "friend" : "online";
    if (this.vsBot) this.maxClients = 1;
    if (this.vsBot || options?.private) this.setPrivate(true); // not matchable via "play online"
    this.state = new GameSchema();
    this.state.status = "waiting";
    this.state.winner = -1;
    this.state.activeSq = -1;
    this.state.flipCount = 0;
    this.state.clock0 = this.state.clock1 = CLOCK_MS;
    this.rng = seededRng((Math.random() * 2 ** 32) >>> 0);

    this.onMessage("flip", (c) =>
      this.act(c, (s) => flip(this.game, s, this.rng), () => this.state.flipCount++),
    );
    this.onMessage("move", (c, m: { from: number; to: number }) =>
      this.act(c, (s) => move(this.game, s, Number(m?.from), Number(m?.to))),
    );
    this.onMessage("endTurn", (c) => this.act(c, (s) => endTurnEarly(this.game, s)));
    this.onMessage("revive", (c, m: { pieceId: number; square: number }) =>
      this.act(c, (s) => revive(this.game, s, Number(m?.pieceId), Number(m?.square))),
    );
    this.onMessage("chooseWild", (c, m: { n: number }) =>
      this.act(c, (s) => chooseWild(this.game, s, Number(m?.n))),
    );
  }

  async onJoin(client: Client, options?: { token?: string }) {
    const seat = (this.seats.size === 0 ? 0 : 1) as Seat;
    this.seats.set(client.sessionId, seat); // claim the seat before awaiting, so concurrent joins get distinct seats
    if (seat === 0) this.state.player0 = client.sessionId;
    else this.state.player1 = client.sessionId;

    const user = options?.token ? await this.safeVerify(options.token) : null;
    if (user) this.accounts.set(seat, user.id);

    if (this.vsBot) {
      this.seats.set("bot", 1);
      this.state.player1 = "bot";
    }
    if (this.seats.size === 2) {
      this.game = createGame(this.rng);
      this.state.status = "playing";
      this.sync();
      this.state.clock0 = this.state.clock1 = CLOCK_MS;
      this.rearm();
      this.scheduleBot();
    }
  }

  async onLeave(client: Client, code?: number) {
    if (this.state.status === "playing") {
      try {
        await this.allowReconnection(client, RECONNECT_S);
        return;
      } catch {
        // did not come back: opponent wins by forfeit
        const seat = this.seats.get(client.sessionId)!;
        this.game.winner = seat === 0 ? 1 : 0;
        this.game.phase = "over";
        this.sync();
      }
    }
    this.seats.delete(client.sessionId);
  }

  private async safeVerify(token: string) {
    try { return await verifyToken(token); } catch { return null; }
  }

  /** Once per game: rate every logged-in player against their opponent and tell them the result. */
  private async rateGame() {
    if (this.rated || this.game.winner === null) return;
    this.rated = true;
    const seats: Seat[] = [0, 1];
    for (const seat of seats) {
      const uid = this.accounts.get(seat);
      if (uid === undefined) continue;
      const oppSeat = (seat === 0 ? 1 : 0) as Seat;
      const oppUid = this.accounts.get(oppSeat);
      const opp = oppUid !== undefined ? await getUser(oppUid) : null;
      const [name, elo] = this.vsBot ? ["Máy tính", BOT_ELO] : opp ? [opp.username, opp.elo] : ["Khách", GUEST_ELO];
      try {
        const r = await recordGame(uid, name, elo, this.mode, this.game.winner === seat, {
          frames: JSON.stringify(this.frames),
          seat,
        });
        const sid = [...this.seats].find(([, st]) => st === seat)?.[0];
        const client = this.clients.find((c) => c.sessionId === sid);
        if (r) client?.send("rated", { before: r.before, after: r.after });
      } catch (e) {
        console.error("recordGame failed", e);
      }
    }
  }

  onDispose() {
    this.timer?.clear();
  }

  /** Runs a core action for the sender; reports rule violations back to them only. */
  private act(
    client: Client,
    fn: (seat: Seat) => { ok: boolean; error?: string },
    onOk?: () => void,
  ) {
    const seat = this.seats.get(client.sessionId);
    if (seat === undefined || this.state.status !== "playing") {
      return client.send("error", "Game not in progress");
    }
    this.charge();
    const res = fn(seat);
    if (!res.ok) return client.send("error", (res as { error: string }).error);
    onOk?.();
    this.sync();
    this.rearm();
    this.scheduleBot();
  }

  private isOver() {
    return this.game.phase === "over"; // separate method: botStep mutates phase behind TS's back
  }

  /** In a bot room, plays the bot's actions one by one with a short pause for readability. */
  private scheduleBot() {
    if (!this.vsBot || this.botPending || this.game.phase === "over" || this.game.turn !== 1) return;
    this.botPending = true;
    this.clock.setTimeout(() => {
      this.botPending = false;
      if (this.game.phase === "over" || this.game.turn !== 1) return;
      this.charge();
      const wasFlip = this.game.phase === "flip";
      botStep(this.game, this.rng);
      if (wasFlip) this.state.flipCount++;
      this.sync();
      this.rearm();
      this.scheduleBot();
    }, 900);
  }

  /** Bills the time since the last action to the side that was on move. */
  private charge() {
    const s = this.state;
    if (!s.clockStart) return;
    const now = Date.now();
    const key = this.game.turn === 0 ? "clock0" : "clock1";
    s[key] = Math.max(0, s[key] - (now - s.clockStart));
    s.clockStart = now;
  }

  /** (Re)starts the flag timer for whoever is on move; stops it once the game is over. */
  private rearm() {
    this.timer?.clear();
    if (this.isOver()) {
      this.state.clockStart = 0;
      return;
    }
    const s = this.state;
    const left = this.game.turn === 0 ? s.clock0 : s.clock1;
    s.clockStart = Date.now();
    s.turnDeadline = s.clockStart + left;
    this.timer = this.clock.setTimeout(() => {
      if (this.isOver()) return;
      this.charge();
      this.game.winner = this.game.turn === 0 ? 1 : 0; // flag fell
      this.game.phase = "over";
      this.sync();
      this.rearm();
    }, left);
  }

  /** Mirror the pure core state into the synced schema. */
  private sync() {
    const g = this.game;
    const s = this.state;
    s.pieces.clear();
    const push = (p: { id: number; type: string; color: string }, sq: number) => {
      const ps = new PieceState();
      ps.id = p.id; ps.type = p.type; ps.color = p.color; ps.sq = sq;
      s.pieces.push(ps);
    };
    g.board.forEach((p, sq) => p && push(p, sq));
    g.captured.forEach((p) => push(p, -1));

    s.color0 = g.colors[0];
    s.color1 = g.colors[1];
    s.turn = g.turn;
    s.phase = g.phase;
    s.movesLeft = g.movesLeft;
    s.reviveLeft = g.reviveLeft;
    s.activeSq = g.activeSq ?? -1;
    s.lastCard = g.lastCard ? cardLabel(g.lastCard) : "";
    s.deckCount = g.deck.length;
    s.winner = g.winner ?? -1;
    const frame: Frame = {
      b: g.board.map((p) => (p ? code(p) : ".")).join(""),
      c: g.captured.map(code).join(""),
      k: s.lastCard, t: g.turn, p: g.phase, w: g.colors[0], m: g.movesLeft,
    };
    if (JSON.stringify(frame) !== JSON.stringify(this.frames[this.frames.length - 1])) this.frames.push(frame);
    if (g.phase === "over") {
      void this.rateGame();
      s.status = "over";
      s.turnDeadline = 0;
    }
  }
}
