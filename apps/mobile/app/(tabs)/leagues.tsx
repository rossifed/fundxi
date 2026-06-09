// Leagues — RN port of apps/web/src/ui/pages/leagues/LeaguesPage.tsx.
//
// Three views like the web (Board / Create / Join). The web gates the whole
// page behind auth; mobile auth is deferred, so this reads against the demo
// backend like the other tabs and surfaces real API errors (no fabricated
// leagues). Invite sharing uses the native Share sheet instead of the web
// clipboard. Single-column layout throughout.

import { useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { leagues_api } from "@fundxi/core/api/leagues_api";
import { portfolio_api } from "@fundxi/core/api/portfolio_api";
import { refresh_leagues, subscribe_leagues } from "@fundxi/core/infrastructure/repositories/leagues_repository";
import { ApiError } from "@fundxi/core/infrastructure/api_client";
import type { League } from "@fundxi/core/domain/league/league";

import { Avatar } from "@/components/Avatar";
import { useLiveRefetch, usePricesLiveVersion } from "@/components/live";
import { useRefresh } from "@/components/use_refresh";
import { color_for_sign, fmt_eur_m, fmt_eur_m_signed, fmt_signed_pct } from "@/lib/format";
import { mono, palette, text } from "@/theme/tokens";

type View_ = "board" | "create" | "join";

export default function LeaguesScreen() {
  const { join } = useLocalSearchParams<{ join?: string }>();
  const [, force] = useState(0);
  const [view, set_view] = useState<View_>(join ? "join" : "board");
  const [active_id, set_active_id] = useState<string | null>(null);
  const [detail, set_detail] = useState<League | null>(null);
  const [detail_state, set_detail_state] = useState<"idle" | "loading" | "error">("idle");
  const [ready, set_ready] = useState(false);
  const [lb_version, set_lb_version] = useState(0);

  useEffect(() => subscribe_leagues(() => force(n => n + 1)), []);
  useEffect(() => {
    void refresh_leagues().finally(() => set_ready(true));
  }, []);

  // Price ticks shift portfolio values → ranks. Refresh on the prices topic.
  useLiveRefetch(usePricesLiveVersion(), () => {
    void refresh_leagues().then(() => set_lb_version(v => v + 1));
  });
  const { refreshing, onRefresh } = useRefresh(() =>
    refresh_leagues().then(() => set_lb_version(v => v + 1)),
  );

  const summaries = leagues_api.list_summaries();
  const selected_id = active_id ?? summaries[0]?.id ?? null;

  useEffect(() => {
    if (!selected_id) {
      set_detail(null);
      return;
    }
    let cancelled = false;
    set_detail_state("loading");
    leagues_api.detail(selected_id).then(
      d => {
        if (cancelled) return;
        set_detail(d);
        set_detail_state("idle");
      },
      () => !cancelled && set_detail_state("error"),
    );
    return () => {
      cancelled = true;
    };
  }, [selected_id, lb_version]);

  if (view === "create") {
    return (
      <CreateView
        on_back={() => set_view("board")}
        on_created={l => {
          set_active_id(l.id);
          set_detail(l);
          set_view("board");
        }}
      />
    );
  }
  if (view === "join") {
    return (
      <JoinView
        initial_code={join ?? ""}
        on_back={() => set_view("board")}
        on_joined={l => {
          set_active_id(l.id);
          set_detail(l);
          set_view("board");
        }}
      />
    );
  }

  if (ready && summaries.length === 0) {
    return (
      <View style={styles.screen}>
        <EmptyShell title="No leagues yet" body="Create a private league to compete with friends, or join one with an invite code." />
        <View style={styles.empty_actions}>
          <ActionButton label="+ Create league" primary on_press={() => set_view("create")} />
          <ActionButton label="Join with code" on_press={() => set_view("join")} />
        </View>
      </View>
    );
  }

  const me = detail?.leaderboard.find(e => e.is_me);
  const next_target = me && detail ? detail.leaderboard.find(e => e.rank === me.rank - 1) : undefined;
  const gap = me && next_target ? next_target.value - me.value : null;
  const totals = portfolio_api.get_totals();
  const positions = portfolio_api.get_holdings().length;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      >
        {/* Your portfolio at a glance — the same value you're ranked on. */}
        <View style={styles.stats_bar}>
          <StatCell label="Value" value={fmt_eur_m(totals.total_value)} sub={fmt_signed_pct(totals.return_pct, 1)} sub_color={color_for_sign(totals.return_pct)} />
          <StatCell label="Cash" value={fmt_eur_m(totals.cash)} />
          <StatCell label="Positions" value={String(positions)} />
          <StatCell label="P&L" value={fmt_eur_m_signed(totals.pnl)} value_color={color_for_sign(totals.pnl)} />
        </View>

        <View style={styles.tabs_row}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
            {summaries.map(l => {
              const active = l.id === selected_id;
              return (
                <Pressable key={l.id} onPress={() => set_active_id(l.id)} style={[styles.league_tab, active && styles.league_tab_on]}>
                  <Avatar seed={l.id} name={l.name} size={22} />
                  <Text style={[styles.league_tab_name, active && styles.league_tab_name_on]}>{l.name}</Text>
                  <Text style={styles.league_tab_count}>{l.member_count}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
        <View style={styles.actions_row}>
          <ActionButton label="+ Create league" primary on_press={() => set_view("create")} />
          <ActionButton label="Join with code" on_press={() => set_view("join")} />
        </View>

        {detail && me && (
          <View style={styles.league_card}>
            <View style={styles.lc_head}>
              <Avatar seed={detail.id} name={detail.name} size={38} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.lc_name} numberOfLines={1}>{detail.name}</Text>
                <Text style={styles.lc_sub} numberOfLines={1}>
                  {detail.description ? `${detail.description} · ` : ""}
                  {detail.leaderboard.length} ranked
                </Text>
              </View>
              <View style={styles.lc_rank_box}>
                <Text style={styles.lc_rank_label}>YOUR RANK</Text>
                <Text style={styles.lc_rank}>
                  #{me.rank}
                  <Text style={styles.lc_rank_total}> /{detail.leaderboard.length}</Text>
                </Text>
                <Text style={[styles.lc_rank_ret, { color: color_for_sign(me.return_pct) }]}>{fmt_signed_pct(me.return_pct, 2)}</Text>
              </View>
            </View>

            {next_target && gap != null && (
              <View style={styles.lc_target}>
                <Text style={styles.lc_target_label}>NEXT TARGET</Text>
                <Text style={styles.lc_target_val} numberOfLines={1}>
                  #{next_target.rank} {next_target.name} · <Text style={styles.lc_target_gap}>{fmt_eur_m(gap)} to overtake</Text>
                </Text>
              </View>
            )}

            <View style={styles.lc_foot}>
              <Text style={styles.lc_foot_item}>
                Your value <Text style={styles.lc_foot_val}>{fmt_eur_m(me.value)}</Text>
              </Text>
              <Text style={styles.lc_foot_item}>
                P&L <Text style={[styles.lc_foot_val, { color: color_for_sign(totals.pnl) }]}>{fmt_eur_m_signed(totals.pnl)}</Text>
              </Text>
            </View>
          </View>
        )}

        {detail && !detail.is_public && detail.invite_code && (
          <Pressable
            onPress={() => void Share.share({ message: `Join my fundXI league with code ${detail.invite_code}` })}
            style={styles.invite_row}
          >
            <Text style={styles.invite_label}>Invite code</Text>
            <Text style={styles.invite_code}>{detail.invite_code}</Text>
            <Text style={styles.invite_share}>Share</Text>
          </Pressable>
        )}

        <View style={styles.card}>
          <View style={styles.lb_head}>
            <Text style={styles.lb_title}>Leaderboard</Text>
            <Text style={styles.lb_count}>{detail ? `${detail.leaderboard.length} ranked` : ""}</Text>
          </View>

          {detail_state === "loading" && <Text style={styles.lb_state}>Loading leaderboard…</Text>}
          {detail_state === "error" && <Text style={[styles.lb_state, { color: palette.negative }]}>Could not load this league.</Text>}

          {detail && detail_state === "idle" && (
            <>
              <View style={[styles.lb_row, styles.lb_header_row]}>
                <Text style={[styles.lb_rank, styles.lb_h]}>Rank</Text>
                <Text style={[styles.lb_trader, styles.lb_h]}>Trader</Text>
                <Text style={[styles.lb_value, styles.lb_h]}>Value</Text>
                <Text style={[styles.lb_return, styles.lb_h]}>Return</Text>
              </View>
              {detail.leaderboard.map(e => (
                <View key={e.rank} style={[styles.lb_row, e.is_me && styles.lb_row_me]}>
                  {e.rank <= 3 ? (
                    <Text style={styles.lb_medal}>{e.rank === 1 ? "🥇" : e.rank === 2 ? "🥈" : "🥉"}</Text>
                  ) : (
                    <Text style={styles.lb_rank}>{e.rank}</Text>
                  )}
                  <View style={styles.lb_trader_cell}>
                    <Avatar seed={e.name} name={e.name} size={26} />
                    <Text style={[styles.lb_name, e.is_me && styles.lb_name_me]} numberOfLines={1}>
                      {e.name}
                    </Text>
                    {e.is_me && <Text style={styles.lb_you}>YOU</Text>}
                  </View>
                  <Text style={styles.lb_value}>{fmt_eur_m(e.value)}</Text>
                  <Text style={[styles.lb_return, { color: color_for_sign(e.return_pct) }]}>{fmt_signed_pct(e.return_pct, 1)}</Text>
                </View>
              ))}
            </>
          )}
        </View>

        {me && (
          <View style={styles.climb}>
            <Text style={styles.climb_title}>📈  Keep climbing</Text>
            <Text style={styles.climb_body}>
              {me.rank === 1
                ? "You're top of the league — defend your lead."
                : next_target && gap != null
                  ? `${fmt_eur_m(gap)} to catch #${next_target.rank} — your next move could flip the spot.`
                  : "Make a move to climb the table."}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function CreateView({ on_back, on_created }: { on_back: () => void; on_created: (l: League) => void }) {
  const [name, set_name] = useState("");
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState<string | null>(null);
  const [created, set_created] = useState<League | null>(null);

  const submit = async () => {
    if (!name.trim()) return;
    set_busy(true);
    set_error(null);
    try {
      set_created(await leagues_api.create(name.trim()));
    } catch (err) {
      set_error(err instanceof ApiError ? err.message : "Could not create the league.");
    } finally {
      set_busy(false);
    }
  };

  if (created) {
    return (
      <View style={styles.screen}>
        <View style={styles.form}>
          <BackLink on_press={on_back} />
          <Text style={styles.created_title}>League created</Text>
          <Text style={styles.created_sub}>{created.name} is ready. Share the code with your friends.</Text>
          <View style={styles.code_box}>
            <Text style={styles.code_label}>INVITE CODE</Text>
            <Text style={styles.code_value}>{created.invite_code}</Text>
          </View>
          <ActionButton
            label="Share invite"
            primary
            full
            on_press={() => void Share.share({ message: `Join my fundXI league with code ${created.invite_code}` })}
          />
          <View style={{ height: 8 }} />
          <ActionButton label="Go to league" full on_press={() => on_created(created)} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.form}>
        <BackLink on_press={on_back} />
        <Text style={styles.form_title}>Create private league</Text>
        <TextInput
          value={name}
          onChangeText={set_name}
          placeholder="League name (e.g. Office League)"
          placeholderTextColor={text.muted}
          maxLength={64}
          style={styles.input}
        />
        {error && <ErrorBanner message={error} />}
        <ActionButton label={busy ? "…" : "Create league"} primary full disabled={busy || !name.trim()} on_press={() => void submit()} />
      </View>
    </View>
  );
}

function JoinView({ initial_code, on_back, on_joined }: { initial_code: string; on_back: () => void; on_joined: (l: League) => void }) {
  const [code, set_code] = useState(initial_code.toUpperCase());
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState<string | null>(null);

  const submit = async () => {
    if (code.trim().length < 4) return;
    set_busy(true);
    set_error(null);
    try {
      on_joined(await leagues_api.join(code.trim()));
    } catch (err) {
      set_error(err instanceof ApiError ? err.message : "Could not join the league.");
    } finally {
      set_busy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.form}>
        <BackLink on_press={on_back} />
        <Text style={styles.form_title}>Join a league</Text>
        <TextInput
          value={code}
          onChangeText={t => set_code(t.toUpperCase())}
          placeholder="INVITE CODE"
          placeholderTextColor={text.muted}
          maxLength={16}
          autoCapitalize="characters"
          style={[styles.input, styles.code_input]}
        />
        {error && <ErrorBanner message={error} />}
        <ActionButton label={busy ? "…" : "Join league"} primary full disabled={busy || code.trim().length < 4} on_press={() => void submit()} />
      </View>
    </View>
  );
}

function StatCell({
  label,
  value,
  value_color,
  sub,
  sub_color,
}: {
  label: string;
  value: string;
  value_color?: string;
  sub?: string;
  sub_color?: string;
}) {
  return (
    <View style={styles.stat_cell}>
      <Text style={styles.stat_label}>{label}</Text>
      <Text style={[styles.stat_value, value_color ? { color: value_color } : null]} numberOfLines={1}>{value}</Text>
      {sub ? <Text style={[styles.stat_sub, sub_color ? { color: sub_color } : null]} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}

function EmptyShell({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.empty_shell}>
      <View style={styles.empty_icon}>
        <Text style={styles.empty_icon_label}>▲</Text>
      </View>
      <Text style={styles.empty_title}>{title}</Text>
      <Text style={styles.empty_body}>{body}</Text>
    </View>
  );
}

function ActionButton({
  label,
  on_press,
  primary = false,
  full = false,
  disabled = false,
}: {
  label: string;
  on_press: () => void;
  primary?: boolean;
  full?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={on_press}
      disabled={disabled}
      style={[
        styles.btn,
        full && styles.btn_full,
        primary ? styles.btn_primary : styles.btn_secondary,
        disabled && styles.btn_disabled,
      ]}
    >
      <Text style={[styles.btn_label, primary ? styles.btn_label_primary : styles.btn_label_secondary, disabled && styles.btn_label_disabled]}>
        {label}
      </Text>
    </Pressable>
  );
}

function BackLink({ on_press }: { on_press: () => void }) {
  return (
    <Pressable onPress={on_press} hitSlop={8}>
      <Text style={styles.back}>← Back</Text>
    </Pressable>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <View style={styles.error}>
      <Text style={styles.error_label}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { padding: 16, gap: 16 },

  tabs_row: { flexDirection: "row" },
  tabs: { flexDirection: "row", gap: 6, paddingRight: 8 },
  league_tab: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", backgroundColor: "rgba(255,255,255,0.02)" },
  league_tab_on: { borderColor: "rgba(255,255,255,0.2)", backgroundColor: "rgba(255,255,255,0.06)" },
  league_tab_name: { fontSize: 12, fontWeight: "500", color: text.tertiary },
  league_tab_name_on: { color: "#fff", fontWeight: "700" },
  league_tab_count: { fontSize: 10, color: text.muted },
  actions_row: { flexDirection: "row", gap: 10 },

  stats_bar: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.025)", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", borderRadius: 12, paddingVertical: 11, paddingHorizontal: 12, gap: 8 },
  stat_cell: { flex: 1, gap: 2, minWidth: 0 },
  stat_label: { fontSize: 9, fontWeight: "700", color: text.tertiary, letterSpacing: 0.4, textTransform: "uppercase" },
  stat_value: { fontFamily: mono, fontSize: 14, fontWeight: "800", color: "#fff" },
  stat_sub: { fontFamily: mono, fontSize: 11, fontWeight: "700", color: text.tertiary },

  league_card: { backgroundColor: "rgba(255,255,255,0.025)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", borderRadius: 14, padding: 14, gap: 12 },
  lc_head: { flexDirection: "row", alignItems: "center", gap: 12 },
  lc_name: { fontSize: 16, fontWeight: "800", color: "#fff" },
  lc_sub: { fontSize: 12, color: text.tertiary, marginTop: 2 },
  lc_rank_box: { alignItems: "flex-end", gap: 1 },
  lc_rank_label: { fontSize: 8, fontWeight: "700", color: text.tertiary, letterSpacing: 0.5 },
  lc_rank: { fontFamily: mono, fontSize: 20, fontWeight: "900", color: "#fff", letterSpacing: -0.5 },
  lc_rank_total: { fontSize: 12, fontWeight: "700", color: text.tertiary },
  lc_rank_ret: { fontFamily: mono, fontSize: 12, fontWeight: "700" },
  lc_target: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)", paddingTop: 10, gap: 2 },
  lc_target_label: { fontSize: 8, fontWeight: "700", color: text.tertiary, letterSpacing: 0.5 },
  lc_target_val: { fontSize: 13, color: text.secondary },
  lc_target_gap: { fontFamily: mono, fontWeight: "700", color: palette.brandBlue },
  lc_foot: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)", paddingTop: 10 },
  lc_foot_item: { fontSize: 12, color: text.tertiary },
  lc_foot_val: { fontFamily: mono, fontSize: 13, fontWeight: "800", color: "#fff" },

  invite_row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 4 },
  invite_label: { fontSize: 12, color: text.tertiary, flex: 1 },

  lb_medal: { width: 36, fontSize: 15, textAlign: "left" },

  climb: { backgroundColor: "rgba(47,107,255,0.08)", borderWidth: 1, borderColor: "rgba(47,107,255,0.2)", borderRadius: 12, padding: 14, gap: 4 },
  climb_title: { fontSize: 12, fontWeight: "800", color: "#fff" },
  climb_body: { fontSize: 12, color: text.secondary, lineHeight: 18 },

  detail_head: { backgroundColor: "rgba(255,255,255,0.025)", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  detail_name: { fontSize: 16, fontWeight: "800", color: "#fff" },
  detail_desc: { fontSize: 12, color: text.tertiary, marginTop: 2 },
  detail_meta: { alignItems: "flex-end", gap: 6 },
  detail_rank: { fontSize: 12, color: text.secondary },
  detail_rank_num: { fontFamily: mono, fontWeight: "700", color: "#fff" },
  detail_rank_total: { color: text.tertiary },
  invite: { flexDirection: "row", alignItems: "center", gap: 8 },
  invite_code: { fontFamily: mono, fontSize: 12, fontWeight: "700", color: palette.positive },
  invite_share: { fontSize: 11, fontWeight: "700", color: text.secondary, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, overflow: "hidden" },

  card: { backgroundColor: "rgba(255,255,255,0.02)", borderWidth: 1, borderColor: "rgba(255,255,255,0.04)", borderRadius: 12, overflow: "hidden" },
  lb_head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  lb_title: { fontSize: 13, fontWeight: "700", color: "#fff" },
  lb_count: { fontSize: 11, color: text.tertiary },
  lb_state: { padding: 24, textAlign: "center", fontSize: 12, color: text.tertiary },

  lb_row: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.025)" },
  lb_header_row: { paddingVertical: 8, borderBottomColor: "rgba(255,255,255,0.04)" },
  lb_row_me: { backgroundColor: "rgba(55,255,99,0.04)" },
  lb_h: { fontSize: 10, fontWeight: "700", color: text.tertiary, letterSpacing: 0.5, textTransform: "uppercase" },
  lb_rank: { fontFamily: mono, width: 36, fontSize: 12, fontWeight: "700", color: text.tertiary },
  lb_trader: { flex: 1 },
  lb_trader_cell: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
  // Name takes all remaining room (and wraps if a name is genuinely long);
  // the YOU badge never shrinks so it can't crush the name. Value/Return are
  // sized for the real data (INITIAL_CASH=100 → small euro figures), not the
  // oversized 96/70 that previously starved the name column.
  lb_name: { fontSize: 13, fontWeight: "500", color: "#fff", flexShrink: 1 },
  lb_name_me: { fontWeight: "700" },
  lb_you: { fontSize: 10, fontWeight: "700", color: palette.positive, flexShrink: 0 },
  lb_value: { fontFamily: mono, width: 72, textAlign: "right", fontSize: 12, color: text.secondary },
  lb_return: { fontFamily: mono, width: 52, textAlign: "right", fontSize: 13, fontWeight: "700" },

  form: { padding: 20, gap: 0, maxWidth: 480, width: "100%", alignSelf: "center" },
  form_title: { fontSize: 16, fontWeight: "800", color: "#fff", marginTop: 18, marginBottom: 16 },
  input: { width: "100%", paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 14, marginBottom: 16 },
  code_input: { fontFamily: mono, fontWeight: "700", letterSpacing: 3, textAlign: "center", fontSize: 18 },
  back: { color: text.tertiary, fontSize: 12, fontWeight: "600" },
  created_title: { fontSize: 18, fontWeight: "800", color: "#fff", textAlign: "center", marginTop: 18 },
  created_sub: { fontSize: 12, color: text.tertiary, textAlign: "center", marginTop: 4, marginBottom: 16 },
  code_box: { backgroundColor: "rgba(55,255,99,0.08)", borderWidth: 1, borderColor: "rgba(55,255,99,0.18)", borderRadius: 12, padding: 16, alignItems: "center", marginBottom: 16 },
  code_label: { fontSize: 11, color: text.tertiary, letterSpacing: 0.5, marginBottom: 4 },
  code_value: { fontFamily: mono, fontSize: 28, fontWeight: "800", color: palette.positive, letterSpacing: 3 },

  error: { padding: 12, backgroundColor: "rgba(255,40,93,0.1)", borderWidth: 1, borderColor: "rgba(255,40,93,0.35)", borderRadius: 8, marginBottom: 12 },
  error_label: { color: palette.negative, fontSize: 13, fontWeight: "600" },

  btn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  btn_full: { width: "100%", paddingVertical: 13 },
  btn_primary: { backgroundColor: palette.actionBuy },
  btn_secondary: { backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  btn_disabled: { backgroundColor: "rgba(255,255,255,0.06)" },
  btn_label: { fontSize: 12, fontWeight: "700" },
  btn_label_primary: { color: "#0d0d0f" },
  btn_label_secondary: { color: text.secondary },
  btn_label_disabled: { color: text.muted },

  empty_actions: { flexDirection: "row", gap: 10, justifyContent: "center", marginTop: 16 },
  empty_shell: { marginTop: 60, marginHorizontal: 16, padding: 28, alignItems: "center", backgroundColor: "rgba(255,255,255,0.02)", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)", borderRadius: 16 },
  empty_icon: { width: 48, height: 48, borderRadius: 14, backgroundColor: "rgba(55,255,99,0.08)", borderWidth: 1, borderColor: "rgba(55,255,99,0.18)", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  empty_icon_label: { color: palette.positive, fontSize: 22, fontWeight: "800" },
  empty_title: { fontSize: 18, fontWeight: "800", color: "#fff", marginBottom: 8, textAlign: "center" },
  empty_body: { fontSize: 13, color: text.secondary, lineHeight: 20, textAlign: "center" },
});
