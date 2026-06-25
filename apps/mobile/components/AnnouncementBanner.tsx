// AnnouncementBanner — RN port of apps/web/src/ui/components/AnnouncementBanner.tsx.
// Shows pushed in-app announcements to a SIGNED-IN user, one at a time, as a
// dismissible bottom sheet. "Got it" (or closing) acks the message server-side,
// so it never reappears for that account on any device. Mounted once at the root;
// reads only when authenticated. Errors swallowed — never blocks the UI.

import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { announcements_api, type Announcement } from "@fundxi/core/api/announcements_api";

import { useAuth } from "@/components/AuthContext";
import { palette, text, with_alpha } from "@/theme/tokens";

export function AnnouncementBanner() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [queue, set_queue] = useState<Announcement[]>([]);

  useEffect(() => {
    if (!user) {
      set_queue([]);
      return;
    }
    let cancelled = false;
    announcements_api
      .list()
      .then((items) => {
        if (!cancelled) set_queue(items);
      })
      .catch(() => {
        /* non-fatal */
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const current = queue[0];

  const dismiss = () => {
    if (current) announcements_api.ack(current.id).catch(() => {});
    set_queue((q) => q.slice(1));
  };

  return (
    <Modal visible={!!current} transparent animationType="slide" onRequestClose={dismiss}>
      <Pressable style={styles.backdrop} onPress={dismiss}>
        <Pressable style={[styles.sheet, { paddingBottom: 14 + insets.bottom }]} onPress={() => {}}>
          {current ? (
            <>
              <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
                {current.severity === "important" ? <Text style={styles.badge}>UPDATE</Text> : null}
                <Text style={styles.title}>{current.title}</Text>
                <Text style={styles.body}>{current.body}</Text>
              </ScrollView>
              <Pressable style={styles.cta} onPress={dismiss}>
                <Text style={styles.cta_label}>Got it</Text>
              </Pressable>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: palette.surfaceDeep,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 22,
    paddingTop: 24,
    maxHeight: "85%",
  },
  scroll: { flexGrow: 0 },
  badge: {
    alignSelf: "flex-start",
    marginBottom: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    overflow: "hidden",
    backgroundColor: with_alpha(palette.accent, 0.16),
    color: palette.accent,
  },
  title: { color: "#fff", fontSize: 20, fontWeight: "800", letterSpacing: -0.4 },
  body: { color: text.secondary, fontSize: 14, lineHeight: 21, marginTop: 10 },
  cta: {
    backgroundColor: palette.actionBuy,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 10,
  },
  cta_label: { color: "#04140a", fontSize: 15, fontWeight: "800" },
});
