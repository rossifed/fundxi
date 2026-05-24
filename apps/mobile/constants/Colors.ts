// Bridges the Expo template's `Colors` API to the fundxi single-source
// palette in @fundxi/core. fundxi is dark-only on both web and mobile;
// the light slot is kept to keep the Themed components happy but points
// at the same dark palette.

import { themes } from "@fundxi/core/design/palette";

const dark_palette = themes.dark;

const dark_scheme = {
  text: "#fff",
  background: dark_palette.bg,
  tint: dark_palette.brandGreen,
  tabIconDefault: "rgba(255,255,255,0.5)",
  tabIconSelected: "#fff",
};

export default {
  light: dark_scheme,
  dark: dark_scheme,
};
