import { describe, expect, it } from "vitest";
import {
  Card, GameState, chooseWild, createDeck, createGame, endTurnEarly, flip, initialBoard,
  move, movesFrom, revive, seededRng,
} from "./index";

const rng = seededRng(1);
const sq = (name: string) => "abcdefgh".indexOf(name[0]!) + (Number(name[1]) - 1) * 8;
const num = (n: number): Card => ({ kind: "number", n, color: "red" });

/** Fresh game whose next flip yields `card`. */
function gameWith(card: Card): GameState {
  const g = createGame(rng);
  g.deck.push(card);
  return g;
}

describe("deck", () => {
  it("has 108 cards", () => expect(createDeck()).toHaveLength(108));
});

describe("move generation", () => {
  it("initial position: knight has 2 moves, rook none, pawn 2", () => {
    const b = initialBoard();
    expect(movesFrom(b, sq("b1")).sort()).toEqual([sq("a3"), sq("c3")].sort());
    expect(movesFrom(b, sq("a1"))).toEqual([]);
    expect(movesFrom(b, sq("e2")).sort()).toEqual([sq("e3"), sq("e4")].sort());
  });
});

describe("number cards", () => {
  it("allows N moves in total, split across any pieces, then ends turn", () => {
    const g = gameWith(num(2));
    expect(flip(g, 0, rng).ok).toBe(true);
    expect(g.phase).toBe("move");
    expect(move(g, 0, sq("e2"), sq("e4")).ok).toBe(true);
    expect(move(g, 0, sq("d2"), sq("d4")).ok).toBe(true); // a different piece is fine
    expect(g.movesLeft).toBe(0);
    expect(g.turn).toBe(1);
    expect(g.phase).toBe("flip");
  });

  it("can end early", () => {
    const g = gameWith(num(5));
    flip(g, 0, rng);
    move(g, 0, sq("e2"), sq("e4"));
    expect(endTurnEarly(g, 0).ok).toBe(true);
    expect(g.turn).toBe(1);
  });

  it("capturing does not end the turn", () => {
    const g = gameWith(num(5));
    g.board[sq("d5")] = g.board[sq("d7")]!;
    g.board[sq("d7")] = null;
    flip(g, 0, rng);
    move(g, 0, sq("e2"), sq("e4"));
    move(g, 0, sq("e4"), sq("d5"));
    expect(g.captured).toHaveLength(1);
    expect(g.turn).toBe(0);
    expect(g.movesLeft).toBe(3);
  });

  it("rejects wrong turn and enemy pieces", () => {
    const g = gameWith(num(3));
    expect(flip(g, 1, rng).ok).toBe(false);
    flip(g, 0, rng);
    expect(move(g, 0, sq("e7"), sq("e5")).ok).toBe(false);
  });

  it("0 card loses the turn", () => {
    const g = gameWith(num(0));
    flip(g, 0, rng);
    expect(g.turn).toBe(1);
  });
});

describe("special cards", () => {
  it("skip lets the same seat flip again", () => {
    const g = gameWith({ kind: "skip", color: "red" });
    flip(g, 0, rng);
    expect(g.turn).toBe(0);
    expect(g.phase).toBe("flip");
  });

  it("reverse swaps colours and passes the turn", () => {
    const g = gameWith({ kind: "reverse", color: "red" });
    flip(g, 0, rng);
    expect(g.colors).toEqual(["b", "w"]);
    expect(g.turn).toBe(1);
  });

  it("wild requires choosing 1-9", () => {
    const g = gameWith({ kind: "wild" });
    flip(g, 0, rng);
    expect(g.phase).toBe("wild");
    expect(chooseWild(g, 0, 10).ok).toBe(false);
    expect(chooseWild(g, 0, 4).ok).toBe(true);
    expect(g.movesLeft).toBe(4);
  });

  it("+2 with nothing captured just passes the turn", () => {
    const g = gameWith({ kind: "draw2", color: "red" });
    flip(g, 0, rng);
    expect(g.turn).toBe(1);
  });

  it("+2 revives captured pieces onto own home ranks", () => {
    const g = gameWith({ kind: "draw2", color: "red" });
    const knight = g.board[sq("b1")]!;
    const pawn = g.board[sq("a2")]!;
    g.board[sq("b1")] = null;
    g.board[sq("a2")] = null;
    g.captured.push(knight, pawn);
    flip(g, 0, rng);
    expect(g.phase).toBe("revive");
    expect(revive(g, 0, knight.id, sq("e4")).ok).toBe(false); // not a home square
    expect(revive(g, 0, pawn.id, sq("a1")).ok).toBe(false); // pawn on back rank
    expect(revive(g, 0, knight.id, sq("b1")).ok).toBe(true);
    expect(revive(g, 0, pawn.id, sq("a2")).ok).toBe(true);
    expect(g.captured).toHaveLength(0);
    expect(g.turn).toBe(1);
  });
});

describe("winning", () => {
  it("capturing the king ends the game", () => {
    const g = gameWith(num(1));
    g.board[sq("e5")] = g.board[sq("e1")]!;
    g.board[sq("e1")] = null;
    const bk = g.board[sq("e8")]!;
    g.board[sq("e8")] = null;
    g.board[sq("e6")] = bk;
    g.board[sq("e6")]!.type = "K";
    flip(g, 0, rng);
    g.board[sq("e5")]!.type = "R";
    expect(move(g, 0, sq("e5"), sq("e6")).ok).toBe(true);
    expect(g.winner).toBe(0);
    expect(g.phase).toBe("over");
    expect(flip(g, 1, rng).ok).toBe(false);
  });
});
