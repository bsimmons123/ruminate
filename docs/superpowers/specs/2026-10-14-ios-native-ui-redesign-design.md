# Ruminate native app UI/UX redesign

Date: 2026-10-14
Branch: `ios`
Status: approved, ready for planning

## Goal

Make the Capacitor app look and behave like a native iOS app while keeping Ruminate's
existing visual identity. The web and PWA experience must render exactly as it does today.

## Context

The current UI is a desktop-first web design with mobile support added through
`max-width` media queries. The design language is strong — Gilda Display and DM Sans,
a cream/forest/clay palette, editorial layouts — so this work changes ergonomics and
native fit, not aesthetic direction.

Several defects are specific to running inside a WKWebView:

- `src/styles.css:63` gates all safe-area padding behind `@media(display-mode:standalone)`.
  That query is true for an installed PWA and false in Capacitor, so the header renders
  under the status bar.
- `index.html:5` omits `viewport-fit=cover`, so `env(safe-area-inset-*)` resolves to `0`
  even where it is applied.
- The viewport permits user scaling and inputs are below 16px, so iOS zooms on focus and
  the layout is left clipped.
- `src/styles.css:1` imports fonts from the Google Fonts CDN. A packaged app makes a
  blocking network request on every cold start and has no typography offline.
- Touch targets such as `.icon-button` (17px) and `.text-button` fall well under 44pt, and
  many affordances are `:hover`-only.

## Scope

Native-only. All new rules are scoped under a `.native` class so the web bundle's
rendering is unchanged.

One deliberate exception: self-hosting the fonts modifies shared CSS, because the CDN
`@import` degrades the web experience too.

All screens are in scope: Home, Review, Reels, Library, Memory Bank, Auth, Settings.

## Architecture

### Native gate

`src/nativePush.ts` already exports `isNativeApp`, and `src/api.ts:4` already branches on
`Capacitor.isNativePlatform()`. `src/main.tsx` adds `native` to `document.documentElement`
when `isNativeApp` is true, and imports `src/native.css` last.

The gate is *native*, not iOS, so the Android build receives the same fixes. Rules that are
genuinely iOS-specific are scoped under `.native.ios`.

The only cost to the web bundle is a few KB of unused CSS.

### Foundation layer (`src/native.css`)

- **Safe areas.** `.native` equivalents of the dead `@media(display-mode:standalone)` block,
  plus `viewport-fit=cover` in `index.html`.
- **Focus zoom.** `maximum-scale=1, user-scalable=no` in the viewport; input `font-size`
  raised to 16px.
- **Fonts.** Gilda Display and DM Sans self-hosted as woff2 under `public/fonts/`,
  replacing the `@import` at `src/styles.css:1`.
- **Viewport units.** `100vh` becomes `100dvh` under `.native`.
- **Touch.** 44pt minimum hit areas on `.icon-button`, `.text-button`, `.modal-close`, and
  tab buttons; `-webkit-overflow-scrolling: touch` and `overscroll-behavior` on scroll
  containers; tap highlight and selection callouts suppressed on controls; `:hover`
  affordances converted to `:active` under `.native`.

`user-scalable=no` disables pinch-zoom. This is an accessibility loss, accepted because it
is standard in a native app shell and is gated to native only — the website keeps pinch-zoom.

### Navigation shell (`src/components/NativeShell.tsx`)

Contains the tab bar, sheet host, and collapsing header.

**Tabs:** Today, Reels, Library, Memory Bank, More.

- The tab bar stays visible on Reels. `src/App.tsx:237` currently hides tabs on both Reels
  and Review; Review keeps hidden tabs because it is a focused task with an explicit exit,
  but a browsing feed must not strand the user.
- **More** replaces the hamburger menu entirely. It opens a sheet containing Verse Store,
  History, Settings, the account summary, and sign out — everything currently reachable only
  through `header>nav.open`.
- Verse Store moves into the More sheet and is listed first. Home and Library already pass an
  `onStore` handler (`src/App.tsx:225,228`), so in-content paths to the Store remain.
- Tapping the active tab scrolls that tab to top; each tab retains its own scroll position
  across switches. `navigate()` at `src/App.tsx:167` currently scrolls `window` to top on
  every navigation.

**Headers.** Per-page large titles that collapse into a compact centered title on scroll,
replacing the sticky global header. `.welcome h1` and `.page-title h1` already read as large
titles; they simply do not participate in scroll and sit beneath a redundant second header.

**Sheets.** The collection preview at `src/App.tsx:489` becomes a bottom sheet: rounded top,
drag indicator, internal scrolling, capped at `90dvh`, bottom inset respected. It is currently
a centered desktop dialog dismissed by clicking the backdrop.

**Haptics.** Add `@capacitor/haptics` for tab switches, review ratings, and pin/save.

**Explicitly out of scope:** interactive edge-swipe-back. Implemented properly it requires
gesture tracking and view snapshotting that a webview handles badly; implemented poorly it
feels worse than no gesture. Explicit back affordances plus the existing Android
hardware-back handler at `src/App.tsx:81` cover the need.

### Code structure

Only the pages the shell actually touches are extracted out of `src/App.tsx`. The remaining
583 lines are not refactored as part of this work.

## Per-screen passes

**Auth.** Add `@capacitor/keyboard` so the form lifts rather than being covered; inputs to
16px; `autocomplete`, `inputmode`, and `enterkeyhint` set so the keyboard offers Go; submit
button positioned above the keyboard.

**Home.** The hero card drops the progress ring to `position:absolute; opacity:.45` behind the
text on small screens (`src/styles.css:69`), which reads as a rendering defect. Replace with a
stat row beneath the copy. The three-up verse strip becomes a horizontal snap carousel instead
of stacked 190px blocks.

**Review.** The recall card is a fixed `min-height:510px` box inside a scrolling page; on a
phone it should fill available height with the verse centered. Word blanks to 44pt targets,
choice tray docked above the bottom inset rather than flowing inline, haptic confirmation on
ratings.

**Reels.** `src/reels.css` already handles safe areas. The work is coexisting with the
now-visible tab bar: the pin button at `bottom:43px` will collide with it, and
`scroll-snap-stop: always` plus overscroll containment must hold with the tab bar present.

**Library + Memory Bank.** List density and 44pt targets. `.icon-button` at 17px with
`opacity:.4` is both too small and too faint to read as interactive.

**More sheet + Settings.** Grouped inset lists; the 18px checkbox toggles at
`src/styles.css:61` become real switches.

## Verification

This repo has no test infrastructure — no test script and no test files — so this work claims
no automated test coverage.

- Build, run in the iOS Simulator, and capture before/after screenshots of each screen.
- Confirm the web is unchanged structurally: every new rule scoped under `.native`, and
  `src/styles.css` carrying no diff beyond the font self-hosting change.
- Spot-check the dev server in a desktop browser.

## Sequencing

Each step is a reviewable checkpoint in the simulator:

1. Foundation layer
2. Navigation shell
3. Auth
4. Home
5. Review
6. Reels
7. Library + Memory Bank
8. More sheet + Settings

## Dependencies added

- `@capacitor/haptics`
- `@capacitor/keyboard`

## Related

The `ios` branch also carries a one-line fix to `src/api.ts` sending `X-Ruminate-Native`
instead of `X-Selah-Native`. The Selah to Ruminate rename left the client disagreeing with
the CORS allow-list at `server/index.js:22` and the bearer-token gate at `server/index.js:32`,
which blocked every native request at preflight. That fix is unrelated to this redesign but is
required for the native app to run at all.
