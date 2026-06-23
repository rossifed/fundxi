// HowToPlay — onboarding overlay. RN port of
// apps/web/src/ui/components/HowToPlay.tsx: a floating "?" launcher + a
// "How fundXI works" bottom sheet (same copy, same sections). Pure presentation:
// reads no data and touches no other screen, mounted once at the root layout, so
// it has zero impact on the rest of the app.
//
// First-run persistence trade-off: web stores a "seen" flag in localStorage
// (shows once, ever). RN has no zero-dependency durable store wired here, so we
// gate on an in-memory module flag (shows once per cold launch), then only on
// demand via the "?". Swapping this single flag for
// @react-native-async-storage/async-storage upgrades it to "once, ever" to match
// web exactly, the day a native dependency is acceptable.

import { useEffect, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { palette, surface, text, with_alpha } from "@/theme/tokens";

// Module-level: survives tab navigation within one app launch, resets only on a
// full cold restart. See the header note on the persistence trade-off.
let auto_shown = false;

export function HowToPlay() {
  const insets = useSafeAreaInsets();
  const [open, set_open] = useState(false);

  useEffect(() => {
    if (!auto_shown) {
      auto_shown = true;
      set_open(true);
    }
  }, []);

  return (
    <>
      <Pressable
        accessibilityLabel="How to play"
        onPress={() => set_open(true)}
        style={[styles.fab, { bottom: 88 + insets.bottom }]}
      >
        <Text style={styles.fab_q}>?</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => set_open(false)}>
        <Pressable style={styles.backdrop} onPress={() => set_open(false)}>
          {/* Stop propagation so taps inside the sheet don't dismiss it. */}
          <Pressable style={[styles.sheet, { paddingBottom: 14 + insets.bottom }]} onPress={() => {}}>
            <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
              <Text style={styles.title}>How fundXI works</Text>
              <Text style={styles.subtitle}>New here? Here is the game in one minute.</Text>

              <Step
                n={1}
                title="The goal"
                body="You start with play money in euros, shown in millions (like €10M). You spend it on shares of real World Cup players, like tiny stocks. When your players do well, their value rises and you climb your league."
              />

              <Step n={2} title="How to play">
                <Bullet label="Buy" body="open a player and tap Buy, then choose how much of your cash to put in." />
                <Bullet
                  label="Buy many"
                  body="in the Screener, filter the list and buy all of them at once. Or open a team and buy the whole squad in one tap."
                />
                <Bullet label="Sell" body="tap Sell any time to bank a gain or stop a loss." />
              </Step>

              <Step n={3} title="When prices move">
                <View style={{ gap: 8, marginTop: 8 }}>
                  <Pill tone="up" label="Goes up" body="he scores, makes an assist, plays well, or his team wins." />
                  <Pill tone="down" label="Goes down" body="he plays badly, sits on the bench, or his team goes out." />
                </View>
                <Text style={styles.note}>During a live match, prices move in real time. That is the fun part.</Text>
              </Step>

              <Step n={4} title="The five tabs">
                <Bullet label="Home" body="what is hot right now: news and the biggest movers." />
                <Bullet label="Screener" body="the full list of players. Search and filter to find who to buy." />
                <Bullet label="Fixtures" body="the match schedule. Tap a match to follow it live." />
                <Bullet label="Portfolio" body="your players, your cash, and how you are doing." />
                <Bullet label="Leagues" body="create or join a league to play against your friends." />
              </Step>

              <View style={styles.start}>
                <Text style={styles.start_text}>
                  <Text style={styles.start_bold}>Start here: </Text>
                  open the Screener, pick two or three players you like, then watch their matches.
                </Text>
              </View>
            </ScrollView>

            <Pressable style={styles.cta} onPress={() => set_open(false)}>
              <Text style={styles.cta_label}>Got it, let's play</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function Step({ n, title, body, children }: { n: number; title: string; body?: string; children?: ReactNode }) {
  return (
    <View style={styles.step}>
      <View style={styles.step_num}>
        <Text style={styles.step_num_text}>{n}</Text>
      </View>
      <View style={styles.step_main}>
        <Text style={styles.step_title}>{title}</Text>
        {body ? <Text style={styles.step_body}>{body}</Text> : null}
        {children}
      </View>
    </View>
  );
}

// One labelled line (bold label, then plain text) used by the "How to play"
// actions and the "five tabs" guide.
function Bullet({ label, body }: { label: string; body: string }) {
  return (
    <Text style={styles.bullet}>
      <Text style={styles.bullet_label}>{label} </Text>
      {body}
    </Text>
  );
}

function Pill({ tone, label, body }: { tone: "up" | "down"; label: string; body: string }) {
  const c = tone === "up" ? palette.positive : palette.negative;
  return (
    <View style={styles.pill_row}>
      <Text style={[styles.pill, { backgroundColor: with_alpha(c, 0.14), color: c }]}>{label}</Text>
      <Text style={styles.pill_body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 16,
    zIndex: 50,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: surface.active,
    borderWidth: 1,
    borderColor: palette.brandGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  fab_q: { color: palette.brandGreen, fontSize: 20, fontWeight: "800" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: palette.surfaceDeep,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 22,
    paddingTop: 24,
    maxHeight: "90%",
  },
  scroll: { flexGrow: 0 },
  title: { color: "#fff", fontSize: 22, fontWeight: "800", letterSpacing: -0.4 },
  subtitle: { color: text.secondary, fontSize: 13, marginTop: 4, marginBottom: 18 },
  step: { flexDirection: "row", gap: 12, marginBottom: 16 },
  step_num: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: with_alpha(palette.positive, 0.14),
    alignItems: "center",
    justifyContent: "center",
  },
  step_num_text: { color: palette.positive, fontSize: 13, fontWeight: "800" },
  step_main: { flex: 1 },
  step_title: { color: "#fff", fontSize: 15, fontWeight: "700" },
  step_body: { color: text.secondary, fontSize: 13, marginTop: 3, lineHeight: 19 },
  note: { color: text.secondary, fontSize: 13, marginTop: 10, lineHeight: 19 },
  bullet: { color: text.secondary, fontSize: 13, lineHeight: 19, marginTop: 6 },
  bullet_label: { color: "#fff", fontWeight: "700" },
  pill_row: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    fontSize: 11,
    fontWeight: "800",
    overflow: "hidden",
  },
  pill_body: { flex: 1, color: text.secondary, fontSize: 13, lineHeight: 19 },
  start: {
    marginTop: 2,
    marginBottom: 16,
    padding: 12,
    backgroundColor: surface.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 10,
  },
  start_text: { color: text.secondary, fontSize: 13, lineHeight: 19 },
  start_bold: { color: "#fff", fontWeight: "800" },
  cta: {
    backgroundColor: palette.actionBuy,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 6,
  },
  cta_label: { color: "#04140a", fontSize: 15, fontWeight: "800" },
});
