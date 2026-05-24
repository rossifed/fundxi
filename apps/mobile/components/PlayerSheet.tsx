// Minimal player bottom sheet. Phase 1 step 8 proves the sheet pattern
// works (@gorhom/bottom-sheet on RN, gesture-handler wired at the root,
// safe-area handling). The full PlayerSheet — stats, news, matches, trade
// flow — is Phase 3 (see apps/web/src/ui/pages/player/PlayerSheet.tsx).

import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import type { BottomSheetBackdropProps } from "@gorhom/bottom-sheet";

import { teams_api } from "@fundxi/core/api/teams_api";
import { compute_return_pct } from "@fundxi/core/domain/market/return";
import { themes } from "@fundxi/core/design/palette";
import type { PlayerWithValuation } from "@fundxi/core/domain/market/player_valuation";

const palette = themes.dark;

export interface PlayerSheetHandle {
  open(player: PlayerWithValuation): void;
}

// Local state ref — the sheet snaps closed when `null`, open when a player
// is set. Using a ref-forwarded handle keeps the caller free of useState.
export const PlayerSheet = forwardRef<PlayerSheetHandle, { /* no props yet */ }>(function PlayerSheet(_props, ref) {
  const sheet_ref = useRef<BottomSheet>(null);
  const player_ref = useRef<PlayerWithValuation | null>(null);
  const snap_points = useMemo(() => ["45%"], []);

  useImperativeHandle(ref, () => ({
    open(player: PlayerWithValuation) {
      player_ref.current = player;
      sheet_ref.current?.expand();
    },
  }));

  const render_backdrop = (props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} />
  );

  const player = player_ref.current;
  const team = player ? teams_api.get(player.team_id) : undefined;
  const tournament_return = player
    ? compute_return_pct(player.valuation.current_price, player.valuation.base_value)
    : 0;
  const up = tournament_return >= 0;

  return (
    <BottomSheet
      ref={sheet_ref}
      index={-1}
      snapPoints={snap_points}
      enablePanDownToClose
      backdropComponent={render_backdrop}
      backgroundStyle={styles.bg}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetView style={styles.content}>
        {player ? (
          <>
            <View style={styles.header}>
              {player.image_path ? (
                <Image source={{ uri: player.image_path }} style={styles.avatar} resizeMode="contain" />
              ) : (
                <View style={[styles.avatar, styles.avatar_chip]}>
                  <Text style={styles.avatar_chip_text}>{player.jersey_number}</Text>
                </View>
              )}
              <View style={styles.identity}>
                <Text style={styles.name}>{player.full_name ?? player.name}</Text>
                <Text style={styles.team}>
                  {team?.flag} {team?.name} · #{player.jersey_number}
                </Text>
              </View>
            </View>

            <View style={styles.price_row}>
              <View>
                <Text style={styles.price_label}>Current price</Text>
                <Text style={styles.price_value}>€{player.valuation.current_price}M</Text>
              </View>
              <View>
                <Text style={styles.price_label}>Tournament Δ</Text>
                <Text style={[styles.price_value, { color: up ? palette.positive : palette.negative }]}>
                  {up ? "+" : ""}
                  {tournament_return.toFixed(1)}%
                </Text>
              </View>
            </View>

            <Text style={styles.footer}>
              Full player view (stats, news, recent matches, trade flow) lands in Phase 3.
            </Text>
          </>
        ) : null}
      </BottomSheetView>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  bg: {
    backgroundColor: palette.surfaceDeep,
  },
  handle: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  avatar_chip: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatar_chip_text: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
  identity: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
  team: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    marginTop: 4,
  },
  price_row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  price_label: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  price_value: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
  },
  footer: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 11,
    textAlign: "center",
    marginTop: 8,
  },
});
