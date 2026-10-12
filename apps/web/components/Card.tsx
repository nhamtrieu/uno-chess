const SYMBOL: Record<string, string> = { skip: "⊘", reverse: "⇄", draw2: "+2", wild: "★", wild4: "+4" };
const NAME: Record<string, string> = {
  skip: "Skip — lật thêm lá nữa",
  reverse: "Reverse — xoay bàn, đổi phe",
  draw2: "+2 — hồi sinh tối đa 2 quân",
  wild: "Wild — chọn số nước 1–9",
  wild4: "Wild +4 — hồi sinh tối đa 4 quân",
};

/** `label` is the server's lastCard string: "number:red:5", "skip:red", "wild4". */
export default function Card({ label, size = "md" }: { label: string; size?: "md" | "sm" }) {
  if (!label) return <div className={`card empty ${size}`}>UNO<small>Chưa có bài</small></div>;
  const [kind, a, b] = label.split(":");
  const color = kind === "number" ? a : kind === "wild" || kind === "wild4" ? "wild" : a;
  const text = kind === "number" ? b : SYMBOL[kind!];
  const caption =
    kind === "number"
      ? b === "0"
        ? "0 — mất lượt"
        : `Đi tối đa ${b} nước`
      : NAME[kind!];
  return (
    <div className="card-wrap">
      <div className={`card ${color} ${size}`}>
        <i className="corner tl">{text}</i>
        <b>{text}</b>
        <i className="corner br">{text}</i>
      </div>
      <div className="card-caption">{caption}</div>
    </div>
  );
}
