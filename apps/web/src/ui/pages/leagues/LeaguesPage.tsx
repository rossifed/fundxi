import { useEffect, useRef, useState, type FormEvent } from "react";
import { color_for_sign, fmt_eur_m, fmt_eur_m_cash, fmt_eur_m_signed, fmt_signed_pct } from "@/ui/helpers/format";
import { leagues_api } from "@fundxi/core/api/leagues_api";
import { portfolio_api } from "@fundxi/core/api/portfolio_api";
import { refresh_leagues, subscribe_leagues } from "@fundxi/core/infrastructure/repositories/leagues_repository";
import { ApiError } from "@fundxi/core/infrastructure/api_client";
import { Avatar } from "@/ui/components/Avatar";
import { useAuth } from "@/ui/shell/AuthContext";
import { useLiveRefetch, usePricesLiveVersion } from "@/ui/hooks/use_live_updates";
import { useViewport } from "@/ui/hooks/use_viewport";
import type { League } from "@fundxi/core/domain/league/league";

type View = "board" | "create" | "join";

interface LeaguesPageProps {
  initial_join_code?: string | null;
}

export function LeaguesPage({ initial_join_code }: LeaguesPageProps = {}) {
  const { status } = useAuth();
  const { is_mobile } = useViewport();
  // Narrower Value/Return columns on a phone so the trader name has room.
  const board_cols = is_mobile ? "26px 1fr 76px 60px" : "40px 1fr 110px 90px";
  const [, force] = useState(0);
  const [view, set_view] = useState<View>(initial_join_code ? "join" : "board");
  const [active_id, set_active_id] = useState<string | null>(null);
  const [detail, set_detail] = useState<League | null>(null);
  const [detail_state, set_detail_state] = useState<"idle" | "loading" | "error">("idle");

  // Re-render when the cached summary list changes (after create/join).
  useEffect(() => subscribe_leagues(() => force(n => n + 1)), []);

  // Live coherence: a price tick changes every member's portfolio
  // value (cash + sum shares * latest_price), which can shift ranks.
  // Throttle to once per 5s — prices tick ~5/s during a live match,
  // and a re-fetch on every tick would hammer /api/leagues/mine for
  // little user value (ranks don't change that fast). Trailing edge
  // is fine: the user pulls the latest state on their next click.
  const last_refresh_ts = useRef(0);
  const [leaderboard_version, set_leaderboard_version] = useState(0);
  useLiveRefetch(usePricesLiveVersion(), () => {
    const now = Date.now();
    if (now - last_refresh_ts.current < 5000) return;
    last_refresh_ts.current = now;
    void refresh_leagues().then(() => set_leaderboard_version(v => v + 1));
  });

  const summaries = leagues_api.list_summaries();
  const selected_id = active_id ?? summaries[0]?.id ?? null;

  // Fetch the full leaderboard for the selected league on demand;
  // re-fetch whenever ``leaderboard_version`` ticks (price-driven).
  useEffect(() => {
    if (status !== "authenticated" || !selected_id) {
      set_detail(null);
      return;
    }
    let cancelled = false;
    set_detail_state("loading");
    leagues_api
      .detail(selected_id)
      .then(d => {
        if (cancelled) return;
        set_detail(d);
        set_detail_state("idle");
      })
      .catch(() => {
        if (cancelled) return;
        set_detail_state("error");
      });
    return () => {
      cancelled = true;
    };
  }, [selected_id, status, leaderboard_version]);

  if (status === "loading") {
    return <EmptyShell title="Loading…" body="Resolving your session." />;
  }
  if (status === "anonymous") {
    return (
      <EmptyShell
        title="Sign in to access leagues"
        body="Create a private league with friends or join one with an invite code. Sign in or create an account from the top right to get started."
      />
    );
  }

  if (view === "create") {
    return (
      <CreateLeagueView
        on_back={() => set_view("board")}
        on_created={league => {
          set_active_id(league.id);
          set_detail(league);
          set_view("board");
        }}
      />
    );
  }

  if (view === "join") {
    return (
      <JoinLeagueView
        initial_code={initial_join_code ?? ""}
        on_back={() => set_view("board")}
        on_joined={league => {
          set_active_id(league.id);
          set_detail(league);
          set_view("board");
        }}
      />
    );
  }

  if (summaries.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <EmptyShell
          title="No leagues yet"
          body="You are not in any league. Create a private league to compete with friends, or join one with an invite code."
        />
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <ActionButton label="+ Create league" primary on_click={() => set_view("create")} />
          <ActionButton label="Join with code" on_click={() => set_view("join")} />
        </div>
      </div>
    );
  }

  const me = detail?.leaderboard.find(e => e.is_me);
  const next_target = me && detail ? detail.leaderboard.find(e => e.rank === me.rank - 1) : undefined;
  const gap = me && next_target ? next_target.value - me.value : null;
  const totals = portfolio_api.get_totals();
  const positions = portfolio_api.get_holdings().length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Your portfolio at a glance — the same value you're ranked on. */}
      <div style={{ display: "flex", gap: 8, background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.05)", borderRadius: 12, padding: "11px 12px" }}>
        <StatCell label="Value" value={fmt_eur_m(totals.total_value)} sub={fmt_signed_pct(totals.return_pct, 1)} sub_color={color_for_sign(totals.return_pct)} />
        <StatCell label="Cash" value={fmt_eur_m_cash(totals.cash)} />
        <StatCell label="Positions" value={String(positions)} />
        <StatCell label="P&L" value={fmt_eur_m_signed(totals.pnl)} value_color={color_for_sign(totals.pnl)} />
      </div>

      {/* League switcher */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
        {summaries.map(l => {
          const active = l.id === selected_id;
          return (
            <button
              key={l.id}
              onClick={() => set_active_id(l.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 14px",
                borderRadius: 10,
                border: active ? "1px solid rgba(255,255,255,.2)" : "1px solid rgba(255,255,255,.06)",
                background: active ? "rgba(255,255,255,.06)" : "rgba(255,255,255,.02)",
                cursor: "pointer",
                fontFamily: "inherit",
                flexShrink: 0,
                color: active ? "#fff" : "rgba(255,255,255,.45)",
              }}
            >
              <Avatar seed={l.id} name={l.name} size={22} />
              <span style={{ fontSize: 12, fontWeight: active ? 700 : 500 }}>{l.name}</span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,.3)" }}>{l.member_count}</span>
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <ActionButton label="+ Create league" primary on_click={() => set_view("create")} />
        <ActionButton label="Join with code" on_click={() => set_view("join")} />
      </div>

      {/* League card — identity + your standing, next target, and footer. */}
      {detail && me && (
        <div
          style={{
            background: "rgba(255,255,255,.025)",
            border: "1px solid rgba(255,255,255,.06)",
            borderRadius: 14,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar seed={detail.id} name={detail.name} size={38} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {detail.name}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.45)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {detail.description ? `${detail.description} · ` : ""}
                {detail.leaderboard.length} ranked
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,.35)", letterSpacing: 0.5 }}>YOUR RANK</div>
              <div className="mono" style={{ fontSize: 20, fontWeight: 900, letterSpacing: -0.5 }}>
                #{me.rank}
                <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.35)" }}> /{detail.leaderboard.length}</span>
              </div>
              <div className="mono" style={{ fontSize: 12, fontWeight: 700, color: color_for_sign(me.return_pct) }}>
                {fmt_signed_pct(me.return_pct, 1)}
              </div>
            </div>
          </div>

          {next_target && gap != null && (
            <div style={{ borderTop: "1px solid rgba(255,255,255,.06)", paddingTop: 10 }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,.35)", letterSpacing: 0.5, marginBottom: 2 }}>NEXT TARGET</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,.55)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                #{next_target.rank} {next_target.name} ·{" "}
                <span className="mono" style={{ fontWeight: 700, color: "var(--color-brand-blue)" }}>{fmt_eur_m(gap)} to overtake</span>
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,.06)", paddingTop: 10 }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.45)" }}>
              Your value <span className="mono" style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>{fmt_eur_m(me.value)}</span>
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.45)" }}>
              P&amp;L <span className="mono" style={{ fontSize: 13, fontWeight: 800, color: color_for_sign(totals.pnl) }}>{fmt_eur_m_signed(totals.pnl)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Invite row (private leagues) */}
      {detail && !detail.is_public && detail.invite_code && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 4px" }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,.45)", flex: 1 }}>Invite code</span>
          <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: "var(--color-positive)" }}>{detail.invite_code}</span>
          <CopyButton text={detail.invite_code} label="Copy" />
          <CopyButton text={invite_link(detail.invite_code)} label="Copy link" />
        </div>
      )}

      <div
        style={{
          background: "rgba(255,255,255,.02)",
          border: "1px solid rgba(255,255,255,.04)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid rgba(255,255,255,.05)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700 }}>Leaderboard</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,.35)" }}>
            {detail ? `${detail.leaderboard.length} ranked` : ""}
          </span>
        </div>

        {detail_state === "loading" && (
          <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 12, color: "rgba(255,255,255,.35)" }}>
            Loading leaderboard…
          </div>
        )}
        {detail_state === "error" && (
          <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 12, color: "var(--color-negative)" }}>
            Could not load this league.
          </div>
        )}

        {detail && detail_state === "idle" && (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: board_cols,
                padding: "8px 16px",
                borderBottom: "1px solid rgba(255,255,255,.04)",
                fontSize: 10,
                fontWeight: 700,
                color: "rgba(255,255,255,.35)",
                letterSpacing: 0.5,
                textTransform: "uppercase",
                gap: 8,
              }}
            >
              <span>Rank</span>
              <span>Trader</span>
              <span style={{ textAlign: "right" }}>Value</span>
              <span style={{ textAlign: "right" }}>Return</span>
            </div>
            {detail.leaderboard.map(entry => (
              <div
                key={entry.rank}
                style={{
                  display: "grid",
                  gridTemplateColumns: board_cols,
                  padding: "10px 16px",
                  borderBottom: "1px solid rgba(255,255,255,.025)",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  background: entry.is_me ? "color-mix(in srgb, var(--color-positive) 4%, transparent)" : "transparent",
                }}
              >
                {entry.rank <= 3 ? (
                  <span style={{ fontSize: 15 }}>{entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : "🥉"}</span>
                ) : (
                  <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.35)" }}>
                    {entry.rank}
                  </span>
                )}
                <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <Avatar seed={entry.name} name={entry.name} size={26} />
                  {/* minWidth:0 + ellipsis so a long name truncates instead of
                      blowing out the grid and shoving Value/Return off-screen. */}
                  <span style={{ fontWeight: entry.is_me ? 700 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
                    {entry.name}
                  </span>
                  {entry.is_me && (
                    <span style={{ fontSize: 10, color: "var(--color-positive)", fontWeight: 700, flexShrink: 0 }}>YOU</span>
                  )}
                </span>
                <span className="mono" style={{ textAlign: "right", color: "rgba(255,255,255,.55)" }}>
                  {fmt_eur_m(entry.value)}
                </span>
                <span className="mono" style={{ textAlign: "right", fontWeight: 700, color: color_for_sign(entry.return_pct) }}>
                  {fmt_signed_pct(entry.return_pct, 1)}
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Keep climbing — same motivational nudge as mobile. */}
      {me && (
        <div style={{ background: "var(--color-accent-blue-soft)", border: "1px solid color-mix(in srgb, var(--color-accent-blue) 20%, transparent)", borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4 }}>📈  Keep climbing</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.55)", lineHeight: 1.5 }}>
            {me.rank === 1
              ? "You're top of the league — defend your lead."
              : next_target && gap != null
                ? `${fmt_eur_m(gap)} to catch #${next_target.rank} — your next move could flip the spot.`
                : "Make a move to climb the table."}
          </div>
        </div>
      )}
    </div>
  );
}

// Compact portfolio stat (Value / Cash / Positions / P&L), mirroring the mobile
// leagues header bar.
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
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.35)", letterSpacing: 0.4, textTransform: "uppercase" }}>{label}</span>
      <span className="mono" style={{ fontSize: 14, fontWeight: 800, color: value_color ?? "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
      {sub ? <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: sub_color ?? "rgba(255,255,255,.35)", whiteSpace: "nowrap" }}>{sub}</span> : null}
    </div>
  );
}

function CreateLeagueView({
  on_back,
  on_created,
}: {
  on_back: () => void;
  on_created: (league: League) => void;
}) {
  const [name, set_name] = useState("");
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState<string | null>(null);
  const [created, set_created] = useState<League | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    set_busy(true);
    set_error(null);
    try {
      const league = await leagues_api.create(name.trim());
      set_created(league);
    } catch (err) {
      set_error(err instanceof ApiError ? err.message : "Could not create the league.");
    } finally {
      set_busy(false);
    }
  };

  if (created) {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", animation: "fu .2s ease" }}>
        <BackLink on_click={on_back} />
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>League created</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.35)", marginBottom: 16 }}>
            {created.name} is ready. Share the code with your friends.
          </div>
          <div
            style={{
              background: "color-mix(in srgb, var(--color-positive) 8%, transparent)",
              border: "1px solid color-mix(in srgb, var(--color-positive) 18%, transparent)",
              borderRadius: 12,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", marginBottom: 4, letterSpacing: 0.5 }}>
              INVITE CODE
            </div>
            <div
              className="mono"
              style={{ fontSize: 28, fontWeight: 800, color: "var(--color-positive)", letterSpacing: 3 }}
            >
              {created.invite_code}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <CopyButton text={created.invite_code ?? ""} label="Copy code" full />
            <CopyButton text={invite_link(created.invite_code ?? "")} label="Copy invite link" full />
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.3)", marginBottom: 16, lineHeight: 1.5 }}>
            Share the link with a friend — opening it pre-fills the join screen
            (they still need an account to join).
          </div>
          <ActionButton label="Go to league" primary full on_click={() => on_created(created)} />
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ maxWidth: 480, margin: "0 auto", animation: "fu .2s ease" }}>
      <BackLink on_click={on_back} />
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Create private league</div>
      <input
        value={name}
        onChange={e => set_name(e.target.value)}
        placeholder="League name (e.g. Office League)"
        maxLength={64}
        style={text_input}
      />
      {error && <ErrorBanner message={error} />}
      <ActionButton
        label={busy ? "…" : "Create league"}
        primary
        full
        disabled={busy || !name.trim()}
        type="submit"
      />
    </form>
  );
}

function JoinLeagueView({
  initial_code,
  on_back,
  on_joined,
}: {
  initial_code: string;
  on_back: () => void;
  on_joined: (league: League) => void;
}) {
  const [code, set_code] = useState(initial_code);
  const [busy, set_busy] = useState(false);
  const [error, set_error] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (code.trim().length < 4) return;
    set_busy(true);
    set_error(null);
    try {
      const league = await leagues_api.join(code.trim());
      on_joined(league);
    } catch (err) {
      set_error(err instanceof ApiError ? err.message : "Could not join the league.");
    } finally {
      set_busy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ maxWidth: 480, margin: "0 auto", animation: "fu .2s ease" }}>
      <BackLink on_click={on_back} />
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>Join a league</div>
      <input
        value={code}
        onChange={e => set_code(e.target.value.toUpperCase())}
        placeholder="INVITE CODE"
        maxLength={16}
        style={{
          ...text_input,
          fontFamily: "'JetBrains Mono',monospace",
          fontWeight: 700,
          letterSpacing: 3,
          textAlign: "center",
          fontSize: 18,
        }}
      />
      {error && <ErrorBanner message={error} />}
      <ActionButton
        label={busy ? "…" : "Join league"}
        primary
        full
        disabled={busy || code.trim().length < 4}
        type="submit"
      />
    </form>
  );
}

function invite_link(code: string): string {
  if (typeof window === "undefined") return code;
  return `${window.location.origin}/?join=${encodeURIComponent(code)}`;
}

function CopyButton({
  text,
  label,
  full = false,
}: {
  text: string;
  label: string;
  full?: boolean;
}) {
  const [copied, set_copied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      set_copied(true);
      window.setTimeout(() => set_copied(false), 1800);
    } catch {
      // Clipboard blocked (insecure context / permission) — select-fallback
      // is overkill here; the code is visible on screen to copy by hand.
      set_copied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      style={{
        width: full ? "100%" : undefined,
        padding: full ? "12px 0" : "8px 12px",
        fontSize: 12,
        fontWeight: 700,
        borderRadius: 10,
        background: copied ? "color-mix(in srgb, var(--color-positive) 14%, transparent)" : "rgba(255,255,255,.05)",
        color: copied ? "var(--color-positive)" : "rgba(255,255,255,.7)",
        border: copied ? "1px solid color-mix(in srgb, var(--color-positive) 30%, transparent)" : "1px solid rgba(255,255,255,.08)",
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "background .12s, color .12s",
      }}
    >
      {copied ? "Copied!" : label}
    </button>
  );
}

function BackLink({ on_click }: { on_click: () => void }) {
  return (
    <button
      type="button"
      onClick={on_click}
      style={{
        background: "transparent",
        border: "none",
        color: "rgba(255,255,255,.45)",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit",
        padding: 0,
        marginBottom: 18,
      }}
    >
      ← Back
    </button>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        padding: "10px 12px",
        background: "color-mix(in srgb, var(--color-negative) 10%, transparent)",
        border: "1px solid color-mix(in srgb, var(--color-negative) 35%, transparent)",
        borderRadius: 8,
        color: "var(--color-negative)",
        fontSize: 13,
        fontWeight: 600,
        marginBottom: 12,
      }}
    >
      {message}
    </div>
  );
}

function ActionButton({
  label,
  on_click,
  primary = false,
  full = false,
  disabled = false,
  type = "button",
}: {
  label: string;
  on_click?: () => void;
  primary?: boolean;
  full?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={on_click}
      disabled={disabled}
      style={{
        width: full ? "100%" : undefined,
        padding: full ? "13px 0" : "10px 14px",
        fontSize: full ? 13 : 12,
        fontWeight: 700,
        borderRadius: 10,
        background: primary
          ? disabled
            ? "rgba(255,255,255,.06)"
            : "var(--color-action-buy)"
          : "rgba(255,255,255,.04)",
        color: primary ? (disabled ? "rgba(255,255,255,.3)" : "#0d0d0f") : "rgba(255,255,255,.7)",
        border: primary ? "none" : "1px solid rgba(255,255,255,.06)",
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        flexShrink: 0,
      }}
    >
      {label}
    </button>
  );
}

const text_input: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(255,255,255,.04)",
  border: "1px solid rgba(255,255,255,.06)",
  color: "#fff",
  fontSize: 14,
  fontFamily: "'Inter',sans-serif",
  outline: "none",
  marginBottom: 16,
};

interface EmptyShellProps {
  title: string;
  body: string;
}

function EmptyShell({ title, body }: EmptyShellProps) {
  return (
    <div
      style={{
        maxWidth: 520,
        margin: "60px auto 0",
        padding: "32px 28px",
        textAlign: "center",
        background: "rgba(255,255,255,.02)",
        border: "1px solid rgba(255,255,255,.05)",
        borderRadius: 16,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          background: "color-mix(in srgb, var(--color-positive) 8%, transparent)",
          border: "1px solid color-mix(in srgb, var(--color-positive) 18%, transparent)",
          color: "var(--color-positive)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22,
          fontWeight: 800,
          margin: "0 auto 14px",
        }}
      >
        ▲
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 8 }}>{title}</div>
      <div
        style={{
          fontSize: 13,
          color: "rgba(255,255,255,.5)",
          lineHeight: 1.6,
          maxWidth: 420,
          margin: "0 auto",
        }}
      >
        {body}
      </div>
    </div>
  );
}
