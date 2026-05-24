import { StyleSheet, Text, View } from "react-native";

import { themes } from "@fundxi/core/design/palette";

const palette = themes.dark;

interface PlaceholderScreenProps {
  title: string;
  message?: string;
}

export function PlaceholderScreen({ title, message }: PlaceholderScreenProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  title: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 8,
  },
  message: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
    lineHeight: 20,
  },
});
