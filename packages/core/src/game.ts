import { Board, Color, Piece, initialBoard, other, rankOf, reviveSquares } from "./board";
import { Card, Rng, createDeck, shuffle } from "./deck";
import { movesFrom } from "./moves";

export type Seat = 0 | 1;
export type Phase = "flip" | "move" | "revive" | "wild" | "over";

export interface GameState {
  board: Board;
  /** Which colour each seat currently controls (swapped by Reverse). */
  colors: [Color, Color];
  turn: Seat;
  phase: Phase;
  deck: Card[];
  discard: Card[];
  lastCard: Card | null;
  /** Remaining moves of the current number card. */
  movesLeft: number;
  /** Square of the piece locked in for this turn (null until first move). */
  activeSq: number | null;
  /** Remaining revives of the current +2/+4 card. */
  reviveLeft: number;
  captured: Piece[];
  winner: Seat | null;
}

export type Result = { ok: true } | { ok: false; error: string };
const OK: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });

export function createGame(rng: Rng): GameState {
  return {
    board: initialBoard(),
    colors: ["w", "b"],
    turn: 0,
    phase: "flip",
    deck: shuffle(createDeck(), rng),
    discard: [],
    lastCard: null,
    movesLeft: 0,
    activeSq: null,
    reviveLeft: 0,
    captured: [],
    winner: null,
  };
}

export const colorOfSeat = (g: GameState, seat: Seat) => g.colors[seat];

function endTurn(g: GameState) {
  g.turn = g.turn === 0 ? 1 : 0;
  g.phase = "flip";
  g.movesLeft = 0;
  g.activeSq = null;
  g.reviveLeft = 0;
}

function checkTurn(g: GameState, seat: Seat, phase: Phase): Result {
  if (g.phase === "over") return fail("Game is over");
  if (g.turn !== seat) return fail("Not your turn");
  if (g.phase !== phase) return fail(`Expected phase ${phase}, got ${g.phase}`);
  return OK;
}

function draw(g: GameState, rng: Rng): Card {
  if (g.deck.length === 0) {
    g.deck = shuffle(g.discard, rng);
    g.discard = [];
  }
  const card = g.deck.pop()!;
  if (g.lastCard) g.discard.push(g.lastCard);
  g.lastCard = card;
  return card;
}

const myCaptured = (g: GameState, seat: Seat) =>
  g.captured.filter((p) => p.color === colorOfSeat(g, seat));

function startRevive(g: GameState, seat: Seat, count: number) {
  const mine = myCaptured(g, seat);
  const hasSlot = mine.some((p) => reviveSquares(g.board, p.color, p.type).length > 0);
  if (!hasSlot) return endTurn(g);
  g.phase = "revive";
  g.reviveLeft = Math.min(count, mine.length);
}

function startMove(g: GameState, n: number) {
  g.phase = "move";
  g.movesLeft = n;
  g.activeSq = null;
}

export function flip(g: GameState, seat: Seat, rng: Rng): Result {
  const chk = checkTurn(g, seat, "flip");
  if (!chk.ok) return chk;
  const card = draw(g, rng);
  switch (card.kind) {
    case "number":
      if (card.n === 0) endTurn(g);
      else startMove(g, card.n);
      break;
    case "skip":
      break; // opponent loses their turn: same seat flips again
    case "reverse":
      g.colors = [g.colors[1], g.colors[0]];
      endTurn(g);
      break;
    case "draw2":
      startRevive(g, seat, 2);
      break;
    case "wild4":
      startRevive(g, seat, 4);
      break;
    case "wild":
      g.phase = "wild";
      break;
  }
  return OK;
}

export function chooseWild(g: GameState, seat: Seat, n: number): Result {
  const chk = checkTurn(g, seat, "wild");
  if (!chk.ok) return chk;
  if (!Number.isInteger(n) || n < 1 || n > 9) return fail("Wild number must be 1-9");
  startMove(g, n);
  return OK;
}

function hasAnyMove(g: GameState, color: Color): boolean {
  return g.board.some((p, i) => p?.color === color && movesFrom(g.board, i).length > 0);
}

export function move(g: GameState, seat: Seat, from: number, to: number): Result {
  const chk = checkTurn(g, seat, "move");
  if (!chk.ok) return chk;
  const piece = g.board[from];
  if (!piece || piece.color !== colorOfSeat(g, seat)) return fail("Not your piece");
  if (!movesFrom(g.board, from).includes(to)) return fail("Illegal move");

  const target = g.board[to];
  g.board[from] = null;
  g.board[to] = piece;
  if (piece.type === "P" && (rankOf(to) === 7 || rankOf(to) === 0)) piece.type = "Q";
  g.movesLeft--;
  g.activeSq = to;

  if (target) {
    g.captured.push(target);
    if (target.type === "K") {
      g.winner = seat;
      g.phase = "over";
      return OK;
    }
  }
  if (g.movesLeft === 0 || !hasAnyMove(g, piece.color)) endTurn(g);
  return OK;
}

/** Finish early: stop moving (move phase) or stop reviving (revive phase). */
export function endTurnEarly(g: GameState, seat: Seat): Result {
  if (g.phase === "over") return fail("Game is over");
  if (g.turn !== seat) return fail("Not your turn");
  if (g.phase !== "move" && g.phase !== "revive") return fail("Cannot end turn now");
  endTurn(g);
  return OK;
}

export function revive(g: GameState, seat: Seat, pieceId: number, square: number): Result {
  const chk = checkTurn(g, seat, "revive");
  if (!chk.ok) return chk;
  const idx = g.captured.findIndex((p) => p.id === pieceId);
  const piece = g.captured[idx];
  if (!piece || piece.color !== colorOfSeat(g, seat)) return fail("Not a revivable piece");
  if (!reviveSquares(g.board, piece.color, piece.type).includes(square)) {
    return fail("Invalid revive square");
  }
  g.captured.splice(idx, 1);
  g.board[square] = piece;
  g.reviveLeft--;

  const stillHas = myCaptured(g, seat).some(
    (p) => reviveSquares(g.board, p.color, p.type).length > 0,
  );
  if (g.reviveLeft === 0 || !stillHas) endTurn(g);
  return OK;
}

/** Forced pass (e.g. turn timer ran out): hands the turn to the opponent. */
export function passTurn(g: GameState, seat: Seat): Result {
  if (g.phase === "over") return fail("Game is over");
  if (g.turn !== seat) return fail("Not your turn");
  endTurn(g);
  return OK;
}
