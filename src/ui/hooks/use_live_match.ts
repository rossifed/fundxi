/* useLiveMatch — single source of truth for "the currently in-play match".
 *
 * Before this hook, the Home Match Center kept the live match in sync via
 * the fixture SSE stream while the RightRail ticker read a boot-time
 * snapshot that never refreshed — so the same match showed two different
 * minutes/scores depending on the widget (and page). This hook centralises
 * the update path: every consumer (Home, RightRail, …) gets the exact same
 * live Match object, refreshed by the exact same logic.
 *
 * Behaviour (identical to what the Home Match Center used to do inline):
 *   - seed from the boot-time snapshot;
 *   - the per-fixture stream keeps clock/score/scorers in step;
 *   - the global "matches" stream lets a match appear mid-session when it
 *     goes live (and clears the card when none is live).
 */

import { useState } from "react";
import { matches_api } from "@/api/matches_api";
import type { Match } from "@/domain/match/match";
import { useFixtureLiveVersion, useLiveRefetch, useMatchesLiveVersion } from "@/ui/hooks/use_live_updates";

export function useLiveMatch(): Match | null {
  const [live, set_live] = useState<Match | null>(() => matches_api.get_live_match() ?? null);

  const live_version = useFixtureLiveVersion(live?.fixture_id);
  useLiveRefetch(live_version, () => {
    if (!live?.fixture_id) return;
    matches_api
      .refresh_match_by_fixture_id(live.fixture_id)
      .then(m => set_live(m && m.status === "live" ? m : null))
      .catch(() => {
        /* keep the current card on a transient error */
      });
  });

  const matches_version = useMatchesLiveVersion();
  useLiveRefetch(matches_version, () => {
    if (live) return; // already showing one; the per-fixture stream handles updates
    matches_api
      .refresh_fixtures()
      .then(fixtures => {
        const live_fixture = fixtures.find(f => f.status === "live");
        if (!live_fixture) return;
        matches_api
          .refresh_match_by_fixture_id(live_fixture.id)
          .then(m => set_live(m && m.status === "live" ? m : null))
          .catch(() => {});
      })
      .catch(() => {});
  });

  return live;
}
