import { Board, PieceType } from "./board";
import { Rng } from "./deck";
import {
  GameState, Result, Seat, chooseWild, colorOfSeat, endTurnEarly, flip, move, revive,
} from "./game";
import { movesFrom } from "./moves";
import { reviveSquares } from "./board";

const VALUE: Record<PieceType, number> = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 1000 };
const pick = <T>(a: T[], rng: Rng) => a[Math.floor(rng() * a.length)]!;

/** Plays ONE action for whoever's turn it is. Greedy: takes the best capture, else random. */
export function botStep(g: GameState, rng: Rng): Result {
  const seat = g.turn as Seat;
  switch (g.phase) {
    case "flip":
      return flip(g, seat, rng);
    case "wild":
      return chooseWild(g, seat, 1 + Math.floor(rng() * 9));
    case "move": {
      const color = colorOfSeat(g, seat);
      const froms = g.board.flatMap((p, i) => (p?.color === color ? [i] : []));
      const options = froms.flatMap((from) => movesFrom(g.board, from).map((to) => ({ from, to })));
      if (options.length === 0) return endTurnEarly(g, seat);
      const gain = (o: { to: number }) => {
        const t = (g.board as Board)[o.to];
        return t ? VALUE[t.type] : 0;
      };
      const best = Math.max(...options.map(gain));
      const choices = best > 0 ? options.filter((o) => gain(o) === best) : options;
      const { from, to } = pick(choices, rng);
      return move(g, seat, from, to);
    }
    case "revive": {
      const color = colorOfSeat(g, seat);
      const opts = g.captured
        .filter((p) => p.color === color)
        .sort((a, b) => VALUE[b.type] - VALUE[a.type])
        .flatMap((p) => reviveSquares(g.board, p.color, p.type).map((sq) => ({ p, sq })));
      if (opts.length === 0) return endTurnEarly(g, seat);
      const top = opts.filter((o) => o.p.type === opts[0]!.p.type);
      const { p, sq } = pick(top, rng);
      return revive(g, seat, p.id, sq);
    }
    default:
      return { ok: false, error: "Game is over" };
  }
}
