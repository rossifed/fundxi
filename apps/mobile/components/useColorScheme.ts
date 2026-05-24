import { useColorScheme as useColorSchemeCore } from "react-native";

// fundxi is dark-only on both web and mobile. We still expose the hook
// for the Expo template's Themed components, but coerce `null` (the
// "not yet determined" state) and `undefined` to `dark`.
export const useColorScheme = (): "light" | "dark" => {
  return useColorSchemeCore() ?? "dark";
};
