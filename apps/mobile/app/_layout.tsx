import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { set_api_base } from '@fundxi/core/infrastructure/api_client';
import { set_stream_base } from '@fundxi/core/infrastructure/stream_client';

import { BootstrapGate } from '@/components/BootstrapGate';
import { OfflineBanner } from '@/components/OfflineBanner';

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
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  // fundxi is dark-only — no React Navigation ThemeProvider needed; our
  // screens read colours directly from @fundxi/core/design/palette.
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style="light" />
        <BootstrapGate>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
          </Stack>
          <OfflineBanner />
        </BootstrapGate>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
