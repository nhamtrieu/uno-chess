"use client";

import { useEffect, useRef } from "react";
import { useT, type Key } from "@/lib/i18n";

const SYMBOL: Record<string, string> = { skip: "⊘", reverse: "⇄", draw2: "+2", wild: "★", wild4: "+4" };

/**
 * `label` is the server's lastCard string: "number:red:5", "skip:red", "wild4".
 * `flipKey` changes whenever a card is drawn; the card then flips over from its back (not on first render).
 */
export default function Card({ label, size = "md", flipKey }: { label: string; size?: "md" | "sm"; flipKey?: string | number }) {
  const { t } = useT();
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; }, []);
  if (!label) return <div className={`card empty ${size}`}>UNO<small>{t("card.empty")}</small></div>;
  const [kind, a, b] = label.split(":");
  const color = kind === "number" ? a : kind === "wild" || kind === "wild4" ? "wild" : a;
  const text = kind === "number" ? b : SYMBOL[kind!];
  const caption =
    kind === "number"
      ? b === "0"
        ? t("card.zero")
        : t("card.number", { n: b! })
      : t(`card.${kind}` as Key);
  return (
    <div className="card-wrap">
      <div className="flip">
        {/* keyed by flipKey: a new draw remounts the card and restarts the flip animation */}
        <div key={flipKey} className={`flip-inner ${mounted.current && flipKey !== undefined ? "go" : ""}`}>
          <div className={`card ${color} ${size}`}>
            <i className="corner tl">{text}</i>
            <b>{text}</b>
            <i className="corner br">{text}</i>
          </div>
          <div className={`card back ${size}`} aria-hidden="true"><span>UNO</span></div>
        </div>
      </div>
      <div key={`c${flipKey}`} className={`card-caption ${mounted.current && flipKey !== undefined ? "fade" : ""}`}>{caption}</div>
    </div>
  );
}
