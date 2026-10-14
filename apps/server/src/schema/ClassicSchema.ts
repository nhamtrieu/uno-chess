import { schema, t, type SchemaType } from "@colyseus/schema";

export const ClassicSchema = schema(
  {
    fen: t.string(),
    status: t.string(), // waiting | playing | over
    /** sessionIds of the player holding each colour ("" until joined / assigned). */
    whiteId: t.string(),
    blackId: t.string(),
    turn: t.string(), // "w" | "b"
    lastFrom: t.number(), // -1 before the first move
    lastTo: t.number(),
    inCheck: t.boolean(),
    /** "" while playing, then "w" | "b" | "draw". */
    winner: t.string(),
    reason: t.string(), // checkmate | stalemate | timeout | resignation | agreement | ...
    /** Time bank in ms per colour as of `clockStart`; the side to move keeps ticking until `turnDeadline`. */
    clockW: t.number(),
    clockB: t.number(),
    clockStart: t.number(),
    turnDeadline: t.number(),
    /** Colour that currently has a draw offer on the table ("" when none). */
    drawOffer: t.string(),
    /** Time control as "minutes+increment seconds" (e.g. "10+5"); `incMs` is the increment in ms. */
    tc: t.string(),
    incMs: t.number(),
    rated: t.boolean(),
    /** JSON array of SAN moves, e.g. ["e4","e5","Nf3"]. */
    moves: t.string(),
  },
  "ClassicSchema",
);
export type ClassicSchema = SchemaType<typeof ClassicSchema>;
