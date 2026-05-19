# match_comment.is_goal — why the provider flag is discarded

Date: 2026-05-19. Trigger: the ⚽ icon appeared on commentary lines that
are not goals (free kicks, fouls, cards).

## Root cause

`MatchView.tsx` renders ⚽ strictly when `comment.is_goal` is true. The
projector took `is_goal` verbatim from Sportmonks
(`bool(payload.get("is_goal"))`). The provider flag is wrong in BOTH
directions in the WC2022 archive (fixture 65, ARG-FRA final, raw
`/fixtures/18452325`):

- **False positives** — `is_goal=true` on: "Olivier Giroud won a free
  kick in attack" (23'), "Fouled by Jules Koundé" (36'), "won a free
  kick on the right wing" (80'), "receive yellow card for hand ball"
  (108').
- **False negatives** — `is_goal=false` on the real goal lines: "Goal!
  Argentina 1, France 0. Lionel Messi converts the penalty" (21'),
  Di María (28'), Mbappé (74' x2, 103' assist, 113', 118' ET), the
  whole shootout.

Confirmed against the raw archived payload (`raw.sportmonks_event`):
Sportmonks itself sends these wrong values — ingestion is faithful, the
bug is the semantic assumption.

`core.match_event` goal/penalty rows are ALSO misaligned for this
replayed fixture (events at 23/36/80/81/108/118 — the polluted minutes,
not the real goals), so cross-referencing events was rejected: it would
corroborate equally-bad data.

## The reliable signal: the comment text

Sportmonks' own commentary text is deterministic and authoritative:

| Pattern | Meaning | Decision |
|---|---|---|
| `Goal! <t> x, <t> y. <scorer> ...` | open play / penalty / shootout | goal |
| `Own Goal by <player>, <team>.` | own goal (never starts `Goal!`) | goal |
| `GOAL OVERTURNED BY VAR: ...` | disallowed (no `!`) | not a goal |
| `Goalkeeper ...`, `Goal Kick ...` | not a goal | not a goal |

Global counts (all fixtures): 218 lines start `Goal!`/`Own Goal by`;
**0** of the `Goal!%` lines contain overturn/disallow/ruled-out/cancel;
1 `Own Goal by`. The provider `is_goal` disagrees with the text on ~26
lines.

## Rule (implemented)

`is_goal := text.strip().lower() startswith "goal!" OR "own goal by"`

Pure function `is_goal_comment` in
`src/infrastructure/sportmonks/projectors/match_comment.py`. The
provider boolean is ignored. Granularity = exact goal line (each goal's
own line, incl. shootout prose duplicates — all legitimately goal
lines). No schema change; fixes every consumer (ticker, PlayerSheet,
API). Existing rows backfilled by recomputing from stored text.

## Icon-semantics audit (the broader ask)

- Commentary ⚽ — was the only semantically-wrong icon (bad flag). Fixed.
- Match-event glyphs (scoreboard/pitch) — keyed on the typed
  `MatchEventType` enum (`goal`, `yellow_card`, ...); mapping is sound.
  Note the *replay event-type data* itself is suspect for fixture 65
  (separate issue, not an icon-mapping bug — tracked, not fixed here).
