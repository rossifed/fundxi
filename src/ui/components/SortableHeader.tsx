/* SortableHeader — a clickable table-column header with a sort arrow.
 *
 * DDD role: presentational UI component. Stateless: the parent owns the
 * active sort key + direction and the toggle logic; this component only
 * renders the label, the ▲ / ▼ indicator when active, and emits a click.
 *
 * Same visual contract as the Screener's column headers — extracted so
 * any table (Screener, Portfolio positions / trades, …) sorts and looks
 * identical (cf. ui-coherence-symmetry).
 */

import type { CSSProperties } from "react";

export type SortDir = "asc" | "desc";

interface SortableHeaderProps {
  label: string;
  /** This column's sort key. ``null`` ⇒ the column is not sortable and
   * renders as a plain, non-interactive header. */
  sort_key: string | null;
  /** The currently-active sort key across the table. */
  active_key: string;
  dir: SortDir;
  on_sort: (key: string) => void;
  align?: "left" | "center" | "right";
}

export function SortableHeader({
  label,
  sort_key,
  active_key,
  dir,
  on_sort,
  align = "left",
}: SortableHeaderProps) {
  const sortable = sort_key !== null;
  const active = sortable && active_key === sort_key;
  const style: CSSProperties = {
    cursor: sortable ? "pointer" : "default",
    userSelect: "none",
    color: active ? "#fff" : undefined,
    textAlign: align,
    display: "block",
  };
  return (
    <span onClick={sortable ? () => on_sort(sort_key) : undefined} style={style}>
      {label}
      {active && (dir === "asc" ? " ▲" : " ▼")}
    </span>
  );
}
