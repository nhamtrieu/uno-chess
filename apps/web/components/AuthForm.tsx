"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Brand from "./Brand";
import GoogleButton from "./GoogleButton";
import { useAuth } from "@/lib/auth";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
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
    if (isReg && password !== confirm) return setError("Mật khẩu nhập lại không khớp");
    setBusy(true);
    try {
      await (isReg ? register : login)(username, password);
      router.push("/account");
    } catch (err: any) {
      setError(err?.message ?? "Có lỗi xảy ra");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Brand />
      <main className="auth-wrap">
        <form className="auth glass" onSubmit={submit}>
          <span className="label" style={{ color: "var(--gold)" }}>{isReg ? "Gia nhập đấu trường" : "Chào mừng trở lại"}</span>
          <h1>{isReg ? "Đăng ký" : "Đăng nhập"}</h1>
          <label className="field"><span className="label">Tên đăng nhập</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required minLength={3} maxLength={20} />
          </label>
          <label className="field"><span className="label">Mật khẩu</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isReg ? "new-password" : "current-password"} required minLength={6} />
          </label>
          {isReg && (
            <label className="field"><span className="label">Nhập lại mật khẩu</span>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
            </label>
          )}
          {error && <p className="error" role="alert" style={{ margin: 0 }}>{error}</p>}
          <button className="primary" disabled={busy}>{busy ? "Đang xử lý…" : isReg ? "Tạo tài khoản" : "Đăng nhập"}</button>
          <GoogleButton
            onCredential={async (cred) => {
              setError("");
              try { await google(cred); router.push("/account"); } catch (err: any) { setError(err?.message ?? "Đăng nhập Google thất bại"); }
            }}
          />
          <p className="muted" style={{ margin: 0 }}>
            {isReg ? <>Đã có tài khoản? <Link href="/login" className="link">Đăng nhập</Link></> : <>Chưa có tài khoản? <Link href="/register" className="link">Đăng ký</Link></>}
          </p>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>Bạn vẫn có thể chơi như khách, nhưng Elo chỉ được lưu khi có tài khoản.</p>
        </form>
      </main>
    </>
  );
}
