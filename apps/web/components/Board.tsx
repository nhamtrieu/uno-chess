"use client";

import { useEffect, useRef, useState } from "react";
import type { Piece } from "@uno-chess/core";

// Solid glyphs for both colours; the colour/outline comes from CSS.
const GLYPH: Record<string, string> = { K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟" };
const FILES = "abcdefgh";

type Tint = "orange" | "green" | "red" | "blue";
const TINT: Record<Tint, string> = { orange: "#ffaa00", green: "#15a34a", red: "#e5484d", blue: "#3b82f6" };
interface Arrow { from: number; to: number; tint: Tint }
interface Mark { sq: number; tint: Tint }

/** chess.com style: plain = orange, shift = green, ctrl = red, alt = blue. */
const tintOf = (e: { shiftKey: boolean; ctrlKey: boolean; altKey: boolean }): Tint =>
  e.shiftKey ? "green" : e.ctrlKey ? "red" : e.altKey ? "blue" : "orange";

interface Props {
  pieces: Piece[]; // on-board only
  /** Colour at the bottom of the screen. */
  perspective: "w" | "b";
  selected: number | null;
  targets: number[];
  activeSq: number;
  onSquare: (sq: number) => void;
  /** Squares whose piece may be picked up and dragged. Clicking still works everywhere. */
  canDrag?: (sq: number) => boolean;
}

export default function Board({ pieces, perspective, selected, targets, activeSq, onSquare, canDrag }: Props) {
  const [drag, setDrag] = useState<{ from: number; glyph: string; color: string; x: number; y: number } | null>(null);
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const rpress = useRef<{ from: number; tint: Tint } | null>(null);
  const press = useRef<{ from: number; x: number; y: number; moved: boolean } | null>(null);
  // Window listeners must see the latest props without re-subscribing on every render.
  const latest = useRef({ onSquare });
  latest.current = { onSquare };

  const bySq = new Map<number, Piece>();
  pieces.forEach((p) => bySq.set((p as Piece & { sq: number }).sq, p));

  const ranks = perspective === "w" ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const files = perspective === "w" ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];

  // Centre of a square in the 8x8 SVG space, honouring the board orientation.
  const center = (sq: number): [number, number] => [
    files.indexOf(sq % 8) + 0.5,
    ranks.indexOf(Math.floor(sq / 8)) + 0.5,
  ];


  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = press.current;
      if (!p) return;
      if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 5) return;
      p.moved = true;
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    };
    const up = (e: PointerEvent) => {
      if (e.button === 2) {
        // Right button: drag draws an arrow, a plain click marks the square; repeating removes it.
        const r = rpress.current;
        rpress.current = null;
        if (!r) return;
        const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-sq]");
        const to = el ? Number(el.dataset.sq) : NaN;
        if (Number.isNaN(to)) return;
        if (to === r.from) {
          setMarks((m) => (m.some((x) => x.sq === to && x.tint === r.tint) ? m.filter((x) => x.sq !== to) : [...m.filter((x) => x.sq !== to), { sq: to, tint: r.tint }]));
        } else {
          setArrows((a) => {
            const same = a.find((x) => x.from === r.from && x.to === to);
            const rest = a.filter((x) => !(x.from === r.from && x.to === to));
            return same && same.tint === r.tint ? rest : [...rest, { from: r.from, to, tint: r.tint }];
          });
        }
        return;
      }
      const p = press.current;
      press.current = null;
      if (!p) return;
      setDrag(null);
      if (!p.moved) return; // plain click: the button's onClick handles it
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-sq]");
      const to = el ? Number(el.dataset.sq) : NaN;
      if (!Number.isNaN(to) && to !== p.from) latest.current.onSquare(to);
      // Swallow the click that follows a drag so the drop square is not treated as a second tap.
      window.addEventListener("click", (c) => c.stopPropagation(), { capture: true, once: true });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  const clearDrawings = () => {
    setArrows((a) => (a.length ? [] : a));
    setMarks((m) => (m.length ? [] : m));
  };

  const startDrag = (e: React.PointerEvent, sq: number, p: Piece) => {
    if (e.button !== 0 || !canDrag?.(sq)) return;
    clearDrawings();
    onSquare(sq); // select the piece so its targets are shown while dragging
    press.current = { from: sq, x: e.clientX, y: e.clientY, moved: false };
    setDrag({ from: sq, glyph: GLYPH[p.type]!, color: p.color, x: e.clientX, y: e.clientY });
  };

  return (
    <div
      className="board"
      role="grid"
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (e.button === 0) clearDrawings();
      }}
    >
      {ranks.flatMap((r, ri) =>
        files.map((f, fi) => {
          const sq = r * 8 + f;
          const p = bySq.get(sq);
          const cls = [
            "square",
            (r + f) % 2 === 0 ? "dark" : "light",
            sq === selected ? "selected" : "",
            sq === activeSq ? "active" : "",
            targets.includes(sq) ? (p ? "target capture" : "target") : "",
          ].join(" ");
          return (
            <button
              key={sq}
              data-sq={sq}
              className={cls}
              onClick={() => onSquare(sq)}
              onPointerDown={(e) => {
                if (e.button === 2) rpress.current = { from: sq, tint: tintOf(e) };
                else if (p) startDrag(e, sq, p);
              }}
              aria-label={`ô ${FILES[f]}${r + 1}`}
            >
              {fi === 0 && <span className="coord rank">{r + 1}</span>}
              {ri === 7 && <span className="coord file">{FILES[f]}</span>}
              {p && <span className={`piece ${p.color}${canDrag?.(sq) ? " grab" : ""}${drag?.from === sq ? " lifted" : ""}`}>{GLYPH[p.type]}</span>}
            </button>
          );
        }),
      )}
      <svg className="draw" viewBox="0 0 8 8" aria-hidden="true">
        {marks.map((m) => {
          const [x, y] = center(m.sq);
          return <rect key={`m${m.sq}`} x={x - 0.5} y={y - 0.5} width="1" height="1" fill={TINT[m.tint]} opacity=".55" />;
        })}
        {arrows.map((a) => (
          <ArrowShape key={`${a.from}-${a.to}`} pts={arrowPoints(center(a.from), center(a.to))} color={TINT[a.tint]} />
        ))}
      </svg>
      {drag && press.current?.moved && (
        <span className={`piece ghost ${drag.color}`} style={{ left: drag.x, top: drag.y }}>{drag.glyph}</span>
      )}
    </div>
  );
}

/** Straight line, or an L (long leg first) for knight jumps. */
function arrowPoints([x1, y1]: [number, number], [x2, y2]: [number, number]): [number, number][] {
  const dx = x2 - x1, dy = y2 - y1;
  const knight = (Math.abs(dx) === 1 && Math.abs(dy) === 2) || (Math.abs(dx) === 2 && Math.abs(dy) === 1);
  if (!knight) return [[x1, y1], [x2, y2]];
  return Math.abs(dy) > Math.abs(dx) ? [[x1, y1], [x1, y2], [x2, y2]] : [[x1, y1], [x2, y1], [x2, y2]];
}

function ArrowShape({ pts, color }: { pts: [number, number][]; color: string }) {
  const HEAD = 0.42, W = 0.2;
  const [px, py] = pts[pts.length - 2]!;
  const [tx, ty] = pts[pts.length - 1]!;
  const len = Math.hypot(tx - px, ty - py);
  const ux = (tx - px) / len, uy = (ty - py) / len;
  const bx = tx - ux * HEAD, by = ty - uy * HEAD; // where the shaft meets the head
  const line = [...pts.slice(0, -1), [bx, by]].map(([x, y]) => `${x},${y}`).join(" ");
  const head = `${tx},${ty} ${bx - uy * HEAD * 0.62},${by + ux * HEAD * 0.62} ${bx + uy * HEAD * 0.62},${by - ux * HEAD * 0.62}`;
  return (
    <g opacity=".8" fill={color} stroke={color}>
      <polyline points={line} fill="none" strokeWidth={W} strokeLinejoin="round" />
      <polygon points={head} strokeWidth="0" />
    </g>
  );
}
