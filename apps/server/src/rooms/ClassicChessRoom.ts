import { Client, Delayed, Room } from "@colyseus/core";
import { Chess, TIME_CONTROLS_BY_CATEGORY, classicResult, seededRng, sqIndex, type ClassicColor, type ClassicReason } from "@uno-chess/core";
import { GUEST_ELO, getUser, recordGame, variantForTc, verifyToken } from "../accounts";
import { ClassicSchema } from "../schema/ClassicSchema";
import { chooseBotMove } from "../classicBot";

/** Allowed time controls: "minutes+increment seconds" (same set as lichess / chess.com quick-pairing). */
export const TIME_CONTROLS: readonly string[] = Object.values(TIME_CONTROLS_BY_CATEGORY).flat();
export const DEFAULT_TC = "10+0";
const parseTc = (tc: unknown) => {
  const valid = TIME_CONTROLS.includes(String(tc)) ? String(tc) : DEFAULT_TC;
  const [min, inc] = valid.split("+").map(Number) as [number, number];
  return { tc: valid, baseMs: min * 60_000, incMs: inc * 1000 };
};
export const CLASSIC_BOT_ELO = 1000;
const RECONNECT_S = 60;
const BOT_DELAY_MS = 500;
/** The computer searches up to 5 plies, but never longer than this per move. */
const BOT_DEPTH = 5;
const BOT_TIME_MS = 1500;

/** One replay frame per position; `a`/`b` are the from/to squares of the move that led here (-1 for the start). */
export interface ClassicFrame { f: string; s: string; a: number; b: number }

const other = (c: ClassicColor): ClassicColor => (c === "w" ? "b" : "w");

export class ClassicChessRoom extends Room<{ state: ClassicSchema }> {
  maxClients = 2;
  private chess = new Chess();
  private colors = new Map<string, ClassicColor>(); // sessionId -> colour (the bot is "bot")
  private accountOf = new Map<string, string>(); // sessionId -> account id for logged-in players
  private frames: ClassicFrame[] = [];
  private timer?: Delayed;
  private vsBot = false;
  private mode = "online";
  private rated = false;
  private botPending = false;
  private rng = seededRng((Math.random() * 2 ** 32) >>> 0);
  private moveList: string[] = [];

  onCreate(options?: { bot?: boolean; private?: boolean; tc?: string; rated?: boolean }) {
    const control = parseTc(options?.tc);
    this.vsBot = !!options?.bot;
    this.mode = this.vsBot ? "bot" : options?.private ? "friend" : "online";
    if (this.vsBot) this.maxClients = 1;
    if (this.vsBot || options?.private) this.setPrivate(true);

    const s = (this.state = new ClassicSchema());
    s.fen = this.chess.fen();
    s.status = "waiting";
    s.turn = "w";
    s.lastFrom = s.lastTo = -1;
    s.winner = s.reason = s.drawOffer = s.whiteId = s.blackId = "";
    s.clockW = s.clockB = control.baseMs;
    s.tc = control.tc;
    s.incMs = control.incMs;
    s.rated = options?.rated !== false; // rated unless the creator turned it off
    s.moves = "[]";

    this.onMessage("move", (c, m: { from: string; to: string; promotion?: string }) => this.onMove(c, m));
    this.onMessage("resign", (c) => {
      const color = this.activeColor(c);
      if (color) this.finish(other(color), "resignation");
    });
    this.onMessage("offerDraw", (c) => {
      const color = this.activeColor(c);
      if (!color) return;
      if (this.vsBot) return c.send("error", "bot_declines_draw");
      this.state.drawOffer = this.state.drawOffer === other(color) ? "" : color;
      if (this.state.drawOffer === "") this.finish("draw", "agreement"); // both sides offered
    });
    this.onMessage("acceptDraw", (c) => {
      const color = this.activeColor(c);
      if (color && this.state.drawOffer === other(color)) this.finish("draw", "agreement");
    });
    this.onMessage("declineDraw", (c) => {
      const color = this.activeColor(c);
      if (color && this.state.drawOffer === other(color)) this.state.drawOffer = "";
    });
  }

  async onJoin(client: Client, options?: { token?: string }) {
    // claim a slot before awaiting so concurrent joins cannot take the same one
    this.colors.set(client.sessionId, "w"); // real colour is drawn once both players are here
    const user = options?.token ? await this.safeVerify(options.token) : null;
    if (user) this.accountOf.set(client.sessionId, user.id);
    const joined = [...this.colors.keys()];
    if (this.vsBot) this.start(joined[0]!, "bot");
    else if (joined.length === 2) this.start(joined[0]!, joined[1]!);
  }

  private async safeVerify(token: string) {
    try { return await verifyToken(token); } catch { return null; }
  }

  async onLeave(client: Client) {
    if (this.state.status === "playing") {
      try {
        await this.allowReconnection(client, RECONNECT_S);
        return;
      } catch {
        const color = this.colors.get(client.sessionId);
        if (color && this.state.status === "playing") this.finish(other(color), "resignation");
      }
    }
  }

  onDispose() {
    this.timer?.clear();
  }

  private activeColor(client: Client): ClassicColor | null {
    if (this.state.status !== "playing") return null;
    return this.colors.get(client.sessionId) ?? null;
  }

  private start(a: string, b: string) {
    if (this.state.status !== "waiting") return; // two concurrent joins can both reach this point
    const aWhite = this.rng() < 0.5;
    const white = aWhite ? a : b, black = aWhite ? b : a;
    this.colors.set(white, "w");
    this.colors.set(black, "b");
    this.state.whiteId = white;
    this.state.blackId = black;
    this.state.status = "playing";
    this.frames = [{ f: this.chess.fen(), s: "", a: -1, b: -1 }];
    this.rearm();
    this.scheduleBot();
  }

  private onMove(client: Client, m: { from: string; to: string; promotion?: string }) {
    const color = this.activeColor(client);
    if (!color) return client.send("error", "game_not_in_progress");
    if (this.state.turn !== color) return client.send("error", "not_your_turn");
    if (!this.play(m)) client.send("error", "illegal_move");
  }

  /** Applies a move for the side to move; returns false if it is illegal. */
  private play(m: { from: string; to: string; promotion?: string }): boolean {
    if (typeof m?.from !== "string" || typeof m?.to !== "string") return false;
    const mover = this.chess.turn();
    let mv;
    try {
      mv = this.chess.move({ from: m.from, to: m.to, promotion: m.promotion });
    } catch {
      return false;
    }
    this.charge(mover);
    const s = this.state;
    // increment goes to whoever just moved
    if (mover === "w") s.clockW += s.incMs; else s.clockB += s.incMs;
    s.fen = this.chess.fen();
    s.turn = this.chess.turn();
    s.lastFrom = sqIndex(mv.from);
    s.lastTo = sqIndex(mv.to);
    s.inCheck = this.chess.inCheck();
    s.drawOffer = "";
    this.moveList.push(mv.san);
    s.moves = JSON.stringify(this.moveList);
    this.frames.push({ f: s.fen, s: mv.san, a: s.lastFrom, b: s.lastTo });

    const r = classicResult(this.chess);
    if (r.winner) this.finish(r.winner, r.reason!);
    else {
      this.rearm();
      this.scheduleBot();
    }
    return true;
  }

  private scheduleBot() {
    if (!this.vsBot || this.botPending || this.state.status !== "playing") return;
    const botColor = this.colors.get("bot");
    if (this.state.turn !== botColor) return;
    this.botPending = true;
    this.clock.setTimeout(async () => {
      const fen = this.chess.fen();
      const m = await chooseBotMove(fen, { depth: BOT_DEPTH, timeMs: BOT_TIME_MS });
      this.botPending = false;
      // the game may have ended (resignation, flag) or moved on while the bot was thinking
      if (this.state.status !== "playing" || this.state.turn !== botColor || this.chess.fen() !== fen) return;
      if (m) this.play(m);
    }, BOT_DELAY_MS);
  }

  /** Bills the time since the last action to `color`. */
  private charge(color: ClassicColor) {
    const s = this.state;
    if (!s.clockStart) return;
    const now = Date.now();
    const key = color === "w" ? "clockW" : "clockB";
    s[key] = Math.max(0, s[key] - (now - s.clockStart));
    s.clockStart = now;
  }

  private rearm() {
    this.timer?.clear();
    const s = this.state;
    if (s.status !== "playing") {
      s.clockStart = 0;
      return;
    }
    const color = s.turn as ClassicColor;
    const left = color === "w" ? s.clockW : s.clockB;
    s.clockStart = Date.now();
    s.turnDeadline = s.clockStart + left;
    this.timer = this.clock.setTimeout(() => {
      if (s.status !== "playing") return;
      this.charge(color);
      this.finish(other(color), "timeout");
    }, left);
  }

  private finish(winner: ClassicColor | "draw", reason: ClassicReason) {
    const s = this.state;
    if (s.status === "over") return;
    this.charge(s.turn as ClassicColor);
    s.status = "over";
    s.winner = winner;
    s.reason = reason;
    s.drawOffer = "";
    s.turnDeadline = 0;
    s.clockStart = 0;
    this.timer?.clear();
    void this.rateGame(winner);
  }

  private async rateGame(winner: ClassicColor | "draw") {
    if (this.rated) return;
    this.rated = true;
    // Look up every rating first: recording one player's result must not change the other's opponent rating.
    const players = await Promise.all(
      [...this.colors]
        .filter(([sid]) => sid !== "bot" && this.accountOf.has(sid))
        .map(async ([sid, color]) => ({ sid, color, uid: this.accountOf.get(sid)!, user: await getUser(this.accountOf.get(sid)!) })),
    );
    const eloOf = new Map(players.map((p) => [p.color, p.user]));
    for (const p of players) {
      const opp = eloOf.get(other(p.color));
      const pool = variantForTc(this.state.tc);
      const [name, elo] = this.vsBot ? ["Máy tính", CLASSIC_BOT_ELO] : opp ? [opp.username, pool === "uno" ? opp.elo : opp.ratings[pool].elo] : ["Khách", GUEST_ELO];
      const score = winner === "draw" ? 0.5 : winner === p.color ? 1 : 0;
      try {
        const r = await recordGame(p.uid, name, elo, this.mode, score, { frames: JSON.stringify(this.frames), seat: p.color === "w" ? 0 : 1 }, pool, this.state.rated, this.state.tc);
        const client = this.clients.find((c) => c.sessionId === p.sid);
        if (r) client?.send("rated", { before: r.before, after: r.after });
      } catch (e) {
        console.error("recordGame failed", e);
      }
    }
  }
}
