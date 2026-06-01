// AppBackground — the ambient backdrop, RN parity for the web App shell
// (apps/web/src/ui/shell/App.tsx + ambient_gradient in tokens.ts).
//
// Three stacked layers, mirrored from web:
//   1. solid base `palette.bg` (#020406)
//   2. radial gradient ellipse anchored top-right (85%x60% at 100% 0%),
//      stops grad1 -> grad2 -> grad3 -> grad4 (the purple/blue glow)
//   3. faint full-screen WC backdrop image (~7% opacity)
//
// Web layer 3 uses `mix-blend-mode: screen` to keep only the bright parts of
// the photo; RN core has no blend modes, so a low opacity over the dark base
// is the closest approximation (only the bright stadium/sky reads through).
// Rendered once at the root behind everything; screens are transparent so it
// shows through (see app/_layout.tsx + the per-screen transparent containers).

import { Image, StyleSheet, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { palette } from "@/theme/tokens";

export function AppBackground() {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.bg }]} pointerEvents="none">
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <RadialGradient id="ambient" cx="100%" cy="0%" rx="85%" ry="60%">
            <Stop offset="0" stopColor={palette.grad1} stopOpacity="1" />
            <Stop offset="0.25" stopColor={palette.grad2} stopOpacity="1" />
            <Stop offset="0.65" stopColor={palette.grad3} stopOpacity="1" />
            <Stop offset="1" stopColor={palette.grad4} stopOpacity="1" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#ambient)" />
      </Svg>
      <Image
        source={require("../assets/images/wc-bg.jpg")}
        style={[StyleSheet.absoluteFill, styles.backdrop]}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { opacity: 0.07 },
});
