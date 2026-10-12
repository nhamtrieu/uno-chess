import { defineConfig } from "vitest/config";

// Colyseus tooling calls process.send() (pm2 channel), which breaks vitest's default
// child-process pool; worker threads have no IPC channel so it is a no-op there.
// Test files each boot a server on the same default port, so run files one at a time.
export default defineConfig({ test: { pool: "threads", fileParallelism: false } });
