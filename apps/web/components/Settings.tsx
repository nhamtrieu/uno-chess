"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { freshRatings, useProfile, type BoardTheme, type ColorMode } from "@/lib/profile";
import { LANGS, useT, type Key } from "@/lib/i18n";

const THEMES: BoardTheme[] = ["wood", "green", "slate"];
const MODES: ColorMode[] = ["system", "dark", "light"];

/** Elo badge + settings button for the top bar; the settings modal lives here too. */
export default function ProfileBar() {
  const { t, lang, setLang } = useT();
  const { profile, update, resolved } = useProfile();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <>
      {user === null && <Link href="/login" className="btn-link">{t("common.login")}</Link>}
      {user && <Link href="/account" className="btn-link">{user.username}</Link>}
      <button
        className="icon-btn mode-toggle"
        onClick={() => update({ mode: resolved === "light" ? "dark" : "light" })}
        aria-label={t("settings.toggleMode")}
        title={t("settings.toggleMode")}
      >
        {resolved === "light" ? "☀" : "☾"}
      </button>
      <button className="icon-btn" onClick={() => setOpen(true)} aria-label={t("settings.open")} title={t("settings.open")}>⚙</button>

      {open && (
        <div className="modal-back" onClick={() => setOpen(false)}>
          <div className="modal glass" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t("settings.title")}>
            <h2>{t("settings.title")}</h2>

            <div className="field">
              <span className="label">{t("settings.language")}</span>
              <div className="seg">
                {LANGS.map((l) => (
                  <button key={l.id} className={lang === l.id ? "on" : ""} onClick={() => setLang(l.id)}>{l.label}</button>
                ))}
              </div>
            </div>

            <label className="field">
              <span className="label">{t("settings.name")}</span>
              <input value={profile.name} maxLength={20} onChange={(e) => update({ name: e.target.value })} />
            </label>

            <div className="field">
              <span className="label">{t("settings.mode")}</span>
              <div className="seg">
                {MODES.map((m) => (
                  <button key={m} className={profile.mode === m ? "on" : ""} onClick={() => update({ mode: m })}>
                    {t(`settings.mode.${m}` as Key)}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <span className="label">{t("settings.theme")}</span>
              <div className="seg">
                {THEMES.map((id) => (
                  <button key={id} className={profile.theme === id ? "on" : ""} onClick={() => update({ theme: id })}>
                    {t(`settings.theme.${id}` as Key)}
                  </button>
                ))}
              </div>
            </div>

            <label className="toggle">
              <span>{t("settings.sound")}</span>
              <input type="checkbox" checked={profile.sound} onChange={(e) => update({ sound: e.target.checked })} />
            </label>
            <label className="toggle">
              <span>{t("settings.hints")}</span>
              <input type="checkbox" checked={profile.hints} onChange={(e) => update({ hints: e.target.checked })} />
            </label>

            {!user && (
              <>
                <div className="stat"><span className="muted">{t("settings.guestGames")}</span><b>{profile.games}</b></div>
                <div className="stat"><span className="muted">{t("settings.guestWins")}</span><b>{profile.wins}</b></div>
                <p className="muted" style={{ fontSize: 12 }}>
                  {t("settings.guestNote")} <Link href="/register" className="link">{t("common.register")}</Link> {t("settings.guestNote2")}
                </p>
              </>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
              {user ? <span /> : (
                <button className="danger" onClick={() => confirm(t("settings.resetConfirm")) && update({ elo: 1200, games: 0, wins: 0, ratings: freshRatings() })}>
                  {t("settings.resetElo")}
                </button>
              )}
              <button className="primary" onClick={() => setOpen(false)}>{t("common.done")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
