"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Room } from "@colyseus/sdk";
import { classicTargets, fenToPieces, needsPromotion, sqName, type ClassicPiece } from "@uno-chess/core";
import { connect } from "@/lib/colyseus";
import { groupOf, optionsFromSearch, tcLabel } from "@/lib/timeControl";
import { useAuth } from "@/lib/auth";
import { BOT_ELO, beep, eloAfter, useElo, useProfile } from "@/lib/profile";
import { gameError, useT, type Key } from "@/lib/i18n";
import Board from "./Board";
import Brand from "./Brand";

interface Snap {
  fen: string; status: string; whiteId: string; blackId: string; turn: "w" | "b";
  lastFrom: number; lastTo: number; inCheck: boolean; winner: string; reason: string;
  clockW: number; clockB: number; turnDeadline: number; drawOffer: string; moves: string[]; tc: string; rated: boolean;
}
const GLYPH: Record<string, string> = { K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟" };

const snapshot = (s: any): Snap | null =>
  !s || typeof s.fen !== "string" || !s.fen
    ? null
    : {
        fen: s.fen, status: s.status, whiteId: s.whiteId, blackId: s.blackId, turn: s.turn,
        lastFrom: s.lastFrom, lastTo: s.lastTo, inCheck: s.inCheck, winner: s.winner, reason: s.reason,
        clockW: s.clockW, clockB: s.clockB, turnDeadline: s.turnDeadline, drawOffer: s.drawOffer,
        moves: JSON.parse(s.moves || "[]"), tc: s.tc, rated: s.rated !== false,
      };

const fmt = (ms: number) => {
  const t = Math.ceil(ms / 1000);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

export default function ClassicGame({ roomId }: { roomId: string }) {
  const { t } = useT();
  const { profile, update } = useProfile();
  const { user, refresh } = useAuth();
  const guestRated = useRef(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [promo, setPromo] = useState<{ from: number; to: number } | null>(null);
  const [eloDelta, setEloDelta] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const plies = useRef(0);
  // rating pool of this game: the room's time control once known, else what the link asked for
  const category = groupOf(snap?.tc ?? (typeof window === "undefined" ? "10+0" : optionsFromSearch(window.location.search).tc));
  const myElo = useElo(category);

  useEffect(() => {
    const off: (() => void)[] = [];
    let dead = false;
    connect(roomId, "classic", { ...optionsFromSearch(window.location.search) })
      .then((r) => {
        if (dead) return;
        if (r.roomId !== roomId) window.history.replaceState(null, "", `/classic/${r.roomId}`);
        setRoom(r);
        setSnap(snapshot(r.state));
        r.onStateChange((s) => {
          const next = snapshot(s);
          if (next) setSnap(next);
        });
        off.push(r.onMessage("error", (m: string) => setToast(m === "bot_declines_draw" ? t("classic.botDeclines") : gameError(t, m))));
        off.push(r.onMessage("rated", (m: { before: number; after: number }) => {
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
  }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  const myColor = snap && room ? (snap.whiteId === room.sessionId ? "w" : "b") : "w";
  const playing = snap?.status === "playing";
  const myTurn = !!snap && playing && snap.turn === myColor;

  // Drop the selection whenever the position changes (a move was made by either side).
  useEffect(() => {
    setSelected(null);
    setPromo(null);
    if (snap && profile.sound && snap.moves.length !== plies.current && plies.current !== 0) beep(snap.moves.at(-1)?.includes("x") ? 260 : 360, 70);
    plies.current = snap?.moves.length ?? 0;
  }, [snap?.fen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Guests keep a local rating per time-control category; accounts are rated by the server (the "rated" message).
  useEffect(() => {
    if (!snap || snap.status !== "over" || !snap.rated || user !== null || guestRated.current) return;
    guestRated.current = true;
    const cat = groupOf(snap.tc);
    const score = snap.winner === "draw" ? 0.5 : snap.winner === myColor ? 1 : 0;
    const opp = snap.whiteId === "bot" || snap.blackId === "bot" ? BOT_ELO - 500 : 1200; // the classic bot is rated 1000
    update((p) => {
      const r = p.ratings[cat];
      const elo = eloAfter(r.elo, opp, score);
      setEloDelta(elo - r.elo);
      return { ratings: { ...p.ratings, [cat]: { elo, games: r.games + 1, wins: r.wins + (score === 1 ? 1 : 0) } } };
    });
  }, [snap?.status, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const pieces = useMemo(() => (snap ? fenToPieces(snap.fen) : []), [snap?.fen]); // eslint-disable-line react-hooks/exhaustive-deps
  const targets = useMemo(
    () => (snap && myTurn && selected !== null ? classicTargets(snap.fen, selected) : []),
    [snap?.fen, myTurn, selected], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const kingInCheck = snap?.inCheck ? pieces.find((p) => p.type === "K" && p.color === snap.turn)?.sq : undefined;

  if (error) return <main className="lobby"><p className="error">{error}</p><a href="/">{t("common.home")}</a></main>;
  if (!snap || !room) return <main className="lobby"><p className="muted">{t("common.connecting")}</p></main>;

  const send = (type: string, msg?: unknown) => room.send(type, msg);
  const colorName = (c: string) => t(c === "w" ? "common.white" : "common.black");

  const onSquare = (sq: number) => {
    if (!myTurn) return;
    if (selected !== null && targets.includes(sq)) {
      if (needsPromotion(snap.fen, selected, sq)) return setPromo({ from: selected, to: sq });
      send("move", { from: sqName(selected), to: sqName(sq) });
      setSelected(null);
      return;
    }
    const p = pieces.find((x: ClassicPiece) => x.sq === sq);
    setSelected(p && p.color === myColor ? sq : null);
  };

  const clockMs = (c: "w" | "b") => {
    const stored = c === "w" ? snap.clockW : snap.clockB;
    return Math.max(0, playing && snap.turn === c && snap.turnDeadline > 0 ? snap.turnDeadline - now : stored);
  };

  const status = (() => {
    if (snap.status === "waiting") return t("game.waiting");
    if (snap.status === "over") {
      const head =
        snap.winner === "draw" ? t("classic.draw") : snap.winner === myColor ? t("game.won") : t("game.lost");
      const delta = eloDelta !== null && snap.rated ? ` (${eloDelta >= 0 ? "+" : ""}${eloDelta} Elo)` : "";
      return `${head} — ${t(`classic.reason.${snap.reason}` as Key)}${delta}`;
    }
    return (myTurn ? t("classic.yourMove") : t("game.theirTurn")) + (snap.inCheck ? ` — ${t("classic.check")}` : "");
  })();

  const rows: { n: number; w?: string; b?: string }[] = [];
  snap.moves.forEach((m, i) => {
    if (i % 2 === 0) rows.push({ n: i / 2 + 1, w: m });
    else rows[rows.length - 1]!.b = m;
  });

  const opp = myColor === "w" ? "b" : "w";
  const clocks = [
    { c: opp, who: t("game.opp", { color: colorName(opp) }), mine: false },
    { c: myColor, who: t("game.me", { color: colorName(myColor) }), mine: true },
  ] as const;
  const offeredToMe = snap.drawOffer !== "" && snap.drawOffer !== myColor;

  return (
    <>
      <Brand right={<span className="pill gold">{t("game.room")} <code>{room.roomId}</code></span>} />
      <main className="arena">
        <aside className="wing">
          <section className="panel glass">
            <h3>{t("classic.moves")}</h3>
            <div className="moves">
              {rows.length === 0 && <span className="muted">—</span>}
              {rows.map((r) => (
                <div className="mrow" key={r.n}><span>{r.n}.</span><span>{r.w}</span><span>{r.b}</span></div>
              ))}
            </div>
          </section>
          {snap.status === "waiting" && (
            <button className="gold" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/classic/${room.roomId}`)}>
              {t("game.copyLink")}
            </button>
          )}
        </aside>

        <section className="center">
          <div className={`banner glass ${myTurn ? "mine" : ""}`}><h2>{status}</h2></div>
          <div className="stage plinth">
            <Board
              pieces={pieces as never}
              perspective={myColor}
              selected={selected}
              targets={profile.hints ? targets : []}
              activeSq={-1}
              trail={snap.lastFrom >= 0 ? [snap.lastFrom, snap.lastTo] : []}
              check={kingInCheck}
              onSquare={onSquare}
              canDrag={(sq) => myTurn && pieces.some((p) => p.sq === sq && p.color === myColor)}
            />
          </div>
        </section>

        <aside className="wing">
          <section className="panel glass">
            <div className="clock-head">
              <span className="label">{t("game.clocks")}</span>
              <span className="label" style={{ color: "var(--gold)" }}>{tcLabel(snap.tc)} · {snap.rated ? t("classic.rated") : t("classic.casual")}</span>
            </div>
            <div className="clocks">
              {clocks.map((k) => {
                const ms = clockMs(k.c);
                const active = playing && snap.turn === k.c;
                return (
                  <div key={k.c} className={`clock ${active ? "mine" : ""} ${active && ms <= 10_000 ? "hazard" : ""}`}>
                    <div className="label">{k.who}</div>
                    <div className="time">{snap.status === "waiting" ? "--:--" : fmt(ms)}</div>
                    <div className="label">{!playing ? "" : active ? (k.mine ? t("game.yourTurnShort") : t("game.thinking")) : t("game.paused")}</div>
                  </div>
                );
              })}
            </div>
            <div className="stat" style={{ marginTop: 10 }}><span className="muted">{user ? user.username : profile.name}</span><b>{t(`classic.${category}`)} · Elo {myElo}</b></div>
          </section>

          <section className="panel glass actions">
            <div className="label">{t("game.controls")}</div>
            {offeredToMe && (
              <div className="offer">
                <b>{t("classic.drawOffered")}</b>
                <div className="row">
                  <button className="gold" onClick={() => send("acceptDraw")}>{t("classic.accept")}</button>
                  <button onClick={() => send("declineDraw")}>{t("classic.decline")}</button>
                </div>
              </div>
            )}
            {playing && (
              <>
                <button disabled={snap.drawOffer === myColor} onClick={() => send("offerDraw")}>
                  {snap.drawOffer === myColor ? t("classic.drawSent") : t("classic.offerDraw")}
                </button>
                <button className="danger" onClick={() => confirm(t("classic.resignConfirm")) && send("resign")}>{t("classic.resign")}</button>
              </>
            )}
            {!playing && <a href="/"><button style={{ width: "100%" }}>{t("common.home")}</button></a>}
          </section>
        </aside>
      </main>

      {promo && (
        <div className="modal-back" onClick={() => setPromo(null)}>
          <div className="modal glass" onClick={(e) => e.stopPropagation()}>
            <h2>{t("classic.promote")}</h2>
            <div className="promo">
              {(["q", "r", "b", "n"] as const).map((p) => (
                <button
                  key={p}
                  aria-label={t(`piece.${p.toUpperCase()}` as Key)}
                  onClick={() => {
                    send("move", { from: sqName(promo.from), to: sqName(promo.to), promotion: p });
                    setPromo(null);
                    setSelected(null);
                  }}
                >
                  <span className={`pc ${myColor}`}>{GLYPH[p.toUpperCase()]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <footer className="foot"><span><b>Grandmaster Gambit</b> v1.0</span><span>{t("classic.title")}</span></footer>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
