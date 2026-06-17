/* LiveBar — global slim "a match is LIVE" bar.
 *
 * Shown app-wide (below the PortfolioBar) whenever >=1 fixture is live. Cycles
 * (~7s) through the live matches; the ones where the user holds a player come
 * first (their book is moving — the highest-value trading signal). Tap opens
 * that match. The ordering is the shared core helper (live_fixtures_ordered)
 * so web and mobile stay aligned; only the rotation timer + render live here.
 *
 * Data is 100% client-side: the fixtures cache (refreshed on each live SSE
 * tick), the user's holdings, and the per-fixture commentary. No new backend.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MatchComment } from "@fundxi/core/domain/match/match_comment";
import { live_fixtures_ordered } from "@fundxi/core/domain/match/match_center";
import { matches_api } from "@fundxi/core/api/matches_api";
import { comments_api } from "@fundxi/core/api/comments_api";
import { portfolio_api } from "@fundxi/core/api/portfolio_api";
import { teams_api } from "@fundxi/core/api/teams_api";
import { useFixtureLiveVersion, useLiveRefetch, useMatchesLiveVersion } from "@/ui/hooks/use_live_updates";

const ROTATE_MS = 7000;

export function LiveBar({ on_open_match }: { on_open_match: (fixture_id: number) => void }) {
  const live_version = useMatchesLiveVersion();
  const [fixtures_v, set_fixtures_v] = useState(0);
  const [holdings_v, set_holdings_v] = useState(0);

  // Keep the fixtures cache current (status / minute / score) on each live tick.
  useLiveRefetch(live_version, () => {
    void matches_api.refresh_fixtures().then(() => set_fixtures_v(v => v + 1));
  });
  // Priority depends on the user's holdings — re-read when they change.
  useEffect(() => portfolio_api.subscribe(() => set_holdings_v(v => v + 1)), []);

  const held_team_ids = useMemo(() => {
    const s = new Set<string>();
    for (const h of portfolio_api.get_holdings()) s.add(h.player.team_id);
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdings_v]);

  const live = useMemo(
    () => live_fixtures_ordered(matches_api.list_fixtures(), held_team_ids),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fixtures_v, holdings_v, live_version, held_team_ids],
  );

  // Rotation. Reset to the top whenever the live set size changes.
  const [idx, set_idx] = useState(0);
  useEffect(() => set_idx(0), [live.length]);
  useEffect(() => {
    if (live.length <= 1) return;
    const t = setInterval(() => set_idx(i => (i + 1) % live.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [live.length]);

  const current = live.length ? live[idx % live.length] : undefined;
  const current_id = current?.id;

  // The `matches` topic only fires on coarse changes (a match going live /
  // finishing), so it does NOT tick during play. Subscribe to the CURRENT live
  // fixture's own topic to actually advance the minute / score / comments.
  const fixture_version = useFixtureLiveVersion(current_id);
  useLiveRefetch(fixture_version, () => {
    void matches_api.refresh_fixtures().then(() => set_fixtures_v(v => v + 1));
  });

  // Recent commentary for the current live match — scrolled as a marquee.
  const [comments, set_comments] = useState<MatchComment[]>([]);
  const last_fixture = useRef<number | null>(null);
  useEffect(() => {
    if (current_id == null) {
      set_comments([]);
      return;
    }
    if (last_fixture.current !== current_id) {
      set_comments([]); // clear stale lines while the new match's load
      last_fixture.current = current_id;
    }
    let cancelled = false;
    comments_api.for_fixture(current_id).then(
      cs => {
        // Chronological (oldest -> newest) over the most recent ~14, so the
        // minutes read forward in time left-to-right as the marquee scrolls.
        if (!cancelled) set_comments(cs.slice(-14));
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [current_id, fixture_version]);

  if (!current) return null;

  const home = teams_api.get(current.home_team_id);
  const away = teams_api.get(current.away_team_id);
  const score =
    current.home_score != null && current.away_score != null ? `${current.home_score}-${current.away_score}` : "";

  return (
    <button
      type="button"
      onClick={() => on_open_match(current.id)}
      title={`${home?.name ?? current.home_team_id} vs ${away?.name ?? current.away_team_id} — open match`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "7px 16px",
        background: "color-mix(in srgb, var(--color-positive) 6%, transparent)",
        borderTop: "1px solid rgba(255,255,255,.04)",
        borderBottom: "1px solid color-mix(in srgb, var(--color-positive) 16%, transparent)",
        cursor: "pointer",
        fontFamily: "inherit",
        color: "#fff",
        textAlign: "left",
        overflow: "hidden",
      }}
    >
      {/* Just a small pulsing green dot as the live marker — no "LIVE" pill, no
          minute (saves width in the bar). */}
      <span
        aria-hidden
        style={{
          flexShrink: 0,
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "var(--color-positive)",
          boxShadow: "0 0 6px var(--color-positive)",
          animation: "pulse 1.5s infinite",
        }}
      />
      <span className="mono" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
        <span style={{ fontSize: 15 }}>{home?.flag ?? ""}</span>
        {score && <span>{score}</span>}
        <span style={{ fontSize: 15 }}>{away?.flag ?? ""}</span>
      </span>
      <CommentMarquee comments={comments} />
      {/* Rotation dots when several matches are live. */}
      {live.length > 1 && (
        <span style={{ display: "inline-flex", gap: 4, flexShrink: 0, marginLeft: "auto" }}>
          {live.map((f, i) => (
            <span
              key={f.id}
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: i === idx % live.length ? "var(--color-positive)" : "rgba(255,255,255,.2)",
              }}
            />
          ))}
        </span>
      )}
    </button>
  );
}

/* CommentMarquee — the recent commentary scrolling right-to-left, seamlessly
 * (two back-to-back copies animated by -50% via the shared `marquee` keyframe),
 * pausing on hover. Speed scales with content width (~70 px/s) so a long feed
 * doesn't blast past and a short one doesn't crawl. */
function CommentMarquee({ comments }: { comments: MatchComment[] }) {
  const copy_ref = useRef<HTMLDivElement>(null);
  const [duration, set_duration] = useState(20);
  const [paused, set_paused] = useState(false);

  useLayoutEffect(() => {
    const w = copy_ref.current?.offsetWidth ?? 0;
    set_duration(Math.max(10, w / 70));
  }, [comments]);

  if (!comments.length) return null;

  const items = (suffix: string) =>
    comments.map((c, i) => (
      <span key={`${suffix}-${c.id ?? i}`} style={{ marginRight: 26, whiteSpace: "nowrap", fontSize: 14, fontWeight: 500 }}>
        <span style={{ color: "var(--color-positive)", fontWeight: 700, fontSize: 14 }}>{c.minute}&apos;</span> {c.comment}
      </span>
    ));

  return (
    <div
      onMouseEnter={() => set_paused(true)}
      onMouseLeave={() => set_paused(false)}
      style={{
        flex: 1,
        minWidth: 0,
        overflow: "hidden",
        fontSize: 14,
        color: "rgba(255,255,255,.6)",
        maskImage: "linear-gradient(to right, transparent 0, #000 16px, #000 calc(100% - 16px), transparent 100%)",
        WebkitMaskImage: "linear-gradient(to right, transparent 0, #000 16px, #000 calc(100% - 16px), transparent 100%)",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          whiteSpace: "nowrap",
          animation: `marquee ${duration}s linear infinite`,
          animationPlayState: paused ? "paused" : "running",
          willChange: "transform",
        }}
      >
        <div ref={copy_ref} style={{ display: "inline-flex" }}>
          {items("a")}
        </div>
        <div style={{ display: "inline-flex" }} aria-hidden>
          {items("b")}
        </div>
      </div>
    </div>
  );
}
