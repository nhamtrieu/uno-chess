"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Piece } from "@uno-chess/core";
import Board from "./Board";
import Brand from "./Brand";
import Card from "./Card";
import { api, useAuth, type GameRow } from "@/lib/auth";

interface Frame { b: string; c: string; k: string; t: number; p: string; w: string; m: number }
interface ReplayData { game: GameRow & { my_seat: number }; frames: Frame[] }

const NAME: Record<string, string> = { K: "Vua", Q: "Hậu", R: "Xe", B: "Tượng", N: "Mã", P: "Tốt" };
const GLYPH: Record<string, string> = { K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟" };
const sqName = (sq: number) => "abcdefgh"[sq % 8]! + (Math.floor(sq / 8) + 1);
const MODE: Record<string, string> = { bot: "Đấu máy", online: "Online", friend: "Phòng bạn bè" };

/** Frames are whole-state snapshots, so "what happened" is derived by diffing neighbours. */
function diff(prev: Frame | undefined, cur: Frame) {
  if (!prev) return { text: "Bắt đầu ván đấu", from: -1, to: -1 };
  const changed: number[] = [];
  for (let i = 0; i < 64; i++) if (prev.b[i] !== cur.b[i]) changed.push(i);
  const who = prev.t === 0 ? (prev.w === "w" ? "Trắng" : "Đen") : prev.w === "w" ? "Đen" : "Trắng";
  if (cur.p === "over" && changed.length === 0) return { text: `${who} ra khỏi cuộc chơi / hết giờ`, from: -1, to: -1 };
  if (changed.length === 2) {
    const from = changed.find((i) => cur.b[i] === ".");
    const to = changed.find((i) => i !== from);
    if (from !== undefined && to !== undefined) {
      const piece = prev.b[from]!.toUpperCase();
      const cap = prev.b[to] !== "." ? ` ăn ${NAME[prev.b[to]!.toUpperCase()]}` : "";
      return { text: `${who}: ${NAME[piece]} ${sqName(from)}→${sqName(to)}${cap}`, from, to };
    }
  }
  if (changed.length === 1 && prev.b[changed[0]!] === ".") {
    return { text: `${who} hồi sinh ${NAME[cur.b[changed[0]!]!.toUpperCase()]} tại ${sqName(changed[0]!)}`, from: -1, to: changed[0]! };
  }
  if (cur.w !== prev.w) return { text: `${who} lật Reverse — đổi phe`, from: -1, to: -1 };
  if (cur.k !== prev.k) return { text: `${who} lật bài`, from: -1, to: -1 };
  return { text: `${who} chọn số nước`, from: -1, to: -1 };
}

export default function Replay({ gameId }: { gameId: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const [data, setData] = useState<ReplayData | null>(null);
  const [error, setError] = useState("");
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1000);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (user === null) router.replace("/login");
    if (user) api<ReplayData>(`/games/${gameId}`).then((d) => { setData(d); setI(0); }).catch((e) => setError(e.message));
  }, [user, gameId, router]);

  const n = data?.frames.length ?? 0;
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
    listRef.current?.querySelector(".cur")?.scrollIntoView({ block: "nearest" });
  }, [i]);

  const steps = useMemo(() => (data ? data.frames.map((f, k) => diff(data.frames[k - 1], f)) : []), [data]);

  if (error) return (<><Brand /><main className="page"><p className="error">{error}</p><Link href="/stats" className="link">Quay lại thống kê</Link></main></>);
  if (!data) return (<><Brand /><main className="page"><p className="muted">Đang tải…</p></main></>);

  const f = data.frames[i]!;
  const mine = data.game.my_seat;
  const myStart = (mine === 0 ? data.frames[0]!.w : data.frames[0]!.w === "w" ? "b" : "w") as "w" | "b";
  const pieces = f.b.split("").flatMap((ch, sq) =>
    ch === "." ? [] : [{ id: sq, type: ch.toUpperCase(), color: ch === ch.toUpperCase() ? "w" : "b", sq } as unknown as Piece & { sq: number }],
  );
  const cap = (white: boolean) => f.c.split("").filter((ch) => (ch === ch.toUpperCase()) === white);
  const step = steps[i]!;
  const toMove = f.t === 0 ? f.w : f.w === "w" ? "b" : "w";
  const youMove = f.t === mine;

  return (
    <>
      <Brand />
      <main className="arena replay">
        <aside className="wing">
          <section className="panel glass">
            <h3>Ván đấu</h3>
            <div className="stat"><span className="muted">Kết quả</span><b style={{ color: data.game.won ? "var(--green)" : "#ffb4ab" }}>{data.game.won ? "Thắng" : "Thua"}</b></div>
            <div className="stat"><span className="muted">Đối thủ</span><b>{data.game.opponent}</b></div>
            <div className="stat"><span className="muted">Chế độ</span><b>{MODE[data.game.mode] ?? data.game.mode}</b></div>
            <div className="stat"><span className="muted">Thời gian</span><b>{new Date(data.game.played_at).toLocaleString("vi-VN")}</b></div>
            <div className="stat"><span className="muted">Elo</span><b>{data.game.elo_before} → {data.game.elo_after}</b></div>
          </section>
          <section className="panel glass">
            <h3>Quân đã bị ăn</h3>
            <div className="label" style={{ marginBottom: 8 }}>Trắng mất</div>
            <div className="chips">{cap(true).length === 0 ? <span className="muted">—</span> : cap(true).map((c, k) => <span key={k} className="chip"><span className="pc w">{GLYPH[c]}</span>{NAME[c]}</span>)}</div>
            <div className="label" style={{ marginBottom: 8 }}>Đen mất</div>
            <div className="chips" style={{ marginBottom: 0 }}>{cap(false).length === 0 ? <span className="muted">—</span> : cap(false).map((c, k) => <span key={k} className="chip"><span className="pc b">{GLYPH[c.toUpperCase()]}</span>{NAME[c.toUpperCase()]}</span>)}</div>
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
            <button onClick={() => { setPlaying(false); setI(0); }} aria-label="Về đầu">⏮</button>
            <button onClick={() => setI((x) => Math.max(0, x - 1))} aria-label="Lùi">◀</button>
            <button className="gold" onClick={() => { if (i >= n - 1) setI(0); setPlaying((p) => !p); }}>{playing ? "⏸ Dừng" : "▶ Phát"}</button>
            <button onClick={() => setI((x) => Math.min(n - 1, x + 1))} aria-label="Tiến">▶</button>
            <button onClick={() => { setPlaying(false); setI(n - 1); }} aria-label="Về cuối">⏭</button>
            <input type="range" min={0} max={n - 1} value={i} onChange={(e) => { setPlaying(false); setI(Number(e.target.value)); }} aria-label="Tiến độ" />
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Tốc độ">
              <option value={2000}>0.5x</option><option value={1000}>1x</option><option value={500}>2x</option><option value={250}>4x</option>
            </select>
          </div>
          <span className="label">Bước {i + 1}/{n} · ← → để lùi/tiến · Space để phát</span>
        </section>

        <aside className="wing">
          <section className="panel glass">
            <div className="label" style={{ marginBottom: 10 }}>Lá bài vừa lật</div>
            <Card label={f.k} />
            <div className="stat" style={{ marginTop: 12 }}><span className="muted">Đến lượt</span><b>{f.p === "over" ? "Kết thúc" : `${toMove === "w" ? "Trắng" : "Đen"}${youMove ? " (bạn)" : ""}`}</b></div>
            {f.p === "move" && <div className="stat"><span className="muted">Còn nước đi</span><b>{f.m}</b></div>}
          </section>
          <section className="panel glass">
            <h3>Diễn biến</h3>
            <ol className="steps" ref={listRef}>
              {steps.map((s, k) => (
                <li key={k} className={k === i ? "cur" : ""}><button onClick={() => { setPlaying(false); setI(k); }}>{k}. {s.text}</button></li>
              ))}
            </ol>
          </section>
        </aside>
      </main>
    </>
  );
}
