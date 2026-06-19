/* MatchLeaders — the "cards of the match" strip for the Stats tab.
 *
 * DDD role: presentational container. The card descriptors (which player leads
 * what, with label/value/tone) come from the shared domain service
 * build_leader_cards, so web and mobile render the identical set. This file
 * only resolves identity (name/photo/team) and lays the cards out.
 *
 * Data honesty: stat leaders come from core.player_match_stat (live ingest).
 * Before any stat is ingested only the price mover can show; the strip hides
 * entirely when build_leader_cards returns nothing real.
 */

import { useMemo } from "react";
import { players_api } from "@fundxi/core/api/players_api";
import type { MatchPlayer } from "@fundxi/core/domain/match/match";
import { build_leader_cards } from "@fundxi/core/domain/match/match_leaders";
import type { PlayerMatchStat } from "@fundxi/core/domain/match/player_match_stats";
import type { Position } from "@fundxi/core/domain/player/player";
import { PlayerHighlightCard } from "@/ui/components/PlayerHighlightCard";

interface MatchLeadersProps {
  /** Every player in the fixture (home + away, XI + bench). */
  players: MatchPlayer[];
  /** Per-player live stat lines for this fixture (may be empty pre-ingest). */
  stats: PlayerMatchStat[];
  /** Resolve a team's kit colour (provider data). */
  team_color_for: (team_id: string | undefined) => string;
  on_open_player: (player_id: number) => void;
}

export function MatchLeaders({ players, stats, team_color_for, on_open_player }: MatchLeadersProps) {
  const cards = useMemo(() => {
    const by_id = new Map<number, MatchPlayer>(players.map(p => [p.id, p]));
    return build_leader_cards(players, stats)
      .map(card => ({ card, player: by_id.get(card.player_id) }))
      .filter((x): x is { card: (typeof x)["card"]; player: MatchPlayer } => x.player != null);
  }, [players, stats]);

  if (cards.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          color: "rgba(255,255,255,.55)",
          padding: "0 2px",
        }}
      >
        Match leaders
      </div>
      <div
        className="scroll-visible"
        style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, scrollSnapType: "x proximity" }}
      >
        {cards.map(({ card, player }) => (
          <div key={card.key} style={{ scrollSnapAlign: "start" }}>
            <PlayerHighlightCard
              name={player.name}
              jersey_number={player.jersey_number}
              position={player.position as Position}
              image_path={players_api.get(player.id)?.image_path ?? null}
              team_color={team_color_for(player.team_id)}
              caption={{ label: card.label, value: card.value, sub: card.sub, tone: card.tone }}
              on_click={() => on_open_player(player.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
