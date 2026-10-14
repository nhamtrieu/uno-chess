import { Chess, type Move } from "chess.js";
import { sqName } from "./board";

export { Chess };
/** Time controls ("minutes+increment seconds") grouped like lichess / chess.com; each group has its own rating. */
export const TIME_CONTROLS_BY_CATEGORY = {
  bullet: ["1+0", "1+1", "2+1"],
  blitz: ["3+0", "3+2", "5+0"],
  rapid: ["10+0", "10+5", "15+10"],
} as const;
export type TimeCategory = keyof typeof TIME_CONTROLS_BY_CATEGORY;
export const TIME_CATEGORIES = Object.keys(TIME_CONTROLS_BY_CATEGORY) as TimeCategory[];
export const tcCategory = (tc: string): TimeCategory =>
  TIME_CATEGORIES.find((c) => (TIME_CONTROLS_BY_CATEGORY[c] as readonly string[]).includes(tc)) ?? "rapid";

export type ClassicColor = "w" | "b";
export type ClassicPromotion = "q" | "r" | "b" | "n";

/** Square index 0-63 with a1 = 0, h1 = 7, a8 = 56 (same layout as the Uno-Chess board; `sqName` is in board.ts). */
export const sqIndex = (name: string) => (name.charCodeAt(0) - 97) + (Number(name[1]) - 1) * 8;

export interface ClassicPiece { id: number; type: "K" | "Q" | "R" | "B" | "N" | "P"; color: ClassicColor; sq: number }

/** On-board pieces of a position, shaped like the pieces the Board component draws. */
export function fenToPieces(fen: string): ClassicPiece[] {
  const out: ClassicPiece[] = [];
  const rows = fen.split(" ")[0]!.split("/");
  rows.forEach((row, i) => {
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) file += Number(ch);
      else {
        const sq = file + (7 - i) * 8;
        out.push({ id: sq, type: ch.toUpperCase() as ClassicPiece["type"], color: ch === ch.toUpperCase() ? "w" : "b", sq });
        file++;
      }
    }
  });
  return out;
}

/** Legal destination squares for the piece on `from` (promotions collapse to one square). */
export function classicTargets(fen: string, from: number): number[] {
  try {
    const moves = new Chess(fen).moves({ square: sqName(from) as never, verbose: true }) as Move[];
    return [...new Set(moves.map((m) => sqIndex(m.to)))];
  } catch {
    return [];
  }
}

export function needsPromotion(fen: string, from: number, to: number): boolean {
  try {
    const moves = new Chess(fen).moves({ square: sqName(from) as never, verbose: true }) as Move[];
    return moves.some((m) => m.to === sqName(to) && m.promotion);
  } catch {
    return false;
  }
}

export type ClassicReason =
  | "checkmate" | "stalemate" | "insufficient" | "repetition" | "fifty" | "timeout" | "resignation" | "agreement";

/** `winner` is the colour that won, "draw", or null while the game is still going. */
export function classicResult(chess: Chess): { winner: ClassicColor | "draw" | null; reason?: ClassicReason } {
  if (chess.isCheckmate()) return { winner: chess.turn() === "w" ? "b" : "w", reason: "checkmate" };
  if (chess.isStalemate()) return { winner: "draw", reason: "stalemate" };
  if (chess.isInsufficientMaterial()) return { winner: "draw", reason: "insufficient" };
  if (chess.isThreefoldRepetition()) return { winner: "draw", reason: "repetition" };
  if (chess.isDrawByFiftyMoves()) return { winner: "draw", reason: "fifty" };
  return { winner: null };
}

// ---------- a small computer opponent ----------
const VALUE: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const MATE = 100_000;

/** Static evaluation from the side to move's point of view: material plus a little centre control. */
function evaluate(chess: Chess): number {
  let score = 0;
  for (const row of chess.board()) {
    for (const p of row) {
      if (!p) continue;
      const file = "abcdefgh".indexOf(p.square[0]!);
      const rank = Number(p.square[1]) - 1;
      const centre = 3.5 - Math.max(Math.abs(file - 3.5), Math.abs(rank - 3.5)); // 0..3
      let v = VALUE[p.type]! + (p.type === "p" || p.type === "k" ? 0 : centre * 6);
      if (p.type === "p") v += (p.color === "w" ? rank : 7 - rank) * 4; // pawns are worth more the further they advance
      score += p.color === "w" ? v : -v;
    }
  }
  return chess.turn() === "w" ? score : -score;
}

/** Most valuable victim first, cheapest attacker first; promotions get a bonus. */
const orderScore = (m: Move) =>
  (m.captured ? 10 * VALUE[m.captured]! - VALUE[m.piece]! / 10 : 0) + (m.promotion ? 800 : 0);

class OutOfTime extends Error {}

export interface BotOptions {
  /** Maximum search depth in plies (half-moves). */
  depth?: number;
  /** Wall-clock budget; the best move of the last fully searched depth is played when it runs out. */
  timeMs?: number;
  /** Called after each fully searched depth (handy for measuring how deep the search gets). */
  onDepth?: (depth: number, ms: number) => void;
}

/** Picks a move for the side to move: iterative-deepening alpha-beta (negamax) with a capture quiescence search. */
export function classicBotMove(
  fen: string,
  rng: () => number,
  { depth: maxDepth = 5, timeMs = 1500, onDepth }: BotOptions = {},
): { from: string; to: string; promotion?: string } | null {
  const chess = new Chess(fen);
  const root = chess.moves({ verbose: true }) as Move[];
  if (!root.length) return null;
  if (root.length === 1) return { from: root[0]!.from, to: root[0]!.to, promotion: root[0]!.promotion ?? undefined };

  const startedAt = Date.now();
  const deadline = startedAt + timeMs;
  let nodes = 0;
  const tick = () => {
    if ((++nodes & 255) === 0 && Date.now() > deadline) throw new OutOfTime();
  };

  function quiesce(alpha: number, beta: number, qd: number): number {
    tick();
    const stand = evaluate(chess);
    if (qd === 0 || stand >= beta) return stand;
    alpha = Math.max(alpha, stand);
    const caps = (chess.moves({ verbose: true }) as Move[]).filter((m) => m.captured).sort((a, b) => orderScore(b) - orderScore(a));
    for (const m of caps) {
      chess.move(m);
      const v = -quiesce(-beta, -alpha, qd - 1);
      chess.undo();
      if (v >= beta) return v;
      alpha = Math.max(alpha, v);
    }
    return alpha;
  }

  function search(depth: number, ply: number, alpha: number, beta: number): number {
    tick();
    if (depth === 0) return quiesce(alpha, beta, 2);
    const moves = (chess.moves({ verbose: true }) as Move[]).sort((a, b) => orderScore(b) - orderScore(a));
    if (!moves.length) return chess.inCheck() ? -MATE + ply : 0; // mated (sooner is worse) or stalemate
    let best = -Infinity;
    for (const m of moves) {
      chess.move(m);
      const v = -search(depth - 1, ply + 1, -beta, -alpha);
      chess.undo();
      if (v > best) best = v;
      alpha = Math.max(alpha, v);
      if (alpha >= beta) break;
    }
    return best;
  }

  let order = root.sort((a, b) => orderScore(b) - orderScore(a));
  let best: Move[] = [order[0]!];
  try {
    for (let depth = 1; depth <= maxDepth; depth++) {
      let bestScore = -Infinity;
      const scored: { m: Move; v: number }[] = [];
      for (const m of order) {
        chess.move(m);
        const v = -search(depth - 1, 1, -Infinity, Infinity) + (depth === maxDepth ? (rng() - 0.5) * 6 : 0); // a little noise so games vary
        chess.undo();
        scored.push({ m, v });
        if (v > bestScore) bestScore = v;
      }
      // an iteration only counts once every root move has been searched
      best = scored.filter((x) => x.v === bestScore).map((x) => x.m);
      order = scored.sort((a, b) => b.v - a.v).map((x) => x.m); // best first speeds up the next depth
      onDepth?.(depth, Date.now() - startedAt);
      if (bestScore > MATE / 2) break; // found a forced mate
    }
  } catch (e) {
    if (!(e instanceof OutOfTime)) throw e;
  }
  const m = best[Math.floor(rng() * best.length)]!;
  return { from: m.from, to: m.to, promotion: m.promotion ?? undefined };
}
