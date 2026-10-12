export type Color = "w" | "b";
export type PieceType = "P" | "N" | "B" | "R" | "Q" | "K";

export interface Piece {
  id: number;
  type: PieceType;
  color: Color;
}

/** 64 squares, index = rank * 8 + file. Rank 0 is White's back rank. */
export type Board = (Piece | null)[];

export const other = (c: Color): Color => (c === "w" ? "b" : "w");
export const rankOf = (sq: number) => sq >> 3;
export const fileOf = (sq: number) => sq & 7;
export const sqName = (sq: number) => "abcdefgh"[fileOf(sq)]! + (rankOf(sq) + 1);

const BACK_RANK: PieceType[] = ["R", "N", "B", "Q", "K", "B", "N", "R"];

export function initialBoard(): Board {
  const board: Board = Array(64).fill(null);
  let id = 0;
  for (let f = 0; f < 8; f++) {
    board[f] = { id: id++, type: BACK_RANK[f]!, color: "w" };
    board[8 + f] = { id: id++, type: "P", color: "w" };
    board[48 + f] = { id: id++, type: "P", color: "b" };
    board[56 + f] = { id: id++, type: BACK_RANK[f]!, color: "b" };
  }
  return board;
}

/** Ranks where a revived piece may be placed (own two home ranks). */
export function reviveSquares(board: Board, color: Color, type: PieceType): number[] {
  const ranks =
    type === "P" ? [color === "w" ? 1 : 6] : color === "w" ? [0, 1] : [7, 6];
  const out: number[] = [];
  for (const r of ranks) for (let f = 0; f < 8; f++) if (!board[r * 8 + f]) out.push(r * 8 + f);
  return out;
}
