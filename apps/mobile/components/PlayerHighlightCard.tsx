/* PlayerHighlightCard (mobile) — compact "card of the match" highlight.
 *
 * Web/mobile parity: mirrors apps/web/src/ui/components/PlayerHighlightCard.tsx.
 * Same anatomy (team-colour glow + ghost jersey number behind a bottom-anchored
 * portrait + name scrim, then a labelled stat caption). RN has no text-stroke,
 * so the ghost number is a low-alpha fill of the kit colour instead of an
 * outline — same read, RN-native means.
 */

import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { POSITION_ABBR, type Position } from "@fundxi/core/domain/player/player";
import { mono, palette, text, with_alpha } from "@/theme/tokens";

export interface HighlightCaption {
  label: string;
  value: string;
  sub?: string;
  tone?: "positive" | "negative" | "neutral";
}

interface PlayerHighlightCardProps {
  name: string;
  jersey_number: number;
  position: Position;
  image_path: string | null;
  team_color: string;
  caption: HighlightCaption;
  on_press: () => void;
}

function last_name(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

function tone_color(tone: HighlightCaption["tone"]): string {
  if (tone === "positive") return palette.positive;
  if (tone === "negative") return palette.negative;
  return text.primary;
}

export function PlayerHighlightCard({
  name,
  jersey_number,
  position,
  image_path,
  team_color,
  caption,
  on_press,
}: PlayerHighlightCardProps) {
  const [failed, set_failed] = useState(false);
  const has_photo = image_path !== null && image_path !== "" && !failed;

  return (
    <Pressable style={[styles.card, { shadowColor: team_color }]} onPress={on_press}>
      {/* Hero — kit-colour glow + ghost number behind a bottom portrait. */}
      <View style={styles.hero}>
        <LinearGradient
          colors={[with_alpha(team_color, 0.42), palette.bg]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Text
          style={[
            styles.ghost_number,
            { color: with_alpha(team_color, 0.22) },
            has_photo ? styles.ghost_top : styles.ghost_center,
          ]}
          numberOfLines={1}
        >
          {jersey_number}
        </Text>
        {has_photo ? (
          <Image
            source={{ uri: image_path! }}
            style={styles.photo}
            resizeMode="contain"
            onError={() => set_failed(true)}
          />
        ) : null}
        <View style={styles.pos_chip}>
          <Text style={styles.pos_text}>{POSITION_ABBR[position]}</Text>
        </View>
        {/* Name scrim. */}
        <LinearGradient
          colors={["transparent", with_alpha(palette.bg, 0.98)]}
          locations={[0.35, 1]}
          style={styles.scrim}
        >
          <Text style={styles.name} numberOfLines={1}>
            {last_name(name).toUpperCase()}
          </Text>
        </LinearGradient>
      </View>

      {/* Caption — the highlight reason, with a kit-colour top rule. */}
      <View style={[styles.caption, { borderTopColor: team_color }]}>
        <Text style={styles.caption_label} numberOfLines={1}>
          {caption.label}
        </Text>
        <Text style={[styles.caption_value, { color: tone_color(caption.tone) }]} numberOfLines={1}>
          {caption.value}
        </Text>
        {caption.sub ? (
          <Text style={styles.caption_sub} numberOfLines={1}>
            {caption.sub}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 132,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#0b0c11",
    borderWidth: 1,
    borderColor: with_alpha("#ffffff", 0.07),
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  hero: { height: 116, position: "relative", overflow: "hidden" },
  ghost_number: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    fontFamily: mono,
    fontSize: 70,
    fontWeight: "900",
    letterSpacing: -4,
  },
  ghost_top: { top: -4 },
  ghost_center: { top: 24 },
  photo: { position: "absolute", left: 0, right: 0, bottom: 0, height: "84%", width: "100%" },
  pos_chip: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: "rgba(6,7,12,0.85)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  pos_text: { fontSize: 8.5, fontWeight: "800", letterSpacing: 0.6, color: with_alpha("#ffffff", 0.85) },
  scrim: { position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: 18, paddingHorizontal: 8, paddingBottom: 6 },
  name: { fontSize: 13, fontWeight: "800", letterSpacing: -0.2, color: text.primary },
  caption: { borderTopWidth: 2, paddingHorizontal: 9, paddingTop: 7, paddingBottom: 8 },
  caption_label: { fontSize: 8, fontWeight: "700", letterSpacing: 0.8, color: with_alpha("#ffffff", 0.4) },
  caption_value: { fontFamily: mono, fontSize: 17, fontWeight: "900", letterSpacing: -0.3, marginTop: 2 },
  caption_sub: { fontSize: 9, fontWeight: "600", color: with_alpha("#ffffff", 0.4), marginTop: 1 },
});
