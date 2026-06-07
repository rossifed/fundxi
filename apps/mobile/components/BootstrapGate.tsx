import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { init_public_repositories } from "@fundxi/core/infrastructure/repositories/init";
import { get_api_base } from "@fundxi/core/infrastructure/api_client";
import { themes } from "@fundxi/core/design/palette";

import { Logo } from "@/components/Logo";

const palette = themes.dark;

type State = "loading" | "ready" | "error";

interface Props {
  children: React.ReactNode;
}

// Mirrors apps/web/src/ui/shell/BootstrapGate.tsx — primes the public
// repository caches before rendering so the api/application/ui layers can
// stay synchronous. Wraps the whole router tree in apps/mobile/app/_layout.
export function BootstrapGate({ children }: Props) {
  const [state, set_state] = useState<State>("loading");
  const [error, set_error] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    init_public_repositories()
      .then(() => {
        if (!cancelled) set_state("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        set_error(err instanceof Error ? err.message : String(err));
        set_state("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "ready") return <>{children}</>;

  return (
    <View style={styles.fill}>
      {state === "loading" && (
        <>
          <Logo size={46} tagline />
          <ActivityIndicator color="#fff" />
          <Text style={styles.muted}>loading market data…</Text>
        </>
      )}
      {state === "error" && (
        <>
          <Text style={styles.error}>backend unreachable</Text>
          {error && <Text style={styles.muted}>{error}</Text>}
          <Text style={styles.hint}>
            check that the backend is reachable at {get_api_base()}
          </Text>
          <Text style={styles.hint}>
            (Android emulator uses 10.0.2.2, not localhost — set
            EXPO_PUBLIC_API_URL accordingly)
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: palette.bg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 14,
  },
  muted: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    textAlign: "center",
  },
  error: {
    color: palette.negative,
    fontSize: 16,
    fontWeight: "700",
  },
  hint: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    textAlign: "center",
  },
});
