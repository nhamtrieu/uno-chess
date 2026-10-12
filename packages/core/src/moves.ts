import { Board, Piece, fileOf, rankOf } from "./board";

const KNIGHT: [number, number][] = [
  [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];
const DIAG: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ORTHO: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Pseudo-legal destinations for the piece on `from`.
 * Check rules are intentionally ignored (the game is won by capturing the King).
 * No castling or en passant in v1.
 */
export function movesFrom(board: Board, from: number): number[] {
  const p = board[from];
  if (!p) return [];
  const r = rankOf(from);
  const f = fileOf(from);
  const out: number[] = [];

  const at = (dr: number, df: number): Piece | null | undefined => {
    const nr = r + dr, nf = f + df;
    if (nr < 0 || nr > 7 || nf < 0 || nf > 7) return undefined; // off board
    return board[nr * 8 + nf];
  };
  const sq = (dr: number, df: number) => (r + dr) * 8 + (f + df);

  const step = (dirs: [number, number][]) => {
    for (const [dr, df] of dirs) {
      const t = at(dr, df);
      if (t !== undefined && (!t || t.color !== p.color)) out.push(sq(dr, df));
    }
  };
  const slide = (dirs: [number, number][]) => {
    for (const [dr, df] of dirs) {
      for (let k = 1; k < 8; k++) {
        const t = at(dr * k, df * k);
        if (t === undefined) break;
        if (!t) { out.push(sq(dr * k, df * k)); continue; }
        if (t.color !== p.color) out.push(sq(dr * k, df * k));
        break;
      }
    }
  };

  switch (p.type) {
    case "N": step(KNIGHT); break;
    case "K": step([...DIAG, ...ORTHO]); break;
    case "B": slide(DIAG); break;
    case "R": slide(ORTHO); break;
    case "Q": slide([...DIAG, ...ORTHO]); break;
    case "P": {
      const dir = p.color === "w" ? 1 : -1;
      const startRank = p.color === "w" ? 1 : 6;
      if (at(dir, 0) === null) {
        out.push(sq(dir, 0));
        if (r === startRank && at(2 * dir, 0) === null) out.push(sq(2 * dir, 0));
      }
      for (const df of [-1, 1]) {
        const t = at(dir, df);
        if (t && t.color !== p.color) out.push(sq(dir, df));
      }
      break;
    }
  }
  return out;
}
