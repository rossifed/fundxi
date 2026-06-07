// Logo — fundXI brand wordmark. Single source for the logo across the app
// (loading gate, auth sheet, Home hero). Renders the real brand wordmark
// (white "Fund" + the custom blue "XI"), extracted to transparency from the
// official logo art — NOT a font re-creation, so the bespoke "XI" geometry is
// 100% faithful. The slogan "EVERY TOUCH HAS A PRICE" is rendered as text
// beneath so it stays editable and crisp at any size.
//
// DDD role: presentational UI component — no data, no I/O.

import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

// Intrinsic size of the extracted wordmark art — drives the aspect ratio.
const WORDMARK = require("../assets/images/logo-wordmark.png");
const WORDMARK_AR = 1037 / 221;

interface Props {
  /** Wordmark height in px (the slogan scales from it). */
  size?: number;
  /** Render the "every touch has a price" slogan beneath the wordmark. */
  tagline?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Logo({ size = 40, tagline = false, style }: Props) {
  return (
    <View style={[styles.wrap, style]}>
      <Image source={WORDMARK} style={{ height: size, aspectRatio: WORDMARK_AR }} resizeMode="contain" />
      {tagline && (
        <View style={[styles.slogan_row, { marginTop: size * 0.34 }]}>
          <View style={styles.rule} />
          <Text style={[styles.slogan, { fontSize: Math.max(9, Math.round(size * 0.24)) }]}>
            Every touch has a price
          </Text>
          <View style={styles.rule} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  slogan_row: { flexDirection: "row", alignItems: "center", gap: 10 },
  rule: { height: 1, width: 26, backgroundColor: "rgba(255,255,255,0.18)" },
  slogan: {
    color: "rgba(255,255,255,0.5)",
    fontWeight: "700",
    letterSpacing: 2.5,
    textTransform: "uppercase",
  },
});
