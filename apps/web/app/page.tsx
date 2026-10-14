"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { initialBoard, type Piece } from "@uno-chess/core";
import Board from "@/components/Board";
import Brand from "@/components/Brand";
import TimePicker from "@/components/TimePicker";
import { newTicket } from "@/lib/colyseus";
import { useT } from "@/lib/i18n";
import { useElo } from "@/lib/profile";
import { groupOf, DEFAULT_OPTIONS, loadOptions, optionsQuery, saveOptions, type ClassicOptions } from "@/lib/timeControl";

const RULES = [
  { id: "number", card: "5", color: "red" },
  { id: "revive", card: "+2", color: "green" },
  { id: "reverse", card: "⇄", color: "blue" },
  { id: "skip", card: "⊘", color: "yellow" },
] as const;

export default function Home() {
  const { t } = useT();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"uno" | "classic">("uno");
  const [opts, setOpts] = useState<ClassicOptions>(DEFAULT_OPTIONS);
  useEffect(() => setOpts(loadOptions()), []);
  // each mode has its own rating; classic chess keeps one per time-control category
  const pool = kind === "classic" ? groupOf(opts.tc) : "uno";
  const myElo = useElo(pool);
  const base = kind === "classic" ? "/classic" : "/room";
  const change = (o: ClassicOptions) => { setOpts(o); saveOptions(o); };
  // classic links carry the chosen time control; the room page reads it to create or matchmake
  const go = (mode: "online" | "bot" | "new") => router.push(`${base}/${newTicket(mode)}${kind === "classic" ? optionsQuery(opts) : ""}`);

  const pieces = useMemo(
    () => initialBoard().flatMap((p, sq) => (p ? [{ ...p, sq } as Piece & { sq: number }] : [])),
    [],
  );

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const link = code.trim();
    const id = link.split("/").pop(); // accepts a pasted invite link too
    // an invite link says which game it is for; a bare code uses the selected mode
    if (id) router.push(`${link.includes("/classic/") ? "/classic" : link.includes("/room/") ? "/room" : base}/${id}`);
  };

  return (
    <>
      <Brand />
      <main className="home">
        <section className="hero">
          <div className="hero-art">
            <div className="hero-board plinth" aria-hidden="true">
              <Board pieces={pieces} perspective="w" selected={1} targets={[16, 18]} activeSq={-1} onSquare={() => {}} />
            </div>
            <div className="float-card red">3</div>
            <div className="float-card wild">+4</div>
            <div className="hero-copy">
              <div><span className="pill red">{t("home.tag1")}</span> <span className="pill">{t("home.tag2")}</span></div>
              <h1>{t("home.heroTitle")} <em>Checkmate &amp; Draw Four</em></h1>
              <p className="lead">{t("home.heroLead")}</p>
            </div>
          </div>

          <div className="menu glass">
            <span className="label" style={{ color: "var(--gold)" }}>{t("home.console")}</span>
            <h2>{t("home.start")}</h2>
            <div className="seg2" role="tablist">
              <button role="tab" aria-selected={kind === "uno"} className={kind === "uno" ? "on" : ""} onClick={() => setKind("uno")}>{t("home.modeUno")}</button>
              <button role="tab" aria-selected={kind === "classic"} className={kind === "classic" ? "on" : ""} onClick={() => setKind("classic")}>{t("home.modeClassic")}</button>
            </div>
            <div className="stat" style={{ margin: 0 }}>
              <span className="muted">{t("home.eloOf", { mode: pool === "uno" ? t("home.modeUno") : t(`classic.${pool}`) })}</span><b>{myElo}</b>
            </div>
            {kind === "classic" && (
              <>
                <p className="muted" style={{ margin: 0, fontSize: 12 }}>{t("home.classicNote")}</p>
                <TimePicker value={opts} onChange={change} />
              </>
            )}
            <button className="mode" onClick={() => go("online")}>
              <span className="mode-icon">🏆</span>
              <span><strong>{t("home.online")}</strong><small>{t("home.onlineDesc")}</small></span>
            </button>
            <button className="mode" onClick={() => go("bot")}>
              <span className="mode-icon">🤖</span>
              <span><strong>{t("home.bot")}</strong><small>{t("home.botDesc")}</small></span>
            </button>
            <button className="mode" onClick={() => go("new")}>
              <span className="mode-icon">🔗</span>
              <span><strong>{t("home.custom")}</strong><small>{t("home.customDesc")}</small></span>
            </button>
            <form className="join" onSubmit={join}>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("home.joinPlaceholder")} aria-label={t("home.roomCode")} />
              <button type="submit" className="gold" disabled={!code.trim()}>{t("home.join")}</button>
            </form>
          </div>
        </section>

        <section className="rules">
          <span className="label" style={{ color: "var(--gold)" }}>{t("home.rulesTag")}</span>
          <h2>{t("home.rulesTitle")}</h2>
          <div className="rule-grid">
            {RULES.map((r) => (
              <div className="rule" key={r.id}>
                <span className="pill gold" style={{ justifySelf: "start", alignSelf: "start" }}>{t(`rule.${r.id}.tag`)}</span>
                <div className="rule-art"><div className={`card ${r.color}`}><b>{r.card}</b></div></div>
                <h3>{t(`rule.${r.id}.title`)}</h3>
                <p>{t(`rule.${r.id}.text`)}</p>
              </div>
            ))}
          </div>
          <p className="muted">{t("home.rulesNote")}</p>
        </section>
      </main>
      <footer className="foot"><span><b>Grandmaster Gambit</b> v1.0</span><span>Chess × Uno Tactical</span></footer>
    </>
  );
}
