import { StyleSheet } from "react-native";

import EditScreenInfo from "@/components/EditScreenInfo";
import { Text, View } from "@/components/Themed";
import type { Player, Position } from "@fundxi/core/domain/player/player";

// Smoke check that @fundxi/core resolves from the mobile workspace through
// both tsc (path alias) and Metro (watchFolders). If this file type-checks
// and the bundler boots, the monorepo plumbing is correct.
const sample_position: Position = "FW";
const sample_player_keys: ReadonlyArray<keyof Player> = ["id", "name"];

export default function TabOneScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tab One</Text>
      <Text>
        @fundxi/core ok — position {sample_position}, keys{" "}
        {sample_player_keys.join(", ")}
      </Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      <EditScreenInfo path="app/(tabs)/index.tsx" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
  },
  separator: {
    marginVertical: 30,
    height: 1,
    width: "80%",
  },
});
