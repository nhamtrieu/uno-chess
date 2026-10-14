"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Brand from "./Brand";
import GoogleButton from "./GoogleButton";
import { useAuth } from "@/lib/auth";
import { apiError, useT } from "@/lib/i18n";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { t } = useT();
  const router = useRouter();
  const { login, register, google } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isReg = mode === "register";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (isReg && password !== confirm) return setError(t("auth.mismatch"));
    setBusy(true);
    try {
      await (isReg ? register : login)(username, password);
      router.push("/account");
    } catch (err: any) {
      setError(apiError(t, err, "auth.somethingWrong"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Brand />
      <main className="auth-wrap">
        <form className="auth glass" onSubmit={submit}>
          <span className="label" style={{ color: "var(--gold)" }}>{isReg ? t("auth.joinArena") : t("auth.welcomeBack")}</span>
          <h1>{isReg ? t("common.register") : t("common.login")}</h1>
          <label className="field"><span className="label">{t("auth.username")}</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required minLength={3} maxLength={20} />
          </label>
          <label className="field"><span className="label">{t("auth.password")}</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isReg ? "new-password" : "current-password"} required minLength={6} />
          </label>
          {isReg && (
            <label className="field"><span className="label">{t("auth.confirm")}</span>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
            </label>
          )}
          {error && <p className="error" role="alert" style={{ margin: 0 }}>{error}</p>}
          <button className="primary" disabled={busy}>{busy ? t("auth.busy") : isReg ? t("auth.create") : t("common.login")}</button>
          <GoogleButton
            onCredential={async (cred) => {
              setError("");
              try { await google(cred); router.push("/account"); } catch (err: any) { setError(apiError(t, err, "auth.googleFailed")); }
            }}
          />
          <p className="muted" style={{ margin: 0 }}>
            {isReg ? <>{t("auth.haveAccount")} <Link href="/login" className="link">{t("common.login")}</Link></> : <>{t("auth.noAccount")} <Link href="/register" className="link">{t("common.register")}</Link></>}
          </p>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>{t("auth.guestNote")}</p>
        </form>
      </main>
    </>
  );
}
