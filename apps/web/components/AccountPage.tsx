"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Brand from "./Brand";
import EloChart from "./EloChart";
import { api, useAuth, type Stats } from "@/lib/auth";
import { tier } from "@/lib/profile";

const MODE: Record<string, string> = { bot: "Đấu máy", online: "Online", friend: "Phòng bạn bè" };
const pct = (w: number, g: number) => (g ? `${Math.round((w / g) * 100)}%` : "—");

export default function AccountPage({ view }: { view: "account" | "stats" }) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [board, setBoard] = useState<{ username: string; elo: number; games: number; wins: number }[]>([]);

  useEffect(() => {
    if (user === null) router.replace("/login");
    if (user) api<Stats>("/stats").then(setStats).catch(() => {});
  }, [user, router]);
  useEffect(() => {
    if (view === "stats") api<{ players: typeof board }>("/leaderboard").then((r) => setBoard(r.players)).catch(() => {});
  }, [view]);

  if (!user || !stats) return (<><Brand /><main className="page"><p className="muted">Đang tải…</p></main></>);

  const u = stats.user;
  const losses = u.games - u.wins;
  const joined = new Date(u.created_at).toLocaleDateString("vi-VN");

  return (
    <>
      <Brand />
      <main className="page">
        <nav className="tabs">
          <Link href="/account" className={view === "account" ? "on" : ""}>Tài khoản</Link>
          <Link href="/stats" className={view === "stats" ? "on" : ""}>Thống kê</Link>
        </nav>

        <section className="profile glass">
          <div className="avatar big">{u.username[0]?.toUpperCase()}</div>
          <div style={{ flex: 1 }}>
            <h1>{u.username}</h1>
            <span className="label">Tham gia {joined} · Hạng #{stats.rank}</span>
          </div>
          <div className="elo-big"><span className="label" style={{ color: "var(--gold)" }}>{tier(u.elo)}</span><b>{u.elo}</b></div>
        </section>

        <section className="kpis">
          <div className="kpi glass"><span className="label">Số ván</span><b>{u.games}</b></div>
          <div className="kpi glass"><span className="label">Thắng</span><b style={{ color: "var(--green)" }}>{u.wins}</b></div>
          <div className="kpi glass"><span className="label">Thua</span><b style={{ color: "#ffb4ab" }}>{losses}</b></div>
          <div className="kpi glass"><span className="label">Tỉ lệ thắng</span><b>{pct(u.wins, u.games)}</b></div>
          <div className="kpi glass"><span className="label">Elo cao nhất</span><b>{stats.peak}</b></div>
        </section>

        {view === "account" ? (
          <section className="glass panel">
            <h3>Tài khoản</h3>
            <div className="stat"><span className="muted">Tên đăng nhập</span><b>{u.username}</b></div>
            <div className="stat"><span className="muted">Ngày tham gia</span><b>{joined}</b></div>
            <div className="stat"><span className="muted">Elo hiện tại</span><b>{u.elo}</b></div>
            <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
              <Link href="/"><button className="gold">Vào chơi</button></Link>
              <button className="danger" onClick={() => { logout(); router.push("/"); }}>Đăng xuất</button>
            </div>
          </section>
        ) : (
          <>
            <section className="glass panel">
              <h3>Biến động Elo</h3>
              <EloChart games={stats.recent} start={stats.recent.length ? stats.recent[stats.recent.length - 1]!.elo_before : u.elo} />
            </section>

            <div className="two">
              <section className="glass panel">
                <h3>Theo chế độ</h3>
                {stats.byMode.length === 0 && <p className="muted">Chưa có ván nào.</p>}
                {stats.byMode.map((m) => (
                  <div className="stat" key={m.mode}>
                    <span>{MODE[m.mode] ?? m.mode}</span>
                    <b>{m.wins}/{m.games} · {pct(m.wins, m.games)}</b>
                  </div>
                ))}
              </section>
              <section className="glass panel">
                <h3>Bảng xếp hạng</h3>
                {board.map((p, i) => (
                  <div className={`stat ${p.username === u.username ? "me" : ""}`} key={p.username}>
                    <span>#{i + 1} {p.username}</span><b>{p.elo}</b>
                  </div>
                ))}
              </section>
            </div>

            <section className="glass panel">
              <h3>Ván gần đây</h3>
              {stats.recent.length === 0 && <p className="muted">Chưa có ván nào.</p>}
              <div className="history">
                {stats.recent.map((g) => (
                  <div className="row" key={g.id}>
                    <span className={`pill ${g.won ? "" : "red"}`}>{g.won ? "Thắng" : "Thua"}</span>
                    <span>{g.opponent} <span className="muted">({g.opponent_elo})</span></span>
                    <span className="muted">{MODE[g.mode] ?? g.mode}</span>
                    <span className={`elo-delta ${g.elo_after >= g.elo_before ? "up" : "down"}`}>
                      {g.elo_after >= g.elo_before ? "+" : ""}{g.elo_after - g.elo_before}
                    </span>
                    <span className="muted">{new Date(g.played_at).toLocaleString("vi-VN")}</span>
                    {g.has_replay ? <Link href={`/replay/${g.id}`} className="link">Xem lại</Link> : <span />}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}
