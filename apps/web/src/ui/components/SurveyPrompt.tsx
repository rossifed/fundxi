import { useEffect, useState } from "react";
import { surveys_api, type SurveyQuestion } from "@fundxi/core/api/surveys_api";
import { Sheet } from "@/ui/components/Sheet";
import { useAuth } from "@/ui/shell/AuthContext";

// Asks a SIGNED-IN user the pending product-research questions, one at a time,
// as a dismissible sheet (same pattern as AnnouncementBanner). Submitting stores
// the answer server-side; closing the sheet records a skip — either way the
// question never reappears for that account on any device. Yes/No are selection
// chips; the single button-styled control is Submit (one primary action per
// dialog). Errors are swallowed — analytics-grade, never blocks the UI.

export function SurveyPrompt() {
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
      .then(items => {
        if (!cancelled) set_queue(items);
      })
      .catch(() => {
        /* non-fatal: surveys are a nicety, never block the app */
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const current = queue[0];
  if (!current) return null;

  const advance = () => {
    set_choice(null);
    set_amount("");
    set_free_text("");
    set_queue(q => q.slice(1));
  };

  const skip = () => {
    surveys_api.skip(current.id).catch(() => {});
    advance();
  };

  const wants_amount = current.kind === "yes_no_amount" && choice === true;
  const amount_value = Number(amount);
  const can_submit =
    current.kind === "text"
      ? free_text.trim().length > 0
      : choice !== null && (!wants_amount || (Number.isFinite(amount_value) && amount_value > 0));

  const submit = () => {
    if (!can_submit) return;
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

  const chip = (selected: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "10px 16px",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 700,
    textAlign: "center",
    cursor: "pointer",
    userSelect: "none",
    border: selected ? "1px solid var(--color-action-buy)" : "1px solid rgba(255,255,255,.14)",
    background: selected ? "color-mix(in srgb, var(--color-action-buy) 16%, transparent)" : "rgba(255,255,255,.04)",
    color: selected ? "var(--color-action-buy)" : "rgba(255,255,255,.75)",
  });

  return (
    <Sheet
      open
      on_close={skip}
      max_width={460}
      footer={
        <button
          type="button"
          onClick={submit}
          disabled={!can_submit}
          style={{
            width: "100%",
            padding: "12px 16px",
            background: "var(--color-action-buy)",
            color: "#0d0d0f",
            border: "none",
            borderRadius: 8,
            fontWeight: 800,
            fontSize: 14,
            cursor: can_submit ? "pointer" : "default",
            opacity: can_submit ? 1 : 0.4,
            fontFamily: "inherit",
          }}
        >
          Submit
        </button>
      }
    >
      <div style={{ padding: "26px 22px 8px", color: "#fff" }}>
        <span
          style={{
            display: "inline-block",
            marginBottom: 10,
            padding: "2px 8px",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            background: "color-mix(in srgb, var(--color-accent) 16%, transparent)",
            color: "var(--color-accent)",
          }}
        >
          Quick question
        </span>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.4 }}>{current.title}</div>
        {current.body && (
          <div
            style={{
              marginTop: 10,
              fontSize: 14,
              lineHeight: 1.55,
              color: "rgba(255,255,255,.8)",
              whiteSpace: "pre-wrap",
            }}
          >
            {current.body}
          </div>
        )}
        {current.kind === "text" ? (
          <textarea
            value={free_text}
            onChange={e => set_free_text(e.target.value)}
            rows={4}
            maxLength={2000}
            style={{
              width: "100%",
              marginTop: 16,
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,.14)",
              background: "rgba(255,255,255,.04)",
              color: "#fff",
              fontSize: 14,
              fontFamily: "inherit",
              resize: "vertical",
            }}
          />
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <div style={chip(choice === true)} onClick={() => set_choice(true)}>
                Yes
              </div>
              <div style={chip(choice === false)} onClick={() => set_choice(false)}>
                No
              </div>
            </div>
            {wants_amount && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.6)", marginBottom: 6 }}>
                  How much? (EUR)
                </div>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={amount}
                  onChange={e => set_amount(e.target.value)}
                  placeholder="e.g. 100"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,.14)",
                    background: "rgba(255,255,255,.04)",
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: 700,
                    fontFamily: "inherit",
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
