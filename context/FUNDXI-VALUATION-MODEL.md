# FundXI — Player Valuation Model

**Implementation Specification**
Version 1.0 · May 2026

---

## 1. Purpose of this document

This document defines how player prices move on FundXI during the FIFA World Cup 2026. It is meant to serve as the single source of truth for engineers, designers, and product people implementing the live trading experience.

It covers three things:

1. **The valuation formula** — what computes a player's price at any moment
2. **The data sources** — where the inputs come from in production
3. **The implementation path** — how to wire it up step by step

Every design choice here is driven by one constraint: **FundXI is a tournament trading platform, not a career valuation database.** That distinction shapes everything that follows.

---

## 2. Why career valuation models do not work for FundXI

The football industry has mature systems for valuing players: Transfermarkt (crowdsourced), CIES Football Observatory (statistical model), Football Benchmark (proprietary algorithm). They all answer the same question: *"How much would a club pay to buy this player today?"*

That question is wrong for FundXI. Here is why.

| | Career valuation (existing systems) | Tournament valuation (FundXI) |
|---|---|---|
| Time horizon | Years | 7 matches max |
| Yellow card impact | ~0% (long-term irrelevant) | Significant (one more = suspension next match) |
| Knockout elimination | 0% (player still has a career) | Catastrophic (no more matches to play) |
| Update frequency | Weeks (editorial) or daily | Per minute, live |
| Goal of the model | Predict transfer fee | Drive a tradable, volatile market |

A player eliminated in the round of 16 still has a transfer market value of 180M€. But on FundXI, he is done — he cannot generate any more performance. His tradable price must reflect that reality.

This means we cannot reuse off-the-shelf valuations. We need our own model, calibrated for the short horizon and high volatility of a tournament.

---

## 3. The valuation formula

### 3.1. The single equation

```
Price(t) = BaseValue × Multiplier(t)
```

Two inputs per player. Nothing else. The same formula applies to every player in the database, regardless of age, position, role, or country.

### 3.2. BaseValue — the anchor

Set once before the tournament starts. Never modified during the competition.

The BaseValue reflects the player's pre-tournament market consensus — essentially what Transfermarkt or a similar aggregator would price him at the day the World Cup kicks off. Examples:

- Mbappé: 195 M€
- Yamal: 155 M€
- Ronaldo: 60 M€
- A Panama starter: 12 M€

The BaseValue absorbs everything we do not want to model dynamically: age, contract length, club prestige, marketability, long-term potential. By baking these into a single starting number, we avoid having to categorize players into "young option" vs "stable veteran" buckets — the market has already done that work for us.

### 3.3. Multiplier(t) — the live engine

Starts at **1.00** for every player at kickoff of the tournament. Always positive. It is the sum of two parts:

```
Multiplier(t) = 1.00 + TournamentDelta(t) + LiveDelta(t)
```

**TournamentDelta — persistent.** Accumulates across the whole tournament, never decays. Changes only at discrete settled moments:

- **Match settlement** (at full-time): the match the player just played is "cashed in" once — its realised performance becomes permanent.
- **Tournament events** between matches: qualification (+), knockout elimination (−), news (transfer / injury / scandal), suspension.

Between matches `LiveDelta = 0`, so the price sits flat at `BaseValue × (1 + TournamentDelta)` and moves only on tournament events.

**LiveDelta — transient, reversible.** Non-zero only while the player's match is in progress. Recomputed from the player's **current live rating** every poll, so:

- plays well → rating up → price **goes up**;
- plays badly — a card, a missed penalty, a lost ball — → Sportmonks **lowers his live rating** → price **goes back down, during the match**.

This is the core requirement: the price tracks live performance **in both directions**, like a real tradable asset. At full-time `LiveDelta` is folded into `TournamentDelta` (cashed in once) and reset to 0 for the next match.

**No double-count rule.** During the match a goal or a card moves the price **only through the live rating** Sportmonks updates (rating up on a goal, down on a card / miss). We never *also* add a separate per-event percentage on top — that would count the same goal twice. An event's durable, narrative value enters `TournamentDelta` once, at settlement (discrete consequences such as a suspension are applied once there too).

No time decay, no moving average: `TournamentDelta` changes only when something settles; `LiveDelta` only reflects the current live rating.

### 3.4. Why no time decay

An earlier draft of this model included a `Decay(t) = (matches_remaining / 7)^0.5` term to capture the fact that fewer remaining matches means less upside. That model was wrong.

Imagine a player in the semi-final who has been outstanding all tournament. Decay would punish him just for having advanced — his price would fall while he is playing his best football. That breaks the intuition of every trader.

The correct way to capture "fewer matches left" is through the **tournament events** themselves:

- A team that wins and qualifies for the next round → **+5% bonus** (more matches secured, performance rewarded)
- A team that loses in knockout and is eliminated → **−40% penalty** (all future matches gone in one shot)

This way, the "decay" only triggers when the player has actually run out of matches — not as a function of the calendar. A finalist gets paid for being a finalist. An eliminated quarter-finalist crashes when he loses, not gradually before the match.

The market self-regulates through results, not time.

---

## 4. The event impact table

This is the calibration layer. Every event in the system maps to a base impact percentage, then gets adjusted by the volatility multiplier (see section 4.2).

### 4.1. Base impacts

| Event | Base impact | Source / trigger |
|---|---|---|
| **Performance — during match** | | |
| Goal | +6% | Live event feed |
| Assist | +3% | Live event feed |
| Yellow card | −4% | Live event feed |
| Second yellow / red card | −10% | Live event feed |
| Penalty missed | −5% | Live event feed |
| Own goal | −7% | Live event feed |
| **Performance — match rating** | | |
| Match rating delta from 6.5 | (rating − 6.5) × 4% | Sportmonks player rating, every minute |
| **Tournament progression** | | |
| Team wins group stage match | +2% | Match result |
| Team qualifies for knockout round | +5% | Group stage final standings |
| Team wins knockout match | +5% | Match result |
| Team eliminated in knockout | −40% | Match result |
| Player suspended next match | −15% | Card accumulation rule |
| Player benched (was expected starter) | −3% | Lineup confirmation |
| **Off-pitch news** | | |
| Severe injury (out of tournament) | −35% | News feed (manual or AI-classified) |
| Minor injury (doubt for next match) | −7% | News feed |
| Top transfer rumor confirmed | +20% | News feed |
| Ballon d'Or buzz | +6% | News feed |
| Off-pitch scandal | −15% | News feed |
| Manager praise / endorsement | +2% | News feed |

These numbers are starting points. They will need calibration against real tournament data. Treat them as v1 defaults, not laws of physics.

**On the 6.5 rating baseline.** The neutral point is **6.5**, not 6.0. Sportmonks documents 6.5 as the starting rating of a player in the XI; across 1.7M ratings their population mean is 6.72 and the modal rating is 6.45 (our own early WC2026 sample confirms it: mean 6.76, median 6.69). A 6.0 baseline sat near the 5th percentile, which had two bad consequences: (a) the median player accrued ~+2.8%/match of permanent value just for playing an average game — a ~+20% structural drift over a tournament — and (b) because most ratings clear 6.0, the rating term was almost always positive, so the "price falls when the rating falls" property rarely fired and a naked short of the field carried free positive EV against the typical sub-6.7 player. At 6.5 the neutral means "started, unremarkable", the median player keeps a small **deliberate** participation premium (~+0.8%/match, the positive counterpart to the −1%/−2% absence penalties), and shorting the field is correctly −EV.

### 4.2. Volatility multiplier

Small caps must move harder than blue chips. This is true in equity markets and it is true here. A 12 M€ player who scores against Brazil should move 2-3× more than Mbappé scoring his fifth goal.

```
volatility(BaseValue) = (50 / BaseValue) ^ 0.4
```

Reference points:

| BaseValue | Volatility multiplier |
|---|---|
| 200 M€ | 0.58 |
| 150 M€ | 0.66 |
| 100 M€ | 0.76 |
| 50 M€ | 1.00 |
| 25 M€ | 1.32 |
| 10 M€ | 1.91 |

So a goal worth a base +6% becomes:

- For Mbappé (195M€): 6% × 0.58 = **+3.5%**
- For a 25M€ player: 6% × 1.32 = **+7.9%**

Same event, asymmetric reaction. The market becomes more interesting because small-cap movers can outperform the big names in % terms — exactly what makes equities trading rewarding.

### 4.3. Final impact formula

```
final_impact = base_impact × volatility(BaseValue) × confidence
```

`confidence` is a 0-to-1 multiplier used only for off-pitch news. A confirmed transfer gets `confidence = 1.0`. An unverified rumor gets `confidence = 0.5`. Performance events are always `confidence = 1.0`.

---

## 5. Data sources

### 5.1. Comparing the three options

Three providers offer the data FundXI needs. They are not equivalent.

| Criterion | API-Football | **Sportmonks** | Stats Perform / Opta |
|---|---|---|---|
| Live player rating during match | ❌ Not available | ✅ Every minute | ✅ Every 30 seconds |
| Final player rating (post-match) | ✅ | ✅ | ✅ |
| Live events (goals, cards, subs) | Every 15s | Every 10-30s | Under 10s |
| Match statistics live | Every minute | Every 30-60s | Continuous |
| xG live (in-match) | Limited | ✅ (Advanced add-on) | ✅ |
| WC 2026 dedicated plan | Generic plan | ✅ €69/month | Enterprise only |
| Pricing for FundXI scale | ~€30/month | **€69/month** | Several thousand €/month |
| Free trial | ✅ (free tier) | ❌ on WC plan | ❌ |
| Documentation quality | Good | Excellent | Excellent (but gated) |
| Self-serve signup | ✅ | ✅ | ❌ (sales calls required) |
| Used by | Indie devs, small apps | Mid-tier media, fantasy apps, betting platforms | Premier League, broadcasters, sportsbooks |

### 5.2. Why Sportmonks wins for FundXI

Three reasons, in order of importance.

**1. The live player rating is the single most important input to our model.**

Our formula is `Price = BaseValue × Multiplier`, and the live part of the multiplier is driven by the player's live rating every minute (see §3.3). Without a live rating, we are stuck reconstructing one ourselves from raw events (goals, cards, passes) — which means re-doing 10+ years of Opta calibration work badly.

API-Football fails this test: their rating is only available *after* the match ends. That means during the 90 minutes when users are most engaged, we would have no smooth rating signal — only discrete events. The price would jump on every goal or card and stay flat in between, which feels broken.

Sportmonks updates the rating **every minute during the match**, explicitly documented in their API. Stats Perform/Opta updates every 30 seconds, which is marginally better but at 50× the cost.

**2. Pricing matches the stage of the company.**

€69/month for a dedicated WC2026 plan with full coverage of all 104 matches and 48 teams is the right order of magnitude for a startup validating a product. API-Football is cheaper but we lose the rating, which forces us into a worse model. Stats Perform/Opta is several thousand euros per month and requires enterprise contracts — not appropriate before product-market fit.

The cost difference between API-Football (~€30) and Sportmonks (€69) is €40/month. That €40 buys us the live rating, which is the difference between a working product and a broken one. It is the easiest €40 ever spent.

**3. Self-serve signup means we can start building today.**

Stats Perform/Opta requires sales calls, contracts, and onboarding. Even if we had the budget, the procurement timeline would push our launch by weeks. Sportmonks accepts credit cards and gives an API token instantly. We can prototype against real data the same day we sign up.

### 5.3. Why not API-Football despite being cheaper

It is tempting to start with the cheapest option. We considered this and rejected it. The reason is architectural:

If we build on API-Football's event-only data, our pricing model has to be: *"compute a synthetic rating from raw events."* That means reimplementing Opta's algorithm from scratch with worse data. Every event needs a hand-tuned weight. Position-specific baselines. Pitch-zone adjustments. Context corrections. This is months of work that is already done by the rating providers.

If we then migrate to Sportmonks later, we throw away that custom model and the multiplier behavior changes overnight. Existing users see prices behave differently. Trust breaks.

Better to start with the right data source and avoid the rebuild.

### 5.4. When to consider upgrading to Stats Perform / Opta

Three triggers would justify the move:

1. **Scale**: > 50,000 daily active users where the marginal revenue per user covers the upgraded data cost
2. **Latency complaints**: users feel the 1-minute rating refresh is too slow during high-stakes moments (penalties, last-minute goals)
3. **Advanced derivatives**: if we add features like in-play prediction markets, team pressure trading, or per-action betting, we need the sub-10-second event feed

Until at least one of these is true, Sportmonks is the right answer.

### 5.5. Sportmonks WC 2026 plan details

Pricing as of May 2026, sourced from Sportmonks documentation:

- **€69/month** for the dedicated World Cup 2026 plan
- Coverage: all 104 matches, 48 teams, fixtures, lineups, live events, statistics, player ratings, group standings, knockout brackets
- Live updates: scores within 10 seconds, events within 10-30 seconds, ratings every minute
- Optional add-ons: News API, AI-powered match predictions, advanced xG, Pressure Index, in-play odds
- 3,000 API calls per entity per hour on the default tier
- No free trial on the WC plan (note: standard plans have a 14-day trial, but the WC-specific plan does not)

The Pressure Index add-on is worth flagging: it measures the pressure each team applies during the match. This could feed a future feature where defenders earn bonus multiplier when their team absorbs high pressure without conceding — a way to value defensive performance that pure event data misses.

### 5.6. What Sportmonks provides

Update frequencies during a live match (from Sportmonks documentation):

- Scores: within 10 seconds of a goal
- Events (goals, cards, subs): within 10–30 seconds
- Match statistics: every 30–60 seconds
- **Player ratings: every minute** ← the key input
- Live commentary: same frequency as events

Post-match, all data is finalized within 10 minutes.

### 5.7. The relevant endpoints

For FundXI, the integration uses three endpoints:

| Endpoint | Purpose | Polling frequency |
|---|---|---|
| `/livescores/inplay` | List of currently live matches, with embedded events | 30 seconds |
| `/fixtures/{id}?include=lineups,events,statistics,players` | Full state of a single match including individual player ratings | Every minute per live match |
| `/fixtures/{id}?include=players.statistics` | Final player ratings post-match | Once, ~10 min after final whistle |

All include the `match_rating` statistic per player, which is what feeds the multiplier formula.

### 5.8. News data — separate handling

Sportmonks does not cover transfer rumors, off-pitch news, or scandals at the depth FundXI needs. Two options:

1. **Sportmonks News API add-on** for the major leagues (paid extra)
2. **Custom news pipeline** scraping Twitter/X (Fabrizio Romano, David Ornstein, official club accounts) and major news sites (L'Équipe, BBC Sport, ESPN), classified by an LLM

For the MVP, recommend option 1 supplemented by **manual editorial input** — a human curator who flags major news in the admin panel. This is more reliable than ML classification at low volume and lets the team move fast.

---

## 6. The price computation pipeline

> **Implemented (June 2026).** This section's pseudocode now mirrors the real
> Python kernel — `backend/src/valuation/pricing.py` (`price_from_carried`,
> `apply_result_event`) and `backend/src/valuation/tournament.py`. Two
> corrections vs the original draft: the live part is a rating **level**
> recomputed each poll (not an accumulated rating *delta*), and **result events
> are multiplicative on the current price and NOT volatility-scaled** (a result
> is a collective fate — the whole squad moves by the same fraction). The
> additive `multiplier += impact` model below was the retired events-v0 design.

### 6.1. Data flow

```
                    ┌────────────────────────┐
                    │  Sportmonks API        │
                    │  - events (live)       │
                    │  - player ratings      │
                    │  - match results       │
                    └───────────┬────────────┘
                                │
                    ┌───────────▼────────────┐
                    │  Event Mapper          │
                    │  Sportmonks event →    │
                    │  FundXI event type     │
                    └───────────┬────────────┘
                                │
                    ┌───────────▼────────────┐
                    │  LIVE part (every poll) │
                    │  liveDelta = clamp(     │
                    │   (rating−6)·k + stat)  │
                    │   · vol(base) · press   │
                    └───────────┬────────────┘
                                │
                    ┌───────────▼────────────┐
                    │  RESULT part (at FT)    │
                    │  price ×= (1 + impact)  │
                    │  (multiplicative, not   │
                    │   volatility-scaled)    │
                    └───────────┬────────────┘
                                │
                    ┌───────────▼────────────┐
                    │  Price = base ×         │
                    │  (1+tournΔ+liveΔ),      │
                    │  floored > 0            │
                    └───────────┬────────────┘
                                │
                    ┌───────────▼────────────┐
                    │  Push to clients       │
                    │  WebSocket broadcast   │
                    └────────────────────────┘
```

### 6.2. Pseudocode — live tick handler

```javascript
// Called every poll for each player in a live match. The price has two parts:
// a PERSISTENT tournament balance carried in from prior matches, and a
// TRANSIENT live part recomputed from the CURRENT rating every poll — so the
// price falls when the rating falls (reversible by construction).
async function onLiveTick(matchId) {
  const fixture = await sportmonks.getFixture(matchId, { include: 'players.statistics' });
  for (const player of fixture.players) {
    priceLive(player, ratingOf(player) ?? 6.5);   // null rating → neutral baseline
  }
}

function priceLive(player, rating) {
  // tournamentDelta is NOT stored — it is read back from the price the player
  // carried INTO this match: carriedPrice / base − 1.
  const tournamentDelta = player.carriedPrice / player.baseValue - 1;

  // liveDelta is a LEVEL recomputed from the CURRENT rating (not an accumulated
  // delta), bounded, then volatility- and pressure-scaled. There is NO separate
  // per-event %: a goal/card moves the price ONLY through the rating Sportmonks
  // raises/lowers (no double-count).
  const ratingLevel = (rating - 6.5) * 0.04;                 // +4% per point above the 6.5 baseline
  const core = clamp(ratingLevel + statBonus(player), -0.30, +0.40);
  const liveDelta = core * volatility(player.baseValue) * pressureMod(player);

  const multiplier = Math.max(0.05, 1 + tournamentDelta + liveDelta);
  player.price = round2(player.baseValue * multiplier);
  pushToClients(player);
}
```

### 6.3. Pseudocode — match end handler

```javascript
// At full-time the in-match performance is ALREADY banked: the last live tick
// is base × (1 + tournamentDelta + liveDelta), and it becomes the carried-in
// price for the next match. We then apply the RESULT once — multiplicatively on
// the player's current price, NOT volatility-scaled (a result is collective: the
// whole squad moves by the same fraction, regardless of base value).
async function onMatchEnd(matchId) {
  const fixture = await sportmonks.getFixture(matchId, { include: 'participants,scores' });
  const winner = decisiveWinner(fixture);        // null on a level knockout (penalties) → skip, never crash the wrong team
  const isKnockout = !isGroupStage(fixture.stage);

  for (const player of fixture.players) {         // both squads, incl. unused subs
    const impact = resultImpact(player.team_id, winner, isKnockout);
    //   group win → +2%   |   knockout win → +5%   |   knockout loss → −40% (elimination)
    if (impact !== 0) applyResultEvent(player, impact);   // one settlement tick
  }
}

function applyResultEvent(player, impact) {
  const floor = player.baseValue * 0.05;          // price stays strictly positive (spec Q3)
  player.price = Math.max(floor, round2(player.price * (1 + impact)));
  pushToClients(player);
}

// The other PERSISTENT events use the identical multiplicative rule, each once:
//   qualification +5% (team reaches the knockout bracket) · suspension −15%
//   (red / 2-yellow accumulation) · lineup-drop −2% (expected starter benched).
```

### 6.4. Caching and rate limits

Sportmonks rate limits are per-entity, not per-endpoint. The default plan offers 3,000 requests per entity per hour, which is more than enough for the World Cup as long as polling is structured properly:

- Poll `/livescores/inplay` every 30 seconds during match windows
- Poll each live match's full state once per minute
- Cache fixtures, teams, leagues — they almost never change
- Cache final match data after `state = FT`

---

## 7. UI implications

The model only matters if users can see it move. Three UI components are required:

### 7.1. Live price ticker

Each player card shows:
- Current price (BaseValue × Multiplier, formatted in M€)
- Today's change (Multiplier delta over the last 24h, in %)
- A live indicator when their match is in progress

When the price changes, animate the number with a brief flash (green for up, red for down). The animation is what makes it feel alive.

### 7.2. News & catalysts feed

For each player, a list of recent events that moved their price. Each row shows:
- Event icon (⚽ goal, 🟨 yellow, 🚑 injury, etc.)
- Event description
- Source (e.g., "Live match minute 67" or "Fabrizio Romano")
- Timestamp
- The exact % impact applied

This builds trust. Users who can see *why* a price moved will trust the market more than users who just see prices change.

### 7.3. Match-level price chart

During a live match, show a sparkline of each player's price over the 90 minutes. The shape of the curve becomes a story: a striker who scores in the 12th minute then disappears versus a midfielder who builds rating steadily across the match.

This is the equivalent of the intraday chart in a stock app. It is the single most engaging UI element in trading apps and FundXI should not skip it.

---

## 8. Implementation roadmap

### Phase 1 — Static MVP (current state)

- Hardcoded BaseValues for ~50 World Cup players
- Mocked event impacts in the JSX prototype
- No external API calls
- Status: **done**

### Phase 2 — Sportmonks integration (estimated 2-3 weeks)

- Subscribe to Sportmonks WC 2026 plan
- Implement event mapper (Sportmonks event types → FundXI impact codes)
- Backend service that polls live matches and updates multipliers
- Persist player state in a database (PostgreSQL recommended — simple, transactional, well-supported)
- WebSocket layer to push updates to connected clients

### Phase 3 — News pipeline (estimated 2 weeks, can run in parallel)

- Admin panel for manual news entry
- Optional: Twitter/X integration for top 5 reporters' accounts
- Optional: LLM classification of news headlines → event types and confidence scores

### Phase 4 — Calibration (during World Cup)

- Track actual price movements vs expected
- Adjust base impacts and volatility curve based on observed user trading behavior
- Goal: make sure the median player has a daily volatility of ~5-10% during match days

### Phase 5 — Post-tournament analysis

- Backtest the full model on the WC2026 data
- Identify mispriced events (e.g., did red cards overshoot? did Ballon d'Or buzz undershoot?)
- Recalibrate for next competition (Euro 2028)

---

## 9. Open questions

These are not blockers, but they will need decisions before launch:

**Q1.** What happens to a player's price when his match starts but he is not in the lineup? Should the price freeze, or continue to react to news?
*Recommended:* Freeze on lineup confirmation; he cannot perform if he is not playing.

**Q2.** How do we handle substitutes who come on at minute 70? Do they get a partial rating boost?
*Recommended:* Yes. Sportmonks rates substitutes from the moment they enter. Apply the standard formula, but with a smaller weight for short minutes played.

**Q3.** Should the multiplier be allowed to go below 0?
*Recommended:* No. Floor it at 0.05 (5% of BaseValue). A player whose team is eliminated and who was injured still has residual value as a long-term asset on the platform — and a price of zero would break the trading UX.

**Q4.** When does the multiplier reset?
*Recommended:* Never during the tournament. After the final, snapshot the final price, recompute new BaseValues for the next competition, reset multipliers to 1.00.

**Q5.** How do we handle penalty shootouts?
*Recommended:* Treat each penalty as a discrete event. Goal = +3% (smaller than open play because the situation is binary). Miss = −7% (larger because of the high-pressure context). The keeper who saves a penalty: +10%.

---

## 10. One-page summary

**The formula:**
```
Price = BaseValue × Multiplier
```

**The multiplier:**
- Starts at 1.00
- Moves with events (performance + tournament + news)
- Each event impact is scaled by `(50 / BaseValue)^0.4` for volatility

**The data source:**
- **Sportmonks Football API** (€69/month WC 2026 plan)
- Player rating updated every minute live → core input
- Live events every 10-30 seconds → discrete impacts
- Match results → tournament progression bonuses/penalties

**The product:**
- Real-time price ticker, news feed, intraday chart per player
- The same model applies to every player — no categorization, no special cases

This is the FundXI valuation system. One formula, one data source, one UI pattern. The simplicity is the point.
