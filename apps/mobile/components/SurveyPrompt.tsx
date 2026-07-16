// SurveyPrompt — RN port of apps/web/src/ui/components/SurveyPrompt.tsx.
// Asks a SIGNED-IN user the pending product-research questions, one at a time,
// as a dismissible bottom sheet (same pattern as AnnouncementBanner). Submitting
// stores the answer server-side; closing records a skip — either way the question
// never reappears for that account on any device. Yes/No are selection chips; the
// single button-styled control is Submit. Errors swallowed — never blocks the UI.

import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { surveys_api, type SurveyQuestion } from "@fundxi/core/api/surveys_api";

import { useAuth } from "@/components/AuthContext";
import { palette, text, with_alpha } from "@/theme/tokens";

export function SurveyPrompt() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [queue, set_queue] = useState<SurveyQuestion[]>([]);
  const [choice, set_choice] = useState<boolean | null>(null);
  const [amount, set_amount] = useState("");
  const [free_text, set_free_text] = useState("");

  useEffect(() => {
    if (!user) {
      set_queue([]);
      return;
    }
    let cancelled = false;
    surveys_api
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

  const advance = () => {
    set_choice(null);
    set_amount("");
    set_free_text("");
    set_queue((q) => q.slice(1));
  };

  const skip = () => {
    if (current) surveys_api.skip(current.id).catch(() => {});
    advance();
  };

  const wants_amount = current?.kind === "yes_no_amount" && choice === true;
  const amount_value = Number(amount.replace(",", "."));
  const can_submit = current
    ? current.kind === "text"
      ? free_text.trim().length > 0
      : choice !== null && (!wants_amount || (Number.isFinite(amount_value) && amount_value > 0))
    : false;

  const submit = () => {
    if (!current || !can_submit) return;
    surveys_api
      .answer(
        current.id,
        current.kind === "text"
          ? { answer_text: free_text.trim() }
          : { answer_bool: choice ?? undefined, answer_amount: wants_amount ? amount_value : undefined },
      )
      .catch(() => {});
    advance();
  };

  return (
    <Modal visible={!!current} transparent animationType="slide" onRequestClose={skip}>
      <Pressable style={styles.backdrop} onPress={skip}>
        <Pressable style={[styles.sheet, { paddingBottom: 14 + insets.bottom }]} onPress={() => {}}>
          {current ? (
            <>
              <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll} keyboardShouldPersistTaps="handled">
                <Text style={styles.badge}>QUICK QUESTION</Text>
                <Text style={styles.title}>{current.title}</Text>
                {current.body ? <Text style={styles.body}>{current.body}</Text> : null}
                {current.kind === "text" ? (
                  <TextInput
                    style={[styles.input, styles.textarea]}
                    value={free_text}
                    onChangeText={set_free_text}
                    multiline
                    maxLength={2000}
                    placeholderTextColor={text.tertiary}
                  />
                ) : (
                  <>
                    <View style={styles.chips}>
                      <Pressable
                        style={[styles.chip, choice === true && styles.chip_selected]}
                        onPress={() => set_choice(true)}
                      >
                        <Text style={[styles.chip_label, choice === true && styles.chip_label_selected]}>Yes</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.chip, choice === false && styles.chip_selected]}
                        onPress={() => set_choice(false)}
                      >
                        <Text style={[styles.chip_label, choice === false && styles.chip_label_selected]}>No</Text>
                      </Pressable>
                    </View>
                    {wants_amount ? (
                      <View style={styles.amount_block}>
                        <Text style={styles.amount_label}>How much? (EUR)</Text>
                        <TextInput
                          style={styles.input}
                          value={amount}
                          onChangeText={set_amount}
                          keyboardType="decimal-pad"
                          placeholder="e.g. 100"
                          placeholderTextColor={text.tertiary}
                        />
                      </View>
                    ) : null}
                  </>
                )}
              </ScrollView>
              <Pressable style={[styles.cta, !can_submit && styles.cta_disabled]} onPress={submit}>
                <Text style={styles.cta_label}>Submit</Text>
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
  chips: { flexDirection: "row", gap: 10, marginTop: 16 },
  chip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
  },
  chip_selected: {
    borderColor: palette.actionBuy,
    backgroundColor: with_alpha(palette.actionBuy, 0.16),
  },
  chip_label: { color: "rgba(255,255,255,0.75)", fontSize: 14, fontWeight: "700" },
  chip_label_selected: { color: palette.actionBuy },
  amount_block: { marginTop: 12 },
  amount_label: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "700", marginBottom: 6 },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.04)",
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  textarea: { marginTop: 16, minHeight: 90, textAlignVertical: "top", fontWeight: "400" },
  cta: {
    backgroundColor: palette.actionBuy,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 10,
  },
  cta_disabled: { opacity: 0.4 },
  cta_label: { color: "#04140a", fontSize: 15, fontWeight: "800" },
});
