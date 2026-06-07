# FUNDXI — Migration Brief for Claude Code

## What is FundXI?
A mobile-first fantasy football trading app for the FIFA World Cup 2026. Users buy/sell "shares" of real players whose value fluctuates based on performance, news, injuries, and match events. Think Robinhood meets Fantasy Premier League.

## Current State
- Single-file React component (`fundxi-v6.jsx`) — 1700 lines
- All features working: 7 pages, trade flow, match view, portfolio, leagues
- Design system defined and validated
- Data is hardcoded (48 teams, ~80 players, mock matches, mock portfolio)

## Target
Convert to a proper Next.js (or Vite React) app with:
- Component-per-file architecture
- Proper routing
- Shared design tokens
- Same visual design, same features, better code quality
- Mobile-first (max-width 430px)

---

## DESIGN SYSTEM — DO NOT CHANGE

### Background
- Base: `#020406` (near-black)
- Ambient: `radial-gradient(ellipse 120% 80% at 10% 5%, #152a42, #0a1520 35%, #040810 55%, #020406 100%)`
- This creates a subtle cyan glow from the top-left corner

### Typography
- Body: `'Inter', sans-serif`
- Mono (numbers, prices, data): `'JetBrains Mono', monospace`
- Weights: 400-900

### Colors — STRICT RULES
**Only 3 colors exist in this app:**
1. **Green `#48ff43`** — ONLY for: BUY button, positive values (+%), positive P&L, area chart fill when trend is up
2. **Red `#ff285d`** — ONLY for: SELL button, negative values (-%), negative P&L, area chart fill when trend is down  
3. **White/Grey** — EVERYTHING else. Text, labels, badges, tags, borders, icons, navigation

**NO other colors anywhere.** No blue, no violet, no yellow, no orange on any UI element.

> **Brand blue `#5058f8` — two sanctioned uses only.** (1) The "XI" of the
> fundXI logo wordmark (loading gate, auth sheet, Home hero, splash/icon).
> (2) The **categorical** ramp for portfolio allocation charts (by team / role /
> age) — tints/shades of the brand blue, exposed as the shared
> `chart_category_ramp` token. Allocation is neutral categorical data, so blue
> keeps it distinct from performance; **green/red stay reserved for P&L**
> (gains/losses, Long/Short, Win/Loss) and must use the SAME `positive` /
> `negative` tokens as the numbers — no separate chart greens/reds, no opacity
> variants that drift from the figure colours. Blue is never a button, value,
> badge or border colour. Always via tokens (`brandBlue` / `chart_category_ramp`
> / `--color-brand-blue`), never a raw hex in a component. Added 2026-06-06.
- Position badges (FWD, MID, DEF, GK): all `rgba(255,255,255,.45)` — same grey
- Rating: white, not gold
- LIVE badge: `rgba(255,255,255,.5)` — grey, not red
- Navigation active tab: white `#fff`, not colored
- Links "See all →": `rgba(255,255,255,.35)`, not colored
- Watchlist star: grey, not yellow
- Skill tags: `rgba(255,255,255,.4)` on `rgba(255,255,255,.04)` background

### Surfaces
- Cards: `rgba(255,255,255,.03)` — no border or `1px solid rgba(255,255,255,.04)`
- Active tabs: `rgba(255,255,255,.06)`
- Borders: `rgba(255,255,255,.04)` max
- No colored borders anywhere
- Sheet/modal background: `#020406` with blur

### Charts
- Area chart style (line + gradient fill underneath)
- Line: 2.5px stroke with 5px glow at 10% opacity behind
- Fill: gradient from 30% opacity at top to 0% at bottom
- End dot: 4px solid + 9px halo at 15% opacity
- Color: green `#48ff43` when up, red `#ff285d` when down
- Sparklines in lists: same green/red logic, smaller

### Buttons
- BUY: `background: #48ff43`, `color: #06220e` (dark green text), `box-shadow: 0 0 22px rgba(72,255,67,.3)`, `border-radius: 18px`
- SELL: `background: #ff285d`, `color: #fff`, `box-shadow: 0 0 22px rgba(255,40,93,.3)`, `border-radius: 18px`
- Both: `font-weight: 900`, `letter-spacing: 1px`, `font-size: 15-17px`

### Pie Chart (Portfolio Breakdown)
- Monochrome palette: `rgba(255,255,255, .7/.5/.35/.22/.14/.09/.06/.04)` — white to dark grey
- No colored segments

---

## PAGES & FEATURES

### 1. Home
- Portfolio hero card (value, P&L, return, rank, player count)
- Leagues horizontal scroll (with rank + return per league)
- Live match card (score, minute, top movers %)
- Upcoming fixtures list
- Market news feed (icon + title + impact %)
- Watchlist (starred players)
- Top movers horizontal scroll (sparkline cards)

### 2. Screener
- Search bar
- Expandable filters panel (position, price range, team by confederation)
- Sort options (value, 24h change, rating, age)
- Player cards with: flag avatar, name, position badge, club, sparkline, price, change %, rating

### 3. Fixtures
- Status filter tabs (All, Live, Completed, Upcoming)
- Match cards with flags, score/VS, group, date
- Clickable to Match View for live/completed

### 4. Match View
- Score header with live minute
- SVG perspective pitch with player dots (number, name, change %)
- Team tabs (switch between home/away XI)
- Formation label
- Starting XI + Substitutes list view
- Live commentary feed
- Player tap → trade panel overlay
- Trade panel: mini chart, KPIs, full TradeFlow component

### 5. Portfolio
- KPIs grid (total value, P&L, return, players)
- Performance chart (area chart, period selector)
- Breakdown tabs (Team, Position, Age, Long/Short) with donut chart
- Holdings list with shares, avg price, P&L per player
- Trade history list

### 6. Leaderboard / Leagues
- League selector (horizontal scroll)
- Create league flow
- Join with code flow
- Your rank card
- Podium (top 3 with medals)
- Full ranking list
- Invite CTA for private leagues

### 7. Profile
- Avatar + name + email
- Favorite team/player selector
- Trading stats grid
- Settings list
- Actions (manage leagues, help, logout)

### 8. Player Detail (Sheet/Modal)
- Hero: flag, name, position, club
- KPIs: value, 24h change, rating, age
- Bio text
- Skill tags
- Area chart with period selector + event dots
- Price events timeline (clickable, synced with chart)
- TradeFlow component (Buy/Sell with slider, short detection, confirmation)

### 9. TradeFlow (Reusable Component)
- Holding info if player is held
- Buy/Sell mode
- % Portfolio / Shares toggle
- Slider + shortcuts
- Summary (shares, total, position type)
- Short warning
- Confirmation screen with done/portfolio buttons

---

## DATA STRUCTURE
All data is currently hardcoded in the component. Key structures:

- `N` — Nations object (48 teams with name, flag emoji, color, confederation, group)
- `P` — Players array (~80 players with id, name, number, team, position, value, change, rating, tags, bio, physical stats)
- `MYPORT` — Portfolio holdings (player id, shares, avg buy price)
- `FIX` — Fixtures array
- `MM` — Match data with lineups, events, player curves
- `LB` / `LEAGUES` — Leaderboard data with multiple leagues
- `TRADES` — Trade history

---

## FILE STRUCTURE SUGGESTION

```
fundxi-app/
├── src/
│   ├── app/ (or pages/)
│   ├── components/
│   │   ├── ui/ (Sheet, Spark, PB, Live, Donut, PerfC)
│   │   ├── home/ (PortfolioHero, LiveMatch, MarketNews, TopMovers, Watchlist)
│   │   ├── screener/ (SearchBar, FilterPanel, PlayerCard)
│   │   ├── match/ (PitchView, Commentary, MatchTradePanel)
│   │   ├── portfolio/ (KPIs, Breakdown, Holdings, TradeHistory)
│   │   ├── player/ (PlayerSheet, TradeFlow, PriceEvents)
│   │   └── leagues/ (LeagueCard, CreateLeague, JoinLeague, Ranking)
│   ├── data/
│   │   ├── nations.js
│   │   ├── players.js
│   │   ├── fixtures.js
│   │   ├── matches.js
│   │   ├── portfolio.js
│   │   └── leagues.js
│   ├── lib/
│   │   └── tokens.js (design tokens, colors, spacing)
│   └── styles/
│       └── globals.css
```

---

## IMPORTANT NOTES
- This is a PROTOTYPE — all data is mock/hardcoded
- Mobile-first, max-width 430px
- No backend, no API calls, no auth
- The design has been iterated extensively — DO NOT change the color scheme or add new colors (the only sanctioned addition is the brand wordmark blue `#5058f8`, logo-only — see "Colors — STRICT RULES")
- Keep the same fonts: Inter + JetBrains Mono
- The ambient cyan glow on the background is important — keep it
