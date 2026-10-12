import { schema, t, type SchemaType } from "@colyseus/schema";

export const PieceState = schema(
  {
    id: t.number(),
    type: t.string(),
    color: t.string(),
    /** Board square 0-63, or -1 when captured. */
    sq: t.number(),
  },
  "PieceState",
);
export type PieceState = SchemaType<typeof PieceState>;

export const GameSchema = schema(
  {
    pieces: t.array(PieceState),
    /** sessionIds of the two seats ("" until joined). */
    player0: t.string(),
    player1: t.string(),
    /** Colour ("w" | "b") each seat currently controls. */
    color0: t.string(),
    color1: t.string(),
    status: t.string(), // waiting | playing | over
    turn: t.number(),
    phase: t.string(), // flip | move | revive | wild | over
    movesLeft: t.number(),
    reviveLeft: t.number(),
    /** Square of the piece locked in this turn, -1 if none. */
    activeSq: t.number(),
    /** e.g. "number:red:5", "skip:red", "wild4"; "" before the first flip. */
    lastCard: t.string(),
    /** Bumps on every flip so clients can animate repeated identical cards. */
    flipCount: t.number(),
    deckCount: t.number(),
    winner: t.number(), // seat, -1 none
    turnDeadline: t.number(), // epoch ms when the side to move runs out of time, 0 when no clock runs
    /** Time bank (ms) per seat, as of `clockStart`; the side to move is still ticking down. */
    clock0: t.number(),
    clock1: t.number(),
    clockStart: t.number(),
  },
  "GameSchema",
);
export type GameSchema = SchemaType<typeof GameSchema>;
