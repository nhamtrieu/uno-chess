"use client";

import { useCallback, useEffect, useState } from "react";

export interface User { id: string; username: string; elo: number; games: number; wins: number; created_at: number }
export interface GameRow { id: string; opponent: string; opponent_elo: number; mode: string; won: number; elo_before: number; elo_after: number; played_at: number; has_replay?: number }
export interface Stats { user: User; recent: GameRow[]; byMode: { mode: string; games: number; wins: number }[]; peak: number; rank: number }

const TOKEN_KEY = "uno-chess:auth";

export const apiUrl = () =>
  process.env.NEXT_PUBLIC_API_URL ??
  `http://${typeof window === "undefined" ? "localhost" : window.location.hostname}:2567`;

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY) ?? undefined; } catch { return undefined; }
};
const setToken = (t?: string) => {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {}
  window.dispatchEvent(new Event("uno-chess:auth"));
};

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const token = getToken();
  const res = await fetch(`${apiUrl()}/api${path}`, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? "Lỗi kết nối"), { status: res.status });
  return data as T;
}

/** `user` is undefined while loading, null when logged out. */
export function useAuth() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    if (!getToken()) return setUser(null);
    try {
      setUser((await api<{ user: User }>("/me")).user);
    } catch (e: any) {
      if (e.status === 401) setToken(undefined);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const on = () => void refresh();
    window.addEventListener("uno-chess:auth", on);
    return () => window.removeEventListener("uno-chess:auth", on);
  }, [refresh]);

  const submit = async (kind: "login" | "register", username: string, password: string) => {
    const r = await api<{ token: string; user: User }>(`/${kind}`, { body: { username, password } });
    setToken(r.token);
    setUser(r.user);
  };
  const google = async (credential: string) => {
    const r = await api<{ token: string; user: User }>("/google", { body: { credential } });
    setToken(r.token);
    setUser(r.user);
  };
  const logout = () => { setToken(undefined); setUser(null); };

  return { user, refresh, google, login: (u: string, p: string) => submit("login", u, p), register: (u: string, p: string) => submit("register", u, p), logout };
}
