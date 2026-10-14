"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const SRC = "https://accounts.google.com/gsi/client";

declare global {
  interface Window {
    google?: any;
  }
}

/** Google Identity Services button; hands the signed ID token to `onCredential`. */
export default function GoogleButton({ onCredential }: { onCredential: (credential: string) => void }) {
  const { t, lang } = useT();
  const box = useRef<HTMLDivElement>(null);
  const langRef = useRef(lang);
  langRef.current = lang;
  const cb = useRef(onCredential);
  cb.current = onCredential;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!CLIENT_ID) return;
    const init = () => {
      if (!window.google || !box.current) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (r: { credential: string }) => cb.current(r.credential),
      });
      window.google.accounts.id.renderButton(box.current, { theme: "filled_black", size: "large", shape: "pill", text: "continue_with", width: 320, locale: langRef.current });
    };
    if (window.google) return init();
    let s = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
    if (!s) {
      s = document.createElement("script");
      s.src = SRC;
      s.async = true;
      document.head.appendChild(s);
    }
    s.addEventListener("load", init);
    s.addEventListener("error", () => setFailed(true));
    return () => s?.removeEventListener("load", init);
  }, [lang]);

  if (!CLIENT_ID) {
    return <p className="muted" style={{ margin: 0, fontSize: 12 }}>{t("google.disabled")}</p>;
  }
  return (
    <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
      <span className="label">{t("common.or")}</span>
      <div ref={box} />
      {failed && <span className="error">{t("google.loadFailed")}</span>}
    </div>
  );
}
