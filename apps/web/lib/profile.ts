"use client";

import { useCallback, useEffect, useState } from "react";

export type BoardTheme = "wood" | "green" | "slate";
export interface Profile {
  name: string;
  elo: number;
  games: number;
  wins: number;
  sound: boolean;
  hints: boolean;
  theme: BoardTheme;
}

const KEY = "uno-chess:profile";
const DEFAULT: Profile = { name: "Kỳ thủ", elo: 1200, games: 0, wins: 0, sound: true, hints: true, theme: "wood" };

export const BOT_ELO = 1500;
const K = 32;

function read(): Profile {
  try {
    return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULT;
  }
}

export function eloAfter(elo: number, oppElo: number, won: boolean): number {
  const expected = 1 / (1 + 10 ** ((oppElo - elo) / 400));
  return Math.max(100, Math.round(elo + K * ((won ? 1 : 0) - expected)));
}

export function tier(elo: number): string {
  if (elo >= 1800) return "Grandmaster";
  if (elo >= 1500) return "Master";
  if (elo >= 1200) return "Expert";
  return "Novice";
}

/** Profile persisted in localStorage (Elo is local to this browser — there are no accounts). */
export function useProfile() {
  const [profile, setProfile] = useState<Profile>(DEFAULT);

  useEffect(() => {
    setProfile(read());
    const sync = (e: StorageEvent) => e.key === KEY && setProfile(read());
    window.addEventListener("storage", sync);
    window.addEventListener("uno-chess:profile", sync as never);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("uno-chess:profile", sync as never);
    };
  }, []);

  useEffect(() => {
    document.body.dataset.theme = profile.theme;
  }, [profile.theme]);

  const update = useCallback((patch: Partial<Profile> | ((p: Profile) => Partial<Profile>)) => {
    const cur = read();
    const next = { ...cur, ...(typeof patch === "function" ? patch(cur) : patch) };
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
    setProfile(next);
    window.dispatchEvent(new Event("uno-chess:profile"));
  }, []);

  return { profile, update };
}

let ctx: AudioContext | null = null;
export function beep(freq = 440, ms = 90) {
  try {
    ctx ??= new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = freq;
    g.gain.value = 0.06;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + ms / 1000);
  } catch {}
}
