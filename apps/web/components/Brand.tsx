import Link from "next/link";
import ProfileBar from "./Settings";

export default function Brand({ right }: { right?: React.ReactNode }) {
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        <span className="brand-mark">♞</span>
        <span>
          <span className="brand-name">Grandmaster Gambit</span>
          <span className="brand-sub">Chess × Uno Tactical</span>
        </span>
      </Link>
      <div className="topbar-right">{right}<ProfileBar /></div>
    </header>
  );
}
