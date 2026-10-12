"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Room } from "@colyseus/sdk";
import { Piece, movesFrom, reviveSquares, type Board as CoreBoard } from "@uno-chess/core";
import { connect } from "@/lib/colyseus";
import Board from "./Board";
import Card from "./Card";
import Brand from "./Brand";
import { useAuth } from "@/lib/auth";
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

const PIECE_NAME: Record<string, string> = {
  K: "Vua", Q: "Hậu", R: "Xe", B: "Tượng", N: "Mã", P: "Tốt",
};
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
        off.push(r.onMessage("error", (m: string) => setToast(m)));
        off.push(r.onMessage("rated", (m: { before: number; after: number }) => {
          rated.current = true; // the server already rated this game
          setEloDelta(m.after - m.before);
          void refresh();
        }));
        r.onLeave(() => setError("Mất kết nối tới phòng."));
      })
      .catch((e) => !dead && setError(`Không vào được phòng: ${e?.message ?? e}`));
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
    const won = snap.winner === mySeat;
    const opp = snap.player1 === "bot" || snap.player0 === "bot" ? BOT_ELO : 1200;
    update((p) => {
      const elo = eloAfter(p.elo, opp, won);
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

  if (error) return <main className="lobby"><p className="error">{error}</p><a href="/">Về trang chủ</a></main>;
  if (!snap || !room) return <main className="lobby"><p className="muted">Đang kết nối…</p></main>;

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
    if (snap.status === "waiting") return "Đang chờ đối thủ… Gửi link hoặc mã phòng cho bạn bè.";
    if (snap.status === "over")
      return (snap.winner === mySeat ? "🎉 Bạn thắng!" : "Bạn thua.") + (eloDelta !== null ? ` (${eloDelta >= 0 ? "+" : ""}${eloDelta} Elo)` : "");
    if (!myTurn) return "Lượt của đối thủ";
    switch (snap.phase) {
      case "flip": return "Lượt của bạn — hãy lật bài";
      case "move": return `Còn tối đa ${snap.movesLeft} nước — chọn quân bất kỳ rồi chọn nước đi`;
      case "revive": return `Hồi sinh còn tối đa ${snap.reviveLeft} quân — chọn quân rồi chọn ô`;
      case "wild": return "Wild! Chọn số nước đi (1–9)";
      default: return "";
    }
  })();
  const myCaptured = captured.filter((p) => p.color === myColor);
  const theirCaptured = captured.filter((p) => p.color !== myColor);
  const playing = snap.status === "playing";

  const Chip = ({ p, button }: { p: SyncedPiece; button?: boolean }) => {
    const inner = <><span className={`pc ${p.color}`}>{GLYPH[p.type]}</span>{PIECE_NAME[p.type]}</>;
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
      <Brand right={<span className="pill gold">Phòng <code>{room.roomId}</code></span>} />
      <main className="arena">
        <aside className="wing">
          <section className="panel glass">
            <h3>Hộp quân cờ đã mất</h3>
            <div className="label" style={{ marginBottom: 8 }}>Quân của bạn ({myColor === "w" ? "Trắng" : "Đen"})</div>
            <div className="chips">
              {myCaptured.length === 0 && <span className="muted">—</span>}
              {myCaptured.map((p) => <Chip key={p.id} p={p} button />)}
            </div>
            <div className="label" style={{ marginBottom: 8 }}>Quân đối thủ</div>
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
              Sao chép link mời
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
              <span className="label">⏱ Đồng hồ thi đấu</span>
              <span className="label" style={{ color: "var(--gold)" }}>Blitz 05:00</span>
            </div>
            <div className="clocks">
              {([
                { ms: oppMs, who: `Đối thủ (${myColor === "w" ? "Đen" : "Trắng"})`, mine: false, active: playing && snap.turn === oppSeat },
                { ms: myMs, who: `Bạn (${myColor === "w" ? "Trắng" : "Đen"})`, mine: true, active: playing && myTurn },
              ]).map((c) => (
                <div key={c.who} className={`clock ${c.active ? "mine" : ""} ${c.active && c.ms <= 10_000 ? "hazard" : ""} ${playing && c.ms === 0 ? "flag" : ""}`}>
                  <div className="label">{c.who}</div>
                  <div className="time">{playing || snap.status === "over" ? fmt(c.ms) : "--:--"}</div>
                  <div className="label">{!playing ? "" : c.active ? (c.mine ? "Lượt của bạn" : "Đang nghĩ…") : "Tạm dừng"}</div>
                </div>
              ))}
            </div>
            <div className="stat" style={{ marginTop: 10 }}><span className="muted">Bạn cầm</span><b>{myColor === "w" ? "Trắng" : "Đen"}</b></div>
            <div className="stat"><span className="muted">Bài còn</span><b>{snap.deckCount}</b></div>
          </section>

          <section className="panel glass">
            <div className="label" style={{ marginBottom: 10 }}>Lá bài vừa lật</div>
            <Card label={snap.lastCard} />
          </section>

          <section className="panel glass actions">
            <div className="label">Bảng điều khiển lượt</div>
            {myTurn && snap.phase === "flip" && (
              <button className="primary" onClick={() => send("flip")}>Lật bài</button>
            )}
            {myTurn && (snap.phase === "move" || snap.phase === "revive") && (
              <button className="primary" onClick={() => send("endTurn")}>Kết thúc lượt</button>
            )}
            {myTurn && snap.phase === "wild" && (
              <div className="wild">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <button key={n} onClick={() => send("chooseWild", { n })}>{n}</button>
                ))}
              </div>
            )}
            {!(myTurn && snap.status === "playing") && <span className="muted">Chưa đến lượt bạn.</span>}
          </section>
        </aside>
      </main>
      <footer className="foot"><span><b>Grandmaster Gambit</b> v1.0</span><span>Bài còn {snap.deckCount} lá</span></footer>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
