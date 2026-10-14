"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { movesFrom, type Board as CoreBoard, type Piece } from "@uno-chess/core";
import Board from "./Board";
import Brand from "./Brand";
import Card from "./Card";
import ClassicReplay from "./ClassicReplay";
import { api, useAuth, type GameRow } from "@/lib/auth";
import { apiError, useT, type Key } from "@/lib/i18n";

interface Frame { b: string; c: string; k: string; t: number; p: string; w: string; m: number }
interface ReplayData { game: GameRow & { my_seat: number }; frames: Frame[] }

const GLYPH: Record<string, string> = { K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟" };
const sqName = (sq: number) => "abcdefgh"[sq % 8]! + (Math.floor(sq / 8) + 1);
type T = ReturnType<typeof useT>["t"];

const FILE = (sq: number) => "abcdefgh"[sq % 8]!;
const RANK = (sq: number) => String(Math.floor(sq / 8) + 1);
const CARD_SYMBOL: Record<string, string> = { skip: "⊘", reverse: "⇄", draw2: "+2", wild: "★", wild4: "+4" };

/** Standard algebraic notation for one move (Nf3, exd5, Qxh7, e8=Q), disambiguating like chess.com does. */
function san(prev: Frame, from: number, to: number, promoted: boolean): string {
  const ch = prev.b[from]!;
  const piece = ch.toUpperCase();
  const capture = prev.b[to] !== ".";
  const dest = FILE(to) + RANK(to);
  if (piece === "P") return (capture ? FILE(from) + "x" : "") + dest + (promoted ? "=Q" : "");
  const board: CoreBoard = prev.b.split("").map((c, i) =>
    c === "." ? null : ({ id: i, type: c.toUpperCase(), color: c === c.toUpperCase() ? "w" : "b" } as unknown as Piece),
  );
  const others = prev.b
    .split("")
    .flatMap((c, i) => (c === ch && i !== from && movesFrom(board, i).includes(to) ? [i] : []));
  const dis = !others.length
    ? ""
    : !others.some((o) => FILE(o) === FILE(from))
      ? FILE(from)
      : !others.some((o) => RANK(o) === RANK(from))
        ? RANK(from)
        : FILE(from) + RANK(from);
  return piece + dis + (capture ? "x" : "") + dest;
}

const cardSymbol = (label: string) => {
  const [kind, , n] = label.split(":");
  return kind === "number" ? n! : (CARD_SYMBOL[kind!] ?? "");
};

/** Frames are whole-state snapshots, so "what happened" is derived by diffing neighbours. */
function describe(t: T, prev: Frame | undefined, cur: Frame, who: string) {
  const pn = (ch: string) => t(`piece.${ch.toUpperCase()}` as Key);
  if (!prev) return { text: t("replay.start"), from: -1, to: -1, notation: "" };
  const changed: number[] = [];
  for (let i = 0; i < 64; i++) if (prev.b[i] !== cur.b[i]) changed.push(i);
  if (cur.p === "over" && changed.length === 0) return { text: t("replay.left", { who }), from: -1, to: -1, notation: "⏱" };
  if (changed.length === 2) {
    const from = changed.find((i) => cur.b[i] === ".");
    const to = changed.find((i) => i !== from);
    if (from !== undefined && to !== undefined) {
      const cap = prev.b[to] !== "." ? t("replay.captureSuffix", { piece: pn(prev.b[to]!) }) : "";
      const promoted = prev.b[from]!.toUpperCase() === "P" && cur.b[to]!.toUpperCase() !== "P";
      return {
        text: t("replay.move", { who, piece: pn(prev.b[from]!), from: sqName(from), to: sqName(to) }) + cap,
        from, to, notation: san(prev, from, to, promoted),
      };
    }
  }
  if (changed.length === 1 && prev.b[changed[0]!] === ".") {
    return {
      text: t("replay.revive", { who, piece: pn(cur.b[changed[0]!]!), sq: sqName(changed[0]!) }),
      from: -1, to: changed[0]!, notation: `${cur.b[changed[0]!]!.toUpperCase()}@${sqName(changed[0]!)}`,
    };
  }
  if (cur.w !== prev.w) return { text: t("replay.reverse", { who }), from: -1, to: -1, notation: "🃏 ⇄" };
  if (cur.k !== prev.k) return { text: t("replay.flip", { who }), from: -1, to: -1, notation: `🃏 ${cardSymbol(cur.k)}` };
  return { text: t("replay.chooseN", { who }), from: -1, to: -1, notation: `★ ${cur.m}` };
}

/** The colour that made the move leading to `cur`; null for the opening frame. */
const sideOf = (prev: Frame | undefined): "w" | "b" | null =>
  prev ? (prev.t === 0 ? (prev.w as "w" | "b") : prev.w === "w" ? "b" : "w") : null;

function diff(t: T, prev: Frame | undefined, cur: Frame) {
  const side = sideOf(prev);
  const who = side ? t(side === "w" ? "common.white" : "common.black") : "";
  const d = describe(t, prev, cur, who);
  return { ...d, short: d.notation, side, seat: prev ? prev.t : null };
}

interface Turn { seat: number; steps: number[] }

/**
 * Consecutive steps by the same player form one turn; turns are paired into rows, one cell per player
 * (columns follow the players, not the colours, because Reverse swaps colours mid-game).
 */
function toRows(steps: { seat: number | null }[]) {
  const turns: Turn[] = [];
  steps.forEach((s, k) => {
    if (s.seat === null) return;
    const last = turns[turns.length - 1];
    if (last && last.seat === s.seat) last.steps.push(k);
    else turns.push({ seat: s.seat, steps: [k] });
  });
  const first = turns[0]?.seat;
  const rows: Record<number, Turn | undefined>[] = [];
  for (const turn of turns) {
    const row = rows[rows.length - 1];
    if (turn.seat !== first && row && !row[turn.seat]) row[turn.seat] = turn;
    else rows.push({ [turn.seat]: turn });
  }
  return rows;
}

export type { ReplayData };

/** Loads a finished game and shows the replay that matches its variant. */
export default function Replay({ gameId }: { gameId: string }) {
  const { t } = useT();
  const router = useRouter();
  const { user } = useAuth();
  const [data, setData] = useState<ReplayData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user === null) router.replace("/login");
    if (user) api<ReplayData>(`/games/${gameId}`).then(setData).catch((e) => setError(apiError(t, e)));
  }, [user, gameId, router]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return (<><Brand /><main className="page"><p className="error">{error}</p><Link href="/stats" className="link">{t("replay.back")}</Link></main></>);
  if (!data) return (<><Brand /><main className="page"><p className="muted">{t("common.loading")}</p></main></>);
  return data.game.variant === "classic" ? <ClassicReplay data={data as never} /> : <UnoReplay data={data} />;
}

function UnoReplay({ data }: { data: ReplayData }) {
  const { t, lang } = useT();
  const locale = lang === "vi" ? "vi-VN" : "en-US";
  const { user } = useAuth();
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1000);
  const listRef = useRef<HTMLDivElement>(null);

  const n = data.frames.length;
  useEffect(() => {
    if (!playing) return;
    if (i >= n - 1) return setPlaying(false);
    const t = setTimeout(() => setI((x) => x + 1), speed);
    return () => clearTimeout(t);
  }, [playing, i, n, speed]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
      else if (e.key === "ArrowRight") setI((x) => Math.min(n - 1, x + 1));
      else if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [n]);

  useEffect(() => {
    listRef.current?.querySelector("button.cur")?.scrollIntoView({ block: "nearest" });
  }, [i]);

  const steps = useMemo(() => data.frames.map((f, k) => diff(t, data.frames[k - 1], f)), [data, t]);

  const f = data.frames[i]!;
  const mine = data.game.my_seat;
  const myStart = (mine === 0 ? data.frames[0]!.w : data.frames[0]!.w === "w" ? "b" : "w") as "w" | "b";
  const pieces = f.b.split("").flatMap((ch, sq) =>
    ch === "." ? [] : [{ id: sq, type: ch.toUpperCase(), color: ch === ch.toUpperCase() ? "w" : "b", sq } as unknown as Piece & { sq: number }],
  );
  const cap = (white: boolean) => f.c.split("").filter((ch) => (ch === ch.toUpperCase()) === white);
  // Counts card draws up to this frame, so stepping onto a new card flips it (and stepping back does not).
  const flipId = data.frames.slice(0, i + 1).filter((fr, k) => k > 0 && fr.k !== data.frames[k - 1]!.k).length;
  const step = steps[i]!;
  const rows = toRows(steps);
  const names = [user?.username ?? t("common.you"), data.game.opponent];
  const toMove = f.t === 0 ? f.w : f.w === "w" ? "b" : "w";
  const youMove = f.t === mine;

  return (
    <>
      <Brand />
      <main className="arena replay">
        <aside className="wing">
          <section className="panel glass">
            <h3>{t("replay.game")}</h3>
            <div className="stat"><span className="muted">{t("replay.result")}</span><b style={{ color: data.game.won ? "var(--green)" : "#ffb4ab" }}>{data.game.won ? t("common.yes") : t("common.lose")}</b></div>
            <div className="stat"><span className="muted">{t("replay.opponent")}</span><b>{data.game.opponent}</b></div>
            <div className="stat"><span className="muted">{t("replay.mode")}</span><b>{["bot", "online", "friend"].includes(data.game.mode) ? t(`mode.${data.game.mode}` as Key) : data.game.mode}</b></div>
            <div className="stat"><span className="muted">{t("replay.time")}</span><b>{new Date(data.game.played_at).toLocaleString(locale)}</b></div>
            <div className="stat"><span className="muted">Elo</span><b>{data.game.elo_before} → {data.game.elo_after}</b></div>
          </section>
          <section className="panel glass">
            <h3>{t("replay.captured")}</h3>
            <div className="label" style={{ marginBottom: 8 }}>{t("replay.whiteLost")}</div>
            <div className="chips">{cap(true).length === 0 ? <span className="muted">—</span> : cap(true).map((c, k) => <span key={k} className="chip"><span className="pc w">{GLYPH[c]}</span>{t(`piece.${c}` as Key)}</span>)}</div>
            <div className="label" style={{ marginBottom: 8 }}>{t("replay.blackLost")}</div>
            <div className="chips" style={{ marginBottom: 0 }}>{cap(false).length === 0 ? <span className="muted">—</span> : cap(false).map((c, k) => <span key={k} className="chip"><span className="pc b">{GLYPH[c.toUpperCase()]}</span>{t(`piece.${c.toUpperCase()}` as Key)}</span>)}</div>
          </section>
        </aside>

        <section className="center">
          <div className="banner glass mine"><h2>{step.text}</h2></div>
          <div className="stage plinth">
            <Board
              pieces={pieces}
              perspective={myStart}
              selected={step.from >= 0 ? step.from : null}
              targets={[]}
              activeSq={step.to}
              onSquare={() => {}}
            />
          </div>
          <div className="player-controls glass">
            <button onClick={() => { setPlaying(false); setI(0); }} aria-label={t("replay.toStart")}>⏮</button>
            <button onClick={() => setI((x) => Math.max(0, x - 1))} aria-label={t("replay.prev")}>◀</button>
            <button className="gold" onClick={() => { if (i >= n - 1) setI(0); setPlaying((p) => !p); }}>{playing ? t("replay.pause") : t("replay.play")}</button>
            <button onClick={() => setI((x) => Math.min(n - 1, x + 1))} aria-label={t("replay.next")}>▶</button>
            <button onClick={() => { setPlaying(false); setI(n - 1); }} aria-label={t("replay.toEnd")}>⏭</button>
            <input type="range" min={0} max={n - 1} value={i} onChange={(e) => { setPlaying(false); setI(Number(e.target.value)); }} aria-label={t("replay.progress")} />
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label={t("replay.speed")}>
              <option value={2000}>0.5x</option><option value={1000}>1x</option><option value={500}>2x</option><option value={250}>4x</option>
            </select>
          </div>
          <span className="label">{t("replay.step", { i: i + 1, n })}</span>
        </section>

        <aside className="wing">
          <section className="panel glass">
            <div className="label" style={{ marginBottom: 10 }}>Lá bài vừa lật</div>
            <Card label={f.k} flipKey={flipId} />
            <div className="stat" style={{ marginTop: 12 }}><span className="muted">{t("replay.toMove")}</span><b>{f.p === "over" ? t("replay.ended") : `${toMove === "w" ? t("common.white") : t("common.black")}${youMove ? t("replay.youMark") : ""}`}</b></div>
            {f.p === "move" && <div className="stat"><span className="muted">{t("replay.movesLeft")}</span><b>{f.m}</b></div>}
          </section>
          <section className="panel glass">
            <h3>{t("replay.log")}</h3>
            <div className="turns" ref={listRef}>
              <div className="turns-head">
                <span /><span>{names[0]}</span><span>{names[1]}</span>
              </div>
              <button className={`turn-start ${i === 0 ? "cur" : ""}`} onClick={() => { setPlaying(false); setI(0); }}>{t("replay.start")}</button>
              {rows.map((row, n) => (
                <div className="turn-row" key={n}>
                  <span className="rn">{n + 1}</span>
                  {([mine, 1 - mine] as const).map((seat) => (
                    <div className="turn-cell" key={seat}>
                      {row[seat]?.steps.map((k) => (
                        <button key={k} className={k === i ? "cur" : ""} onClick={() => { setPlaying(false); setI(k); }}>
                          {steps[k]!.short}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        </aside>
      </main>
    </>
  );
}
