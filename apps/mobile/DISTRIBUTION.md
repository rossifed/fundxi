# fundXI mobile — Distribution (EAS)

Config is ready (`eas.json`, bundle identifiers in `app.json`). The build and
store-submission steps below need **your accounts** and run on your machine —
Claude does not run them (they touch credentials + paid developer programs).

## Identifiers (already set in `app.json`)

- iOS `bundleIdentifier`: `com.atonra.fundxi`
- Android `package`: `com.atonra.fundxi`
- `version` 1.0.0 · iOS `buildNumber` 1 · Android `versionCode` 1
- App version source: **remote** (EAS owns the build number — `autoIncrement`
  on the production profile).

> The app icon / splash are still the Expo **template** assets. Before store
> submission, replace `apps/mobile/assets/images/{icon,splash-icon,
> android-icon-*}.png` with fundXI-branded art (a design task — not generated
> here, per the no-invented-content rule).

## Accounts you need

- **Expo** account (free) — `eas login`.
- **Apple Developer Program** — 99 USD/yr (iOS App Store + TestFlight).
- **Google Play Developer** — 25 USD one-time.

## One-time setup

```bash
cd apps/mobile
npm i -g eas-cli            # or: npx eas-cli@latest
eas login
eas init                   # creates the EAS project + writes extra.eas.projectId
```

## Build profiles (`eas.json`)

- `development` — dev client, internal, iOS simulator allowed (local debugging).
- `preview` — internal distribution (TestFlight / internal testers), `preview` channel.
- `production` — store build, `production` channel, auto-incrementing build number.

## Build

```bash
# Internal test builds
eas build --profile preview --platform ios
eas build --profile preview --platform android

# Store builds
eas build --profile production --platform all
```

## Submit to the stores

```bash
eas submit --platform ios --latest        # needs Apple credentials / App Store Connect app
eas submit --platform android --latest     # needs a Google Play service-account JSON
```

Fill `eas.json` → `submit.production` with the store specifics when you have
them (Apple `ascAppId` / `appleTeamId`; Android `serviceAccountKeyPath` +
`track`).

## OTA updates (JS-only patches, no rebuild)

```bash
eas update --channel preview --message "fix: ..."
eas update --channel production --message "..."
```

(Install `expo-updates` first: `npx expo install expo-updates`.)

## Before first submit — checklist

- [ ] Branded icon + splash (replace template assets).
- [ ] Backend reachable from devices off your LAN (the `.env` LAN IP is
      dev-only — production needs a deployed BFF URL baked via
      `EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_STREAM_URL` build env).
- [ ] Mobile auth wired (see `context/MOBILE-AUTH-PLAN.md`) — required for
      trading + real leagues.
- [ ] Store metadata (description, screenshots, privacy policy).
