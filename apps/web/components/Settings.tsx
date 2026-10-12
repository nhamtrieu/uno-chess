"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { tier, useProfile, type BoardTheme } from "@/lib/profile";

const THEMES: { id: BoardTheme; label: string }[] = [
  { id: "wood", label: "Gỗ" },
  { id: "green", label: "Xanh lá" },
  { id: "slate", label: "Đá phiến" },
];

/** Elo badge + settings button for the top bar; the settings modal lives here too. */
export default function ProfileBar() {
  const { profile, update } = useProfile();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const elo = user ? user.elo : profile.elo;

  return (
    <>
      <div className="elo-badge">
        <span className="label" style={{ color: "var(--gold)" }}>{tier(elo)}</span>
        <b>Elo: {elo}</b>
      </div>
      {user === null && <Link href="/login" className="btn-link">Đăng nhập</Link>}
      {user && <Link href="/account" className="btn-link">{user.username}</Link>}
      <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Cài đặt" title="Cài đặt">⚙</button>

      {open && (
        <div className="modal-back" onClick={() => setOpen(false)}>
          <div className="modal glass" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Cài đặt">
            <h2>Cài đặt</h2>

            <label className="field">
              <span className="label">Tên hiển thị</span>
              <input value={profile.name} maxLength={20} onChange={(e) => update({ name: e.target.value })} />
            </label>

            <div className="field">
              <span className="label">Giao diện bàn cờ</span>
              <div className="seg">
                {THEMES.map((t) => (
                  <button key={t.id} className={profile.theme === t.id ? "on" : ""} onClick={() => update({ theme: t.id })}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="toggle">
              <span>Âm thanh</span>
              <input type="checkbox" checked={profile.sound} onChange={(e) => update({ sound: e.target.checked })} />
            </label>
            <label className="toggle">
              <span>Gợi ý nước đi</span>
              <input type="checkbox" checked={profile.hints} onChange={(e) => update({ hints: e.target.checked })} />
            </label>

            {!user && (
              <>
                <div className="stat"><span className="muted">Số ván (khách)</span><b>{profile.games}</b></div>
                <div className="stat"><span className="muted">Thắng (khách)</span><b>{profile.wins}</b></div>
                <p className="muted" style={{ fontSize: 12 }}>
                  Bạn đang chơi như khách: Elo chỉ lưu trên trình duyệt này. <Link href="/register" className="link">Đăng ký</Link> để lưu Elo và thống kê.
                </p>
              </>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
              {user ? <span /> : (
                <button className="danger" onClick={() => confirm("Đặt lại Elo về 1200?") && update({ elo: 1200, games: 0, wins: 0 })}>
                  Đặt lại Elo
                </button>
              )}
              <button className="primary" onClick={() => setOpen(false)}>Xong</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
