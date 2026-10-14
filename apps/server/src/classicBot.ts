import { Worker } from "node:worker_threads";
import { classicBotMove, type BotOptions } from "@uno-chess/core";

export type BotMove = { from: string; to: string; promotion?: string } | null;

interface Pending { resolve: (m: BotMove) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }

let worker: Worker | undefined;
let nextId = 1;
const pending = new Map<number, Pending>();

function spawn(): Worker {
  // tsx lets the worker load the TypeScript sources of this package and of @uno-chess/core
  const w = new Worker(new URL("./botWorker.ts", import.meta.url), { execArgv: ["--import", "tsx"] });
  w.on("message", (r: { id: number; move?: BotMove; error?: string }) => {
    const p = pending.get(r.id);
    if (!p) return;
    pending.delete(r.id);
    clearTimeout(p.timer);
    r.error ? p.reject(new Error(r.error)) : p.resolve(r.move ?? null);
  });
  const fail = (e: Error) => {
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(e); }
    pending.clear();
    worker = undefined; // the next request starts a fresh worker
  };
  w.on("error", fail);
  w.on("exit", (code) => fail(new Error(`bot worker exited (${code})`)));
  w.unref(); // an idle bot must not keep the server process alive
  return w;
}

/**
 * Asks the bot for a move without blocking the event loop. If the worker is unavailable or too slow,
 * falls back to a short search on the main thread so the game never gets stuck.
 */
export async function chooseBotMove(fen: string, opts: BotOptions = {}): Promise<BotMove> {
  const budget = (opts.timeMs ?? 1500) + 3000; // search time plus slack for the worker to start
  try {
    worker ??= spawn();
    const id = nextId++;
    return await new Promise<BotMove>((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error("bot timeout")); }, budget);
      pending.set(id, { resolve, reject, timer });
      worker!.postMessage({ id, fen, opts });
    });
  } catch (e) {
    console.error("bot worker failed, searching on the main thread:", e);
    return classicBotMove(fen, Math.random, { depth: 2, timeMs: 300 });
  }
}
