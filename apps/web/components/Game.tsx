"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Room } from "@colyseus/sdk";
import { Piece, movesFrom, reviveSquares, type Board as CoreBoard } from "@uno-chess/core";
import { connect } from "@/lib/colyseus";
import Board from "./Board";
import Card from "./Card";
import Brand from "./Brand";
import { useAuth } from "@/lib/auth";
import { gameError, useT, type Key } from "@/lib/i18n";
import { BOT_ELO, beep, eloAfter, useProfile } from "@/lib/profile";

type SyncedPiece = Piece & { sq: number };

interface Snap {
  status: string;
  player0: string;
  player1: string;
  color0: "w" | "b";
  color1: "w" | "b";
  turn: number;
  phase: string;
  movesLeft: number;
  reviveLeft: number;
  activeSq: number;
  lastCard: string;
  flipCount: number;
  deckCount: number;
  winner: number;
  turnDeadline: number;
  clock0: number;
  clock1: number;
  pieces: SyncedPiece[];
}

const GLYPH: Record<string, string> = { K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟" };

/** Null until the first state patch arrives (right after joining, `pieces` is still undefined). */
function snapshot(s: any): Snap | null {
  if (!s || !s.pieces) return null;
  return {
    status: s.status, player0: s.player0, player1: s.player1,
    color0: s.color0, color1: s.color1, turn: s.turn, phase: s.phase,
    movesLeft: s.movesLeft, reviveLeft: s.reviveLeft, activeSq: s.activeSq,
    lastCard: s.lastCard, flipCount: s.flipCount, deckCount: s.deckCount,
    winner: s.winner, turnDeadline: s.turnDeadline, clock0: s.clock0, clock1: s.clock1,
    pieces: s.pieces.map((p: SyncedPiece) => ({ id: p.id, type: p.type, color: p.color, sq: p.sq })),
  };
}

export default function Game({ roomId }: { roomId: string }) {
  const [room, setRoom] = useState<Room | null>(null);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [reviveId, setReviveId] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const { t } = useT();
  const { profile, update } = useProfile();
  const { user, refresh } = useAuth();
  const [eloDelta, setEloDelta] = useState<number | null>(null);

  useEffect(() => {
    let off: (() => void)[] = [];
    let dead = false;
    connect(roomId)
      .then((r) => {
        if (dead) return;
        if (r.roomId !== roomId) window.history.replaceState(null, "", `/room/${r.roomId}`);
        setRoom(r);
        setSnap(snapshot(r.state));
        r.onStateChange((s) => {
          const next = snapshot(s);
          if (next) setSnap(next);
        });
        off.push(r.onMessage("error", (m: string) => setToast(gameError(t, m))));
        off.push(r.onMessage("rated", (m: { before: number; after: number }) => {
          rated.current = true; // the server already rated this game
          setEloDelta(m.after - m.before);
          void refresh();
        }));
        r.onLeave(() => setError(t("game.connectionLost")));
      })
      .catch((e) => !dead && setError(t("game.cannotJoin", { msg: e?.message ?? String(e) })));
    return () => {
      dead = true;
      off.forEach((f) => f());
    };
  }, [roomId]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const mySeat = snap && room ? (snap.player0 === room.sessionId ? 0 : 1) : 0;
  const myColor = snap ? (mySeat === 0 ? snap.color0 : snap.color1) : "w";
  const myTurn = !!snap && snap.status === "playing" && snap.turn === mySeat;

  // Reset selections when the phase or turn changes.
  useEffect(() => {
    if (!snap) return;
    if (snap.phase !== "move" || !myTurn) setSelected(null);
    if (snap.phase !== "revive" || !myTurn) setReviveId(null);
  }, [snap?.phase, snap?.turn, snap?.movesLeft, myTurn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rate the game once when it ends (Elo is stored locally).
  const rated = useRef(false);
  useEffect(() => {
    if (!snap || snap.status !== "over" || rated.current || user !== null) return; // logged-in games are rated by the server
    rated.current = true;
    const score = snap.winner === mySeat ? 1 : 0;
    const won = score === 1;
    const opp = snap.player1 === "bot" || snap.player0 === "bot" ? BOT_ELO : 1200;
    update((p) => {
      const elo = eloAfter(p.elo, opp, score);
      setEloDelta(elo - p.elo);
      return { elo, games: p.games + 1, wins: p.wins + (won ? 1 : 0) };
    });
  }, [snap?.status, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sound cues: new card flipped / a move was made.
  const lastSound = useRef({ flip: 0, moves: -1 });
  useEffect(() => {
    if (!snap || !profile.sound) return;
    if (snap.flipCount !== lastSound.current.flip) beep(660, 120);
    else if (lastSound.current.moves !== -1 && snap.movesLeft !== lastSound.current.moves) beep(330, 70);
    lastSound.current = { flip: snap.flipCount, moves: snap.movesLeft };
  }, [snap?.flipCount, snap?.movesLeft]); // eslint-disable-line react-hooks/exhaustive-deps

  const onBoard = useMemo(() => (snap?.pieces ?? []).filter((p) => p.sq >= 0), [snap]);
  const captured = useMemo(() => (snap?.pieces ?? []).filter((p) => p.sq < 0), [snap]);

  const coreBoard = useMemo<CoreBoard>(() => {
    const b: CoreBoard = Array(64).fill(null);
    onBoard.forEach((p) => (b[p.sq] = { id: p.id, type: p.type, color: p.color }));
    return b;
  }, [onBoard]);

  const targets = useMemo(() => {
    if (!snap || !myTurn) return [];
    if (snap.phase === "move" && selected !== null) return movesFrom(coreBoard, selected);
    if (snap.phase === "revive" && reviveId !== null) {
      const p = captured.find((c) => c.id === reviveId);
      return p ? reviveSquares(coreBoard, p.color, p.type) : [];
    }
    return [];
  }, [snap, myTurn, selected, reviveId, coreBoard, captured]);

  const send = useCallback((type: string, msg?: unknown) => room?.send(type, msg), [room]);

  const onSquare = (sq: number) => {
    if (!snap || !myTurn) return;
    if (snap.phase === "move") {
      if (selected !== null && targets.includes(sq)) {
        send("move", { from: selected, to: sq });
        setSelected(null);
        return;
      }
      const p = coreBoard[sq];
      if (p && p.color === myColor) setSelected(sq);
    } else if (snap.phase === "revive" && reviveId !== null && targets.includes(sq)) {
      send("revive", { pieceId: reviveId, square: sq });
      setReviveId(null);
    }
  };

  if (error) return <main className="lobby"><p className="error">{error}</p><a href="/">{t("common.home")}</a></main>;
  if (!snap || !room) return <main className="lobby"><p className="muted">{t("common.connecting")}</p></main>;

  // Time bank per seat: the side to move counts down live, the other side is frozen.
  const bank = (seat: 0 | 1) => {
    const stored = seat === 0 ? snap.clock0 : snap.clock1;
    const ticking = snap.status === "playing" && snap.turn === seat && snap.turnDeadline > 0;
    return Math.max(0, ticking ? snap.turnDeadline - now : stored);
  };
  const fmt = (ms: number) => {
    const t = Math.ceil(ms / 1000);
    return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  };
  const oppSeat = (mySeat === 0 ? 1 : 0) as 0 | 1;
  const myMs = bank(mySeat as 0 | 1);
  const oppMs = bank(oppSeat);
  const status = (() => {
    if (snap.status === "waiting") return t("game.waiting");
    if (snap.status === "over")
      return (snap.winner === mySeat ? t("game.won") : t("game.lost")) + (eloDelta !== null ? ` (${eloDelta >= 0 ? "+" : ""}${eloDelta} Elo)` : "");
    if (!myTurn) return t("game.theirTurn");
    switch (snap.phase) {
      case "flip": return t("game.flip");
      case "move": return t("game.move", { n: snap.movesLeft });
      case "revive": return t("game.revive", { n: snap.reviveLeft });
      case "wild": return t("game.wild");
      default: return "";
    }
  })();
  const myColorName = t(myColor === "w" ? "common.white" : "common.black");
  const oppColorName = t(myColor === "w" ? "common.black" : "common.white");
  const myCaptured = captured.filter((p) => p.color === myColor);
  const theirCaptured = captured.filter((p) => p.color !== myColor);
  const playing = snap.status === "playing";

  const Chip = ({ p, button }: { p: SyncedPiece; button?: boolean }) => {
    const inner = <><span className={`pc ${p.color}`}>{GLYPH[p.type]}</span>{t(`piece.${p.type}` as Key)}</>;
    return button ? (
      <button
        className={reviveId === p.id ? "chip on" : "chip"}
        disabled={!(myTurn && snap.phase === "revive")}
        onClick={() => setReviveId(p.id)}
      >{inner}</button>
    ) : <span className="chip">{inner}</span>;
  };

  return (
    <>
      <Brand right={<span className="pill gold">{t("game.room")} <code>{room.roomId}</code></span>} />
      <main className="arena">
        <aside className="wing">
          <section className="panel glass">
            <h3>{t("game.lostPieces")}</h3>
            <div className="label" style={{ marginBottom: 8 }}>{t("game.yourPieces", { color: myColorName })}</div>
            <div className="chips">
              {myCaptured.length === 0 && <span className="muted">—</span>}
              {myCaptured.map((p) => <Chip key={p.id} p={p} button />)}
            </div>
            <div className="label" style={{ marginBottom: 8 }}>{t("game.theirPieces")}</div>
            <div className="chips" style={{ marginBottom: 0 }}>
              {theirCaptured.length === 0 && <span className="muted">—</span>}
              {theirCaptured.map((p) => <Chip key={p.id} p={p} />)}
            </div>
          </section>
          {snap.status === "waiting" && (
            <button
              className="gold"
              onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/room/${room.roomId}`)}
            >
              {t("game.copyLink")}
            </button>
          )}
        </aside>

        <section className="center">
          <div className={`banner glass ${myTurn ? "mine" : ""}`}>
            <h2>{status}</h2>
          </div>
          <div className="stage plinth">
            <Board
              pieces={onBoard}
              perspective={myColor}
              selected={selected ?? null}
              targets={profile.hints ? targets : []}
              activeSq={snap.activeSq}
              onSquare={onSquare}
              canDrag={(sq) => myTurn && snap.phase === "move" && coreBoard[sq]?.color === myColor}
            />
          </div>
        </section>

        <aside className="wing">
          <section className="panel glass">
            <div className="clock-head">
              <span className="label">{t("game.clocks")}</span>
              <span className="label" style={{ color: "var(--gold)" }}>Blitz 05:00</span>
            </div>
            <div className="clocks">
              {([
                { ms: oppMs, who: t("game.opp", { color: oppColorName }), mine: false, active: playing && snap.turn === oppSeat },
                { ms: myMs, who: t("game.me", { color: myColorName }), mine: true, active: playing && myTurn },
              ]).map((c) => (
                <div key={c.who} className={`clock ${c.active ? "mine" : ""} ${c.active && c.ms <= 10_000 ? "hazard" : ""} ${playing && c.ms === 0 ? "flag" : ""}`}>
                  <div className="label">{c.who}</div>
                  <div className="time">{playing || snap.status === "over" ? fmt(c.ms) : "--:--"}</div>
                  <div className="label">{!playing ? "" : c.active ? (c.mine ? t("game.yourTurnShort") : t("game.thinking")) : t("game.paused")}</div>
                </div>
              ))}
            </div>
            <div className="stat" style={{ marginTop: 10 }}><span className="muted">{t("game.youPlay")}</span><b>{myColorName}</b></div>
            <div className="stat"><span className="muted">{t("game.deck")}</span><b>{snap.deckCount}</b></div>
          </section>

          <section className="panel glass">
            <div className="label" style={{ marginBottom: 10 }}>{t("game.lastCard")}</div>
            <Card label={snap.lastCard} flipKey={snap.flipCount} />
          </section>

          <section className="panel glass actions">
            <div className="label">{t("game.controls")}</div>
            {myTurn && snap.phase === "flip" && (
              <button className="primary" onClick={() => send("flip")}>{t("game.flipBtn")}</button>
            )}
            {myTurn && (snap.phase === "move" || snap.phase === "revive") && (
              <button className="primary" onClick={() => send("endTurn")}>{t("game.endTurn")}</button>
            )}
            {myTurn && snap.phase === "wild" && (
              <div className="wild">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <button key={n} onClick={() => send("chooseWild", { n })}>{n}</button>
                ))}
              </div>
            )}
            {!(myTurn && snap.status === "playing") && <span className="muted">{t("game.notYourTurn")}</span>}
          </section>
        </aside>
      </main>
      <footer className="foot"><span><b>Grandmaster Gambit</b> v1.0</span><span>{t("footer.deckLeft", { n: snap.deckCount })}</span></footer>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
