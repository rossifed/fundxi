/* Shared presentational primitives for the player sheet — the labelled
 * section card and the compact KPI cell, reused by every sub-panel.
 *
 * DDD role: presentational UI components (no state, no I/O).
 */

import type { ReactNode } from "react";

export function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  // Title cell + content row touch (no vertical gap): the title loses its
  // bottom border and bottom radius so it blends into the cells below.
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "rgba(255,255,255,.55)",
          letterSpacing: 0.5,
          textTransform: "uppercase",
          background: "rgba(255,255,255,.025)",
          border: "1px solid rgba(255,255,255,.05)",
          borderBottom: "none",
          borderRadius: "6px 6px 0 0",
          padding: "6px 10px",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

export function SmallKpi({
  label,
  value,
  color,
  mono = true,
  title,
}: {
  label: string;
  value: ReactNode;
  color?: string;
  mono?: boolean;
  /** Optional hover tooltip — disambiguates compact values (e.g. the
   * "on target / total" shots ratio). */
  title?: string;
}) {
  return (
    <div
      title={title}
      style={{
        background: "rgba(255,255,255,.025)",
        border: "1px solid rgba(255,255,255,.05)",
        borderRadius: 6,
        padding: "6px 9px",
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: "rgba(255,255,255,.35)",
          textTransform: "uppercase",
          letterSpacing: 0.4,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div className={mono ? "mono" : ""} style={{ fontSize: 13, fontWeight: 800, color: color ?? "#fff", marginTop: 1 }}>
        {value}
      </div>
    </div>
  );
}
