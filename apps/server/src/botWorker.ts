import { parentPort } from "node:worker_threads";
import { classicBotMove, type BotOptions } from "@uno-chess/core";

// Runs the chess search off the main thread, so a thinking bot never stalls the other rooms' clocks.
parentPort!.on("message", (job: { id: number; fen: string; opts: BotOptions }) => {
  try {
    parentPort!.postMessage({ id: job.id, move: classicBotMove(job.fen, Math.random, job.opts) });
  } catch (e) {
    parentPort!.postMessage({ id: job.id, error: String(e) });
  }
});
