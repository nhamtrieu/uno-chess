"use client";

import { useState } from "react";
import { useT, type Key } from "@/lib/i18n";
import { TIME_GROUPS, groupOf, tcLabel, type ClassicOptions } from "@/lib/timeControl";

/** Collapsible time-control chooser (Bullet / Blitz / Rapid) with a Rated switch, like lichess / chess.com. */
export default function TimePicker({ value, onChange }: { value: ClassicOptions; onChange: (o: ClassicOptions) => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const g = TIME_GROUPS.find((x) => x.id === groupOf(value.tc))!;

  return (
    <div className="tc">
      <button type="button" className="tc-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>{g.icon} {tcLabel(value.tc)} ({t(`classic.${g.id}` as Key)})</span>
        <span className="muted">{open ? "▴" : "▾"}</span>
      </button>
      <label className="toggle">
        <span>{t("classic.ratedToggle")}</span>
        <input type="checkbox" checked={value.rated} onChange={(e) => onChange({ ...value, rated: e.target.checked })} />
      </label>
      {open && (
        <div className="tc-groups">
          {TIME_GROUPS.map((grp) => (
            <div key={grp.id}>
              <div className="label" style={{ marginBottom: 6 }}>{grp.icon} {t(`classic.${grp.id}` as Key)}</div>
              <div className="tc-grid">
                {grp.items.map((tc) => (
                  <button
                    type="button"
                    key={tc}
                    className={value.tc === tc ? "on" : ""}
                    onClick={() => { onChange({ ...value, tc }); setOpen(false); }}
                  >
                    {tcLabel(tc)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
