/* LiveBar — global slim "a match is LIVE" bar (mobile).
 *
 * Mirror of apps/web/src/ui/shell/LiveBar.tsx: shown app-wide under the
 * PortfolioBar whenever >=1 fixture is live, cycling (~7s) through the live
 * matches (the ones where the user holds a player come first — their book is
 * moving), with the recent commentary scrolling as a marquee. Tap opens that
 * match. Shared ordering (core live_fixtures_ordered) + shared data (fixtures
 * cache / holdings / comments). The web uses a CSS keyframe; RN scrolls via an
 * Animated translateX loop over two back-to-back copies.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { matches_api } from "@fundxi/core/api/matches_api";
import { comments_api } from "@fundxi/core/api/comments_api";
import { portfolio_api } from "@fundxi/core/api/portfolio_api";
import { teams_api } from "@fundxi/core/api/teams_api";
import { live_fixtures_ordered } from "@fundxi/core/domain/match/match_center";
import type { MatchComment } from "@fundxi/core/domain/match/match_comment";

import { useFixtureLiveVersion, useLiveRefetch, useMatchesLiveVersion } from "@/components/live";
import { palette, with_alpha } from "@/theme/tokens";

const ROTATE_MS = 7000;

export function LiveBar() {
  const router = useRouter();
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
  }, [holdings_v]);

  const live = useMemo(
    () => live_fixtures_ordered(matches_api.list_fixtures(), held_team_ids),
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

  // The `matches` topic only fires on coarse changes; subscribe to the CURRENT
  // live fixture's own topic to actually advance the minute / score / comments.
  const fixture_version = useFixtureLiveVersion(current_id);
  useLiveRefetch(fixture_version, () => {
    void matches_api.refresh_fixtures().then(() => set_fixtures_v(v => v + 1));
  });

  const [comments, set_comments] = useState<MatchComment[]>([]);
  const last_fixture = useRef<number | null>(null);
  useEffect(() => {
    if (current_id == null) {
      set_comments([]);
      return;
    }
    if (last_fixture.current !== current_id) {
      set_comments([]);
      last_fixture.current = current_id;
    }
    let cancelled = false;
    comments_api.for_fixture(current_id).then(
      cs => {
        // Chronological (oldest -> newest) so the minutes read forward in time
        // left-to-right as the marquee scrolls; the most recent ~14.
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
    <Pressable onPress={() => router.push(`/match/${current.id}`)} style={styles.bar}>
      {/* Just a small pulsing green dot as the live marker — no "LIVE", no minute
          (saves width in the bar). */}
      <BarLiveDot />
      <View style={styles.score}>
        <Text style={styles.flag}>{home?.flag ?? ""}</Text>
        {!!score && <Text style={styles.score_txt}>{score}</Text>}
        <Text style={styles.flag}>{away?.flag ?? ""}</Text>
      </View>
      <CommentMarquee comments={comments} />
      {live.length > 1 && (
        <View style={styles.dots}>
          {live.map((f, i) => (
            <View key={f.id} style={[styles.dot, i === idx % live.length && styles.dot_on]} />
          ))}
        </View>
      )}
    </Pressable>
  );
}

/* Small pulsing green dot — the live marker (no "LIVE" text, no minute). */
function BarLiveDot() {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.25, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[styles.live_dot, { opacity }]} />;
}

/* The recent commentary scrolling right-to-left, seamlessly (two back-to-back
 * copies translated by one copy's width via an Animated loop). ~70 px/s. */
function CommentMarquee({ comments }: { comments: MatchComment[] }) {
  const tx = useRef(new Animated.Value(0)).current;
  const [copy_w, set_copy_w] = useState(0);

  useEffect(() => {
    if (copy_w <= 0 || !comments.length) return;
    const duration = Math.max(10000, (copy_w / 70) * 1000);
    tx.setValue(0);
    const loop = Animated.loop(
      Animated.timing(tx, { toValue: -copy_w, duration, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [copy_w, comments, tx]);

  if (!comments.length) return null;

  const copy = (suffix: string, measure: boolean) => (
    <View
      key={suffix}
      style={styles.cm_copy}
      onLayout={measure ? e => set_copy_w(e.nativeEvent.layout.width) : undefined}
    >
      {comments.map((c, i) => (
        <Text key={`${suffix}-${c.id ?? i}`} style={styles.cm_item} allowFontScaling={false}>
          <Text style={styles.cm_min}>{c.minute}&apos;</Text> {c.comment}
        </Text>
      ))}
    </View>
  );

  return (
    <View style={styles.cm_wrap}>
      <Animated.View style={{ flexDirection: "row", transform: [{ translateX: tx }] }}>
        {copy("a", true)}
        {copy("b", false)}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: with_alpha(palette.positive, 0.06),
    borderBottomWidth: 1,
    borderBottomColor: with_alpha(palette.positive, 0.16),
  },
  live_dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.positive },
  score: { flexDirection: "row", alignItems: "center", gap: 5 },
  flag: { fontSize: 14 },
  // Single text size across the whole bar (score + commentary) = 14, the larger
  // of the two former sizes, so the type never appears to shift between items.
  score_txt: { color: "#fff", fontSize: 14, fontWeight: "700" },
  cm_wrap: { flex: 1, overflow: "hidden" },
  cm_copy: { flexDirection: "row" },
  cm_item: { color: "rgba(255,255,255,0.6)", fontSize: 14, marginRight: 24 },
  cm_min: { color: palette.positive, fontWeight: "700", fontSize: 14 },
  dots: { flexDirection: "row", gap: 4 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.2)" },
  dot_on: { backgroundColor: palette.positive },
});
