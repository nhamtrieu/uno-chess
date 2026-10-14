import Link from "next/link";
import ProfileBar from "./Settings";
import { useT } from "@/lib/i18n";

export default function Brand({ right }: { right?: React.ReactNode }) {
  const { t } = useT();
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        <span className="brand-mark">♞</span>
        <span>
          <span className="brand-name">Grandmaster Gambit</span>
          <span className="brand-sub">{t("brand.sub")}</span>
        </span>
      </Link>
      <div className="topbar-right">{right}<ProfileBar /></div>
    </header>
  );
}
