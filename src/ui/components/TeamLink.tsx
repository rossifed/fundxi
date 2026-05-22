/* TeamLink — wraps a team reference (flag / name) so a click opens the
 * team page.
 *
 * DDD role: UI presentation component (interaction wrapper). It carries
 * no data and no domain logic — it only turns an existing visual into a
 * navigation affordance.
 *
 * Why a wrapper and not an onClick per call site: most team references
 * sit inside a row that is itself clickable (a fixture row opens the
 * match, a holding row opens the player). The team click must NOT bubble
 * to that outer handler — ``stopPropagation`` here is the single place
 * that rule lives, instead of being re-implemented ~13 times.
 *
 * When ``on_open_team`` is undefined the children render bare, so a
 * surface that has not been wired (or deliberately stays non-interactive)
 * degrades gracefully to plain text.
 */

import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from "react";

interface TeamLinkProps {
  team_id: string;
  on_open_team?: (team_id: string) => void;
  children: ReactNode;
  /** Merged onto the wrapper. The caller keeps full control of layout
   * (display / gap / flex / ellipsis); TeamLink only adds the affordance. */
  style?: CSSProperties;
  title?: string;
}

export function TeamLink({ team_id, on_open_team, children, style, title }: TeamLinkProps) {
  if (!on_open_team) return <>{children}</>;

  const open = () => on_open_team(team_id);

  const handle_click = (e: MouseEvent) => {
    e.stopPropagation();
    open();
  };
  const handle_key = (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    e.stopPropagation();
    open();
  };

  return (
    <span
      role="button"
      tabIndex={0}
      title={title ?? "Open team"}
      onClick={handle_click}
      onKeyDown={handle_key}
      onMouseEnter={e => (e.currentTarget.style.opacity = "0.6")}
      onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
      style={{ cursor: "pointer", transition: "opacity .12s ease", ...style }}
    >
      {children}
    </span>
  );
}
