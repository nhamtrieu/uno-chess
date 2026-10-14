import { describe, expect, it } from "vitest";
import { Chess, classicBotMove, classicResult, classicTargets, fenToPieces, needsPromotion, seededRng, sqIndex, sqName } from "./index";

const START = new Chess().fen();

describe("classic chess helpers", () => {
  it("maps squares like the Uno board (a1 = 0)", () => {
    expect(sqIndex("a1")).toBe(0);
    expect(sqIndex("h8")).toBe(63);
    expect(sqName(12)).toBe("e2");
  });

  it("reads pieces from a FEN", () => {
    const ps = fenToPieces(START);
    expect(ps).toHaveLength(32);
    expect(ps.find((p) => p.sq === sqIndex("e1"))).toMatchObject({ type: "K", color: "w" });
    expect(ps.find((p) => p.sq === sqIndex("d8"))).toMatchObject({ type: "Q", color: "b" });
  });

  it("lists legal targets only", () => {
    expect(classicTargets(START, sqIndex("g1")).sort()).toEqual([sqIndex("f3"), sqIndex("h3")].sort());
    expect(classicTargets(START, sqIndex("e2")).sort()).toEqual([sqIndex("e3"), sqIndex("e4")].sort());
    expect(classicTargets(START, sqIndex("a1"))).toEqual([]);
  });

  it("detects promotion", () => {
    const fen = "8/P6k/8/8/8/8/8/K7 w - - 0 1";
    expect(needsPromotion(fen, sqIndex("a7"), sqIndex("a8"))).toBe(true);
    expect(needsPromotion(START, sqIndex("e2"), sqIndex("e4"))).toBe(false);
  });

  it("recognises checkmate and stalemate", () => {
    const mate = new Chess();
    for (const m of ["f3", "e5", "g4", "Qh4"]) mate.move(m);
    expect(classicResult(mate)).toEqual({ winner: "b", reason: "checkmate" });
    const stale = new Chess("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
    expect(classicResult(stale)).toEqual({ winner: "draw", reason: "stalemate" });
    expect(classicResult(new Chess()).winner).toBeNull();
  });

  it("the bot plays legal moves, takes a free queen and finds mate in one", () => {
    const rng = seededRng(1);
    const free = "4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1"; // Rxd5 wins the queen
    expect(classicBotMove(free, rng, { depth: 3, timeMs: 3000 })).toMatchObject({ from: "d1", to: "d5" });
    const matein1 = "6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1"; // Ra8#
    expect(classicBotMove(matein1, rng, { depth: 3, timeMs: 3000 })).toMatchObject({ from: "a1", to: "a8" });
    const g = new Chess();
    for (let i = 0; i < 16 && !g.isGameOver(); i++) {
      const m = classicBotMove(g.fen(), rng, { depth: 2, timeMs: 500 })!;
      expect(() => g.move(m)).not.toThrow();
    }
  }, 30_000);
});
