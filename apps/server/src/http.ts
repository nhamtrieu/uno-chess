import { createEndpoint, createRouter } from "@colyseus/core";
import { leaderboard, login, replayFor, loginWithGoogle, verifyGoogleToken, register, signToken, statsFor, verifyToken } from "./accounts";

const authed = async (headers?: Headers) => verifyToken(headers?.get("authorization")?.replace(/^Bearer /, ""));

const credentials = async (ctx: any, kind: "login" | "register") => {
  const { username, password } = (ctx.body ?? {}) as { username?: string; password?: string };
  const r = await (kind === "register" ? register(username as string, password as string) : login(username as string, password as string));
  if (!r.ok) throw ctx.error(400, { error: r.error });
  return { token: signToken(r.value.id), user: r.value };
};

const unauthorized = (ctx: any) => ctx.error(401, { error: "Chưa đăng nhập" });

export const apiRoutes = createRouter(
  {
    register: createEndpoint("/api/register", { method: "POST" }, async (ctx) => credentials(ctx, "register")),
    login: createEndpoint("/api/login", { method: "POST" }, async (ctx) => credentials(ctx, "login")),
    google: createEndpoint("/api/google", { method: "POST" }, async (ctx) => {
      const { credential } = (ctx.body ?? {}) as { credential?: string };
      const v = await verifyGoogleToken(String(credential ?? ""));
      if (!v.ok) throw ctx.error(400, { error: v.error });
      const user = await loginWithGoogle(v.value);
      return { token: signToken(user.id), user };
    }),
    me: createEndpoint("/api/me", { method: "GET" }, async (ctx) => {
      const user = await authed(ctx.request?.headers);
      if (!user) throw unauthorized(ctx);
      return { user };
    }),
    stats: createEndpoint("/api/stats", { method: "GET" }, async (ctx) => {
      const user = await authed(ctx.request?.headers);
      if (!user) throw unauthorized(ctx);
      return statsFor(user.id);
    }),
    replay: createEndpoint("/api/games/:id", { method: "GET" }, async (ctx) => {
      const user = await authed(ctx.request?.headers);
      if (!user) throw unauthorized(ctx);
      const r = await replayFor(user.id, String(ctx.params.id));
      if (!r) throw ctx.error(404, { error: "Không tìm thấy ván đấu" });
      return r;
    }),
    leaderboard: createEndpoint("/api/leaderboard", { method: "GET" }, async () => ({ players: await leaderboard() })),
  },
  { openapi: { disabled: true } },
);
