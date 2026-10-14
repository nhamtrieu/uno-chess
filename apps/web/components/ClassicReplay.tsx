"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fenToPieces } from "@uno-chess/core";
import Board from "./Board";
import Brand from "./Brand";
import type { GameRow } from "@/lib/auth";
import { useAuth } from "@/lib/auth";
import { useT, type Key } from "@/lib/i18n";
import { tcLabel } from "@/lib/timeControl";

interface Frame { f: string; s: string; a: number; b: number }
interface Data { game: GameRow & { my_seat: number }; frames: Frame[] }

/** Replay of a classic-chess game: one frame per position, with the SAN of the move that led to it. */
export default function ClassicReplay({ data }: { data: Data }) {
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
    const id = setTimeout(() => setI((x) => x + 1), speed);
    return () => clearTimeout(id);
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

  const f = data.frames[i]!;
  const pieces = useMemo(() => fenToPieces(f.f), [f.f]);
  const perspective = data.game.my_seat === 0 ? "w" : "b"; // seat 0 is White in classic games
  const g = data.game;
  const result = g.draw ? t("replay.drawResult") : g.won ? t("common.yes") : t("common.lose");
  const resultColor = g.draw ? "var(--muted)" : g.won ? "var(--green)" : "var(--err)";

  const rows: { n: number; w?: number; b?: number }[] = [];
  data.frames.forEach((fr, k) => {
    if (k === 0) return;
    if (k % 2 === 1) rows.push({ n: (k + 1) / 2, w: k });
    else rows[rows.length - 1]!.b = k;
  });
  const names = g.my_seat === 0 ? [user?.username ?? t("common.you"), g.opponent] : [g.opponent, user?.username ?? t("common.you")];
  const mode = ["bot", "online", "friend"].includes(g.mode) ? t(`mode.${g.mode}` as Key) : g.mode;

  const cell = (k?: number) =>
    k === undefined ? <span /> : (
      <button className={k === i ? "cur" : ""} onClick={() => { setPlaying(false); setI(k); }}>{data.frames[k]!.s}</button>
    );

  return (
    <>
      <Brand />
      <main className="arena replay">
        <aside className="wing">
          <section className="panel glass">
            <h3>{t("replay.game")}</h3>
            <div className="stat"><span className="muted">{t("replay.result")}</span><b style={{ color: resultColor }}>{result}</b></div>
            <div className="stat"><span className="muted">{t("common.white")}</span><b>{names[0]}</b></div>
            <div className="stat"><span className="muted">{t("common.black")}</span><b>{names[1]}</b></div>
            <div className="stat"><span className="muted">{t("replay.mode")}</span><b>{t("classic.title")} · {mode}{g.tc ? ` · ${tcLabel(g.tc)}` : ""}{g.rated === 0 ? ` · ${t("classic.casual")}` : ""}</b></div>
            <div className="stat"><span className="muted">{t("replay.time")}</span><b>{new Date(g.played_at).toLocaleString(locale)}</b></div>
            <div className="stat"><span className="muted">Elo</span><b>{g.elo_before} → {g.elo_after}</b></div>
          </section>
        </aside>

        <section className="center">
          <div className="banner glass mine"><h2>{i === 0 ? t("replay.start") : `${Math.ceil(i / 2)}${i % 2 ? "." : "…"} ${f.s}`}</h2></div>
          <div className="stage plinth">
            <Board
              pieces={pieces as never}
              perspective={perspective}
              selected={null}
              targets={[]}
              activeSq={-1}
              trail={f.a >= 0 ? [f.a, f.b] : []}
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
            <h3>{t("classic.moves")}</h3>
            <div className="moves" ref={listRef}>
              <div className="mrow"><span /><span className="label">{names[0]}</span><span className="label">{names[1]}</span></div>
              {rows.map((r) => (
                <div className="mrow" key={r.n}><span>{r.n}.</span>{cell(r.w)}{cell(r.b)}</div>
              ))}
            </div>
          </section>
        </aside>
      </main>
    </>
  );
}
