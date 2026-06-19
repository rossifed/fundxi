/* MatchLeaders (mobile) — the "cards of the match" strip for the Stats tab.
 *
 * Web/mobile parity: mirrors apps/web/src/ui/pages/match/MatchLeaders.tsx. The
 * card set (which player leads what, label/value/tone/order/guards) comes from
 * the shared domain service build_leader_cards, so both platforms render the
 * identical strip. This file only resolves identity and lays the cards out.
 */

import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { players_api } from "@fundxi/core/api/players_api";
import type { MatchPlayer } from "@fundxi/core/domain/match/match";
import { build_leader_cards } from "@fundxi/core/domain/match/match_leaders";
import type { PlayerMatchStat } from "@fundxi/core/domain/match/player_match_stats";
import type { Player, Position } from "@fundxi/core/domain/player/player";
import { PlayerHighlightCard } from "@/components/PlayerHighlightCard";
import { text, with_alpha } from "@/theme/tokens";

interface MatchLeadersProps {
  players: MatchPlayer[];
  stats: PlayerMatchStat[];
  team_color_for: (team_id: string | undefined) => string;
  on_open: (player: Player) => void;
}

export function MatchLeaders({ players, stats, team_color_for, on_open }: MatchLeadersProps) {
  const cards = useMemo(() => {
    const by_id = new Map<number, MatchPlayer>(players.map(p => [p.id, p]));
    return build_leader_cards(players, stats)
      .map(card => ({ card, mp: by_id.get(card.player_id) }))
      .filter((x): x is { card: (typeof x)["card"]; mp: MatchPlayer } => x.mp != null);
  }, [players, stats]);

  if (cards.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>MATCH LEADERS</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {cards.map(({ card, mp }) => {
          const player_obj = players_api.get(mp.id);
          return (
            <PlayerHighlightCard
              key={card.key}
              name={mp.name}
              jersey_number={mp.jersey_number}
              position={mp.position as Position}
              image_path={player_obj?.image_path ?? null}
              team_color={team_color_for(mp.team_id)}
              caption={{ label: card.label, value: card.value, sub: card.sub, tone: card.tone }}
              on_press={() => player_obj && on_open(player_obj)}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  title: { fontSize: 11, fontWeight: "800", letterSpacing: 0.8, color: with_alpha(text.primary, 0.55), paddingHorizontal: 2 },
  row: { gap: 10, paddingBottom: 4, paddingHorizontal: 2 },
});
