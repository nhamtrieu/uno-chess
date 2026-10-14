import { TIME_CATEGORIES, TIME_CONTROLS_BY_CATEGORY, tcCategory, type TimeCategory } from "@uno-chess/core";

const ICONS: Record<TimeCategory, string> = { bullet: "🚀", blitz: "⚡", rapid: "⏱" };
export const TIME_GROUPS = TIME_CATEGORIES.map((id) => ({ id, icon: ICONS[id], items: TIME_CONTROLS_BY_CATEGORY[id] }));

export interface ClassicOptions { tc: string; rated: boolean }
export const DEFAULT_OPTIONS: ClassicOptions = { tc: "10+0", rated: true };

const KEY = "uno-chess:classicOptions";

/** "5+0" -> "5 min", "3+2" -> "3 + 2" (the way lichess / chess.com label them). */
export const tcLabel = (tc: string) => {
  const [m, i] = tc.split("+");
  return i === "0" ? `${m} min` : `${m} + ${i}`;
};

export const groupOf = tcCategory;

export function loadOptions(): ClassicOptions {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    const valid = TIME_GROUPS.some((g) => (g.items as readonly string[]).includes(o.tc));
    return { tc: valid ? o.tc : DEFAULT_OPTIONS.tc, rated: o.rated !== false };
  } catch {
    return DEFAULT_OPTIONS;
  }
}
export function saveOptions(o: ClassicOptions) {
  try { localStorage.setItem(KEY, JSON.stringify(o)); } catch {}
}

/** Query string carried by a classic-chess link, so the room page knows what to create/join. */
export const optionsQuery = (o: ClassicOptions) => `?tc=${encodeURIComponent(o.tc)}&rated=${o.rated ? 1 : 0}`;

export function optionsFromSearch(search: string): ClassicOptions {
  const q = new URLSearchParams(search);
  const tc = q.get("tc") ?? DEFAULT_OPTIONS.tc;
  const valid = TIME_GROUPS.some((g) => (g.items as readonly string[]).includes(tc));
  return { tc: valid ? tc : DEFAULT_OPTIONS.tc, rated: q.get("rated") !== "0" };
}
