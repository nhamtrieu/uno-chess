export type CardColor = "red" | "yellow" | "green" | "blue";

export type Card =
  | { kind: "number"; n: number; color: CardColor }
  | { kind: "skip" | "reverse" | "draw2"; color: CardColor }
  | { kind: "wild" | "wild4" };

export type Rng = () => number;

/** Small seedable PRNG (mulberry32) so games and tests are reproducible. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createDeck(): Card[] {
  const cards: Card[] = [];
  const colors: CardColor[] = ["red", "yellow", "green", "blue"];
  for (const color of colors) {
    cards.push({ kind: "number", n: 0, color });
    for (let n = 1; n <= 9; n++) {
      cards.push({ kind: "number", n, color }, { kind: "number", n, color });
    }
    for (const kind of ["skip", "reverse", "draw2"] as const) {
      cards.push({ kind, color }, { kind, color });
    }
  }
  for (let i = 0; i < 4; i++) cards.push({ kind: "wild" }, { kind: "wild4" });
  return cards; // 108
}

export function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
