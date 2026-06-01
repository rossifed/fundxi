import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import 'react-native-reanimated';

import { set_api_base } from '@fundxi/core/infrastructure/api_client';
import { set_stream_base } from '@fundxi/core/infrastructure/stream_client';

import { AppBackground } from '@/components/AppBackground';
import { BootstrapGate } from '@/components/BootstrapGate';
import { OfflineBanner } from '@/components/OfflineBanner';
import { sans } from '@/theme/tokens';

// Transparent navigator backgrounds so the single AppBackground at the root
// shows through every screen (the ambient gradient + faint WC backdrop).
const NAV_THEME = { ...DarkTheme, colors: { ...DarkTheme.colors, background: 'transparent' } };

// Global default type face: Inter for all body text, matching the web
// (globals.css `body { font-family: "Inter" }`). Explicit `mono` styles
// (JetBrains Mono) override per-Text. Fonts are embedded natively by the
// expo-font config plugin (app.json), so they are available immediately.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TextWithDefault = Text as unknown as { defaultProps?: { style?: unknown } };
TextWithDefault.defaultProps = TextWithDefault.defaultProps ?? {};
TextWithDefault.defaultProps.style = [{ fontFamily: sans }, TextWithDefault.defaultProps.style];

// Expo inlines EXPO_PUBLIC_* at build time. @fundxi/core uses a setter so
// the platform-specific env read stays out of `core`.
const api_url = process.env.EXPO_PUBLIC_API_URL;
if (api_url) set_api_base(api_url);
const stream_url_env = process.env.EXPO_PUBLIC_STREAM_URL;
if (stream_url_env) set_stream_base(stream_url_env);

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // Fonts are embedded natively (expo-font config plugin) — nothing to load
  // at runtime, so hide the splash as soon as the tree mounts.
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  // fundxi is dark-only. The ambient backdrop is painted once here, behind a
  // transparent navigator tree, so every screen sits on the same gradient
  // (web parity — the App shell does the same).
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider value={NAV_THEME}>
          <StatusBar style="light" />
          <AppBackground />
          <BootstrapGate>
            <Stack screenOptions={{ contentStyle: { backgroundColor: 'transparent' } }}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            </Stack>
            <OfflineBanner />
          </BootstrapGate>
        </ThemeProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
