"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { initialBoard, type Piece } from "@uno-chess/core";
import Board from "@/components/Board";
import Brand from "@/components/Brand";
import { newTicket } from "@/lib/colyseus";

const RULES = [
  { card: "5", color: "red", tag: "Thẻ cơ bản", title: "Thẻ số (1–9): số nước đi", text: "Có tối đa N nước đi, chia cho bất kỳ quân nào tùy bạn, có thể dừng sớm. Ăn quân không kết thúc lượt; ăn Vua là thắng." },
  { card: "+2", color: "green", tag: "Siêu quyền lực", title: "Thẻ +2 & +4: hồi sinh", text: "Hồi sinh tối đa 2 hoặc 4 quân đã bị ăn về hàng nhà." },
  { card: "⇄", color: "blue", tag: "Đảo chiều", title: "Reverse: xoay bàn", text: "Xoay bàn cờ 180°, hai người đổi phe cho nhau." },
  { card: "⊘", color: "yellow", tag: "Khống chế", title: "Skip / 0: mất nhịp", text: "Skip: lật thêm 1 lá. Lá 0: mất lượt." },
];

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");

  const pieces = useMemo(
    () => initialBoard().flatMap((p, sq) => (p ? [{ ...p, sq } as Piece & { sq: number }] : [])),
    [],
  );

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const id = code.trim().split("/").pop(); // accepts a pasted invite link too
    if (id) router.push(`/room/${id}`);
  };

  return (
    <>
      <Brand />
      <main className="home">
        <section className="hero">
          <div className="hero-art">
            <div className="hero-board plinth" aria-hidden="true">
              <Board pieces={pieces} perspective="w" selected={1} targets={[16, 18]} activeSq={-1} onSquare={() => {}} />
            </div>
            <div className="float-card red">3</div>
            <div className="float-card wild">+4</div>
            <div className="hero-copy">
              <div><span className="pill red">Cổ điển × Hỗn loạn</span> <span className="pill">Không có chiếu hết</span></div>
              <h1>Kỳ phổ chiến thuật: <em>Checkmate &amp; Draw Four</em></h1>
              <p className="lead">
                Mỗi lượt lật một lá bài. Số trên lá quyết định bạn được đi bao nhiêu nước — hãy ăn Vua đối thủ trước!
              </p>
            </div>
          </div>

          <div className="menu glass">
            <span className="label" style={{ color: "var(--gold)" }}>Phòng điều khiển</span>
            <h2>Bắt đầu ván đấu</h2>
            <button className="mode" onClick={() => router.push(`/room/${newTicket("online")}`)}>
              <span className="mode-icon">🏆</span>
              <span><strong>Đấu online</strong><small>Ghép ngẫu nhiên với người chơi khác</small></span>
            </button>
            <button className="mode" onClick={() => router.push(`/room/${newTicket("bot")}`)}>
              <span className="mode-icon">🤖</span>
              <span><strong>Đấu máy tập luyện</strong><small>Luyện tập một mình, không cần chờ</small></span>
            </button>
            <button className="mode" onClick={() => router.push(`/room/${newTicket("new")}`)}>
              <span className="mode-icon">🔗</span>
              <span><strong>Phòng tùy chỉnh</strong><small>Nhận mã phòng và link để mời bạn bè</small></span>
            </button>
            <form className="join" onSubmit={join}>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Nhập mã phòng hoặc dán link mời" aria-label="Mã phòng" />
              <button type="submit" className="gold" disabled={!code.trim()}>Vào</button>
            </form>
          </div>
        </section>

        <section className="rules">
          <span className="label" style={{ color: "var(--gold)" }}>Quy tắc độc quyền</span>
          <h2>Cẩm nang luật chơi</h2>
          <div className="rule-grid">
            {RULES.map((r) => (
              <div className="rule" key={r.title}>
                <span className="pill gold" style={{ justifySelf: "start" }}>{r.tag}</span>
                <div className="rule-art"><div className={`card ${r.color}`}><b>{r.card}</b></div></div>
                <h3>{r.title}</h3>
                <p>{r.text}</p>
              </div>
            ))}
          </div>
          <p className="muted">Không có chiếu hết — ai ăn được Vua trước sẽ thắng.</p>
        </section>
      </main>
      <footer className="foot"><span><b>Grandmaster Gambit</b> v1.0</span><span>Chess × Uno Tactical</span></footer>
    </>
  );
}
