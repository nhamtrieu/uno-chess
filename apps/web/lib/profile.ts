"use client";

import { useCallback, useEffect, useState } from "react";
import type { TimeCategory } from "@uno-chess/core";
import { useAuth } from "./auth";

export type BoardTheme = "wood" | "green" | "slate";
export type ColorMode = "system" | "dark" | "light";
export interface Profile {
  name: string;
  elo: number;
  games: number;
  wins: number;
  /** Guest ratings for classic chess per time-control category (accounts have theirs on the server). */
  ratings: Record<TimeCategory, { elo: number; games: number; wins: number }>;
  sound: boolean;
  hints: boolean;
  theme: BoardTheme;
  mode: ColorMode;
}

const KEY = "uno-chess:profile";
export const freshRatings = (): Profile["ratings"] => ({
  bullet: { elo: 1200, games: 0, wins: 0 },
  blitz: { elo: 1200, games: 0, wins: 0 },
  rapid: { elo: 1200, games: 0, wins: 0 },
});

const DEFAULT: Profile = { name: "Kỳ thủ", elo: 1200, games: 0, wins: 0, ratings: freshRatings(), sound: true, hints: true, theme: "wood", mode: "system" };

export const BOT_ELO = 1500;
const K = 32;

function read(): Profile {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { ...DEFAULT, ...saved, ratings: { ...freshRatings(), ...(saved.ratings ?? {}) } };
  } catch {
    return DEFAULT;
  }
}

/** `score` is 1 for a win, 0.5 for a draw, 0 for a loss. */
export function eloAfter(elo: number, oppElo: number, score: number): number {
  const expected = 1 / (1 + 10 ** ((oppElo - elo) / 400));
  return Math.max(100, Math.round(elo + K * (score - expected)));
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
  const [resolved, setResolved] = useState<"dark" | "light">("dark"); // what "system" currently means

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

  // Resolve "system" to dark/light and follow the OS setting while it is selected.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      const m = profile.mode === "system" ? (mq.matches ? "light" : "dark") : profile.mode;
      document.documentElement.dataset.mode = m;
      setResolved(m);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [profile.mode]);

  const update = useCallback((patch: Partial<Profile> | ((p: Profile) => Partial<Profile>)) => {
    const cur = read();
    const next = { ...cur, ...(typeof patch === "function" ? patch(cur) : patch) };
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
    setProfile(next);
    window.dispatchEvent(new Event("uno-chess:profile"));
  }, []);

  return { profile, update, resolved };
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

/** A rating pool: Uno-Chess or a classic time-control category. */
export type RatingKey = "uno" | TimeCategory;

/** The player's rating in one pool: the account's if logged in, else the guest rating kept in this browser. */
export function useElo(key: RatingKey): number {
  const { profile } = useProfile();
  const { user } = useAuth();
  if (key === "uno") return user ? user.elo : profile.elo;
  return (user ? user.ratings : profile.ratings)[key].elo;
}
