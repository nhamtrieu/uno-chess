"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Brand from "./Brand";
import EloChart from "./EloChart";
import { api, useAuth, type Stats, type Variant } from "@/lib/auth";
import { tier } from "@/lib/profile";
import { useT, type Key } from "@/lib/i18n";
import { tcLabel } from "@/lib/timeControl";

const pct = (w: number, g: number) => (g ? `${Math.round((w / g) * 100)}%` : "—");

export default function AccountPage({ view }: { view: "account" | "stats" }) {
  const { t, lang } = useT();
  const locale = lang === "vi" ? "vi-VN" : "en-US";
  const mode = (m: string) => (`mode.${m}` in { "mode.bot": 1, "mode.online": 1, "mode.friend": 1 } ? t(`mode.${m}` as Key) : m);
  const router = useRouter();
  const { user, logout } = useAuth();
  const [variant, setVariant] = useState<Variant>("uno");
  const [stats, setStats] = useState<Stats | null>(null);
  const [board, setBoard] = useState<{ username: string; elo: number; games: number; wins: number }[]>([]);

  useEffect(() => {
    if (user === null) router.replace("/login");
    if (user) api<Stats>(`/stats?variant=${variant}`).then(setStats).catch(() => {});
  }, [user, router, variant]);
  useEffect(() => {
    if (view === "stats") api<{ players: typeof board }>(`/leaderboard?variant=${variant}`).then((r) => setBoard(r.players)).catch(() => {});
  }, [view, variant]);

  if (!user || !stats) return (<><Brand /><main className="page"><p className="muted">{t("common.loading")}</p></main></>);

  const u = stats.user;
  const losses = Math.max(0, u.games - u.wins - stats.draws);
  const joined = new Date(u.created_at).toLocaleDateString(locale);

  return (
    <>
      <Brand />
      <main className="page">
        <nav className="tabs">
          <Link href="/account" className={view === "account" ? "on" : ""}>{t("acct.tabAccount")}</Link>
          <Link href="/stats" className={view === "stats" ? "on" : ""}>{t("acct.tabStats")}</Link>
        </nav>

        <div className="seg2" style={{ maxWidth: 520 }} role="tablist">
          {(["uno", "bullet", "blitz", "rapid"] as const).map((v) => (
            <button key={v} role="tab" aria-selected={variant === v} className={variant === v ? "on" : ""} onClick={() => setVariant(v)}>
              {v === "uno" ? t("stats.variantUno") : t(`classic.${v}`)}
            </button>
          ))}
        </div>

        <section className="profile glass">
          <div className="avatar big">{u.username[0]?.toUpperCase()}</div>
          <div style={{ flex: 1 }}>
            <h1>{u.username}</h1>
            <span className="label">{t("acct.joined", { date: joined })} · {t("acct.rank", { n: stats.rank })}</span>
          </div>
          <div className="elo-big"><span className="label" style={{ color: "var(--gold)" }}>{t(`tier.${tier(u.elo)}` as Key)}</span><b>{u.elo}</b></div>
        </section>

        <section className="kpis">
          <div className="kpi glass"><span className="label">{t("acct.games")}</span><b>{u.games}</b></div>
          <div className="kpi glass"><span className="label">{t("acct.wins")}</span><b style={{ color: "var(--green)" }}>{u.wins}</b></div>
          <div className="kpi glass"><span className="label">{t("acct.losses")}</span><b style={{ color: "#ffb4ab" }}>{losses}</b></div>
          <div className="kpi glass"><span className="label">{t("acct.winrate")}</span><b>{pct(u.wins, u.games)}</b></div>
          <div className="kpi glass"><span className="label">{t("acct.peak")}</span><b>{stats.peak}</b></div>
        </section>

        {view === "account" ? (
          <section className="glass panel">
            <h3>{t("acct.tabAccount")}</h3>
            <div className="stat"><span className="muted">{t("acct.username")}</span><b>{u.username}</b></div>
            <div className="stat"><span className="muted">{t("acct.joinDate")}</span><b>{joined}</b></div>
            <div className="stat"><span className="muted">{t("acct.currentElo")}</span><b>{u.elo}</b></div>
            <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
              <Link href="/"><button className="gold">{t("acct.play")}</button></Link>
              <button className="danger" onClick={() => { logout(); router.push("/"); }}>{t("acct.logout")}</button>
            </div>
          </section>
        ) : (
          <>
            <section className="glass panel">
              <h3>{t("stats.eloChart")}</h3>
              <EloChart games={stats.recent} start={stats.recent.length ? stats.recent[stats.recent.length - 1]!.elo_before : u.elo} />
            </section>

            <div className="two">
              <section className="glass panel">
                <h3>{t("stats.byMode")}</h3>
                {stats.byMode.length === 0 && <p className="muted">{t("stats.noGames")}</p>}
                {stats.byMode.map((m) => (
                  <div className="stat" key={m.mode}>
                    <span>{mode(m.mode)}</span>
                    <b>{m.wins}/{m.games} · {pct(m.wins, m.games)}</b>
                  </div>
                ))}
              </section>
              <section className="glass panel">
                <h3>{t("stats.leaderboard")}</h3>
                {board.map((p, i) => (
                  <div className={`stat ${p.username === u.username ? "me" : ""}`} key={p.username}>
                    <span>#{i + 1} {p.username}</span><b>{p.elo}</b>
                  </div>
                ))}
              </section>
            </div>

            <section className="glass panel">
              <h3>{t("stats.recent")}</h3>
              {stats.recent.length === 0 && <p className="muted">{t("stats.noGames")}</p>}
              <div className="history">
                {stats.recent.map((g) => (
                  <div className="row" key={g.id}>
                    <span className={`pill ${g.draw ? "gold" : g.won ? "" : "red"}`}>{g.draw ? t("classic.draw") : g.won ? t("common.yes") : t("common.lose")}</span>
                    <span>{g.opponent} <span className="muted">({g.opponent_elo})</span></span>
                    <span className="muted">{mode(g.mode)}{g.tc ? ` · ${tcLabel(g.tc)}` : ""}{g.rated === 0 ? ` · ${t("classic.casual")}` : ""}</span>
                    <span className={`elo-delta ${g.elo_after >= g.elo_before ? "up" : "down"}`}>
                      {g.elo_after >= g.elo_before ? "+" : ""}{g.elo_after - g.elo_before}
                    </span>
                    <span className="muted">{new Date(g.played_at).toLocaleString(locale)}</span>
                    {g.has_replay ? <Link href={`/replay/${g.id}`} className="link">{t("stats.watch")}</Link> : <span />}
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
