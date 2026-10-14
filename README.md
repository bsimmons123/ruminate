<img src="assets/logo.svg" alt="Ruminate logo" width="80">

# Ruminate

[![CI](https://github.com/bsimmons123/ruminate/actions/workflows/ci.yml/badge.svg)](https://github.com/bsimmons123/ruminate/actions/workflows/ci.yml) [![Android release](https://github.com/bsimmons123/ruminate/actions/workflows/publish-android.yml/badge.svg)](https://github.com/bsimmons123/ruminate/actions/workflows/publish-android.yml)

Ruminate helps you memorize Scripture through daily review and an easy-to-browse Bible feed. Study on the web or in the native Android and iOS projects, with your library and progress saved to your account.

**[Open the web app](https://selah.simmonsweb.com/)** · **[Download the Android APK](https://github.com/bsimmons123/ruminate/releases/latest)** · **[Report an issue](https://github.com/bsimmons123/ruminate/issues)**

## Features

- **Memorize:** Save verses to your library, review with multiple-choice or free-text exercises, and schedule your next practice with Again, Hard, Good, or Easy.
- **Explore:** Search the Verse Store and scroll Scripture Reels or ordered Bible-book feeds from Genesis to Revelation.
- **Track progress:** See review history, accuracy trends, verse mastery, and personal collections.
- **Choose a translation:** Read public-domain KJV passages or look up individual ESV passages through Crossway's API when configured.
- **Keep practicing:** Sign in across devices and enable native push reminders for verses due for review when a push provider is configured.

## Quick start

```bash
git clone https://github.com/bsimmons123/ruminate.git
cd ruminate
cp .env.example .env
# Set POSTGRES_PASSWORD and JWT_SECRET in .env.
docker compose up --build
```

Open `http://localhost:3001`. For frontend development, run `npm ci` and `npm run dev` after the API is running, then open `http://localhost:5173`.

## Production build

```bash
npm run build
npm run preview
```

## Native Android and iOS app

Ruminate includes Capacitor projects in `android/` and `ios/`. The native app packages the same memorization, review, library, progress, settings, and Scripture Reels screens as the web app. It uses the existing API with a bearer session and receives native push reminders for verses due for review.

Keep the API running locally with Docker Compose, or run PostgreSQL and `npm run dev:api` yourself. Set `VITE_API_BASE_URL` to the API address visible to the device **before** building the mobile app. Android emulators can use `http://10.0.2.2:3001`; iOS simulators can use `http://localhost:3001`. A physical Android device can use `http://localhost:3001` over a USB `adb reverse` tunnel; testing over Wi-Fi needs a reachable address and trusted HTTPS certificate. The web client continues to use same-origin `/api` when this variable is unset.

```bash
# Android emulator, local development only
VITE_API_BASE_URL=http://10.0.2.2:3001 RUMINATE_MOBILE_DEV_HTTP=true npm run mobile:android

# iOS simulator (requires macOS and Xcode)
VITE_API_BASE_URL=http://localhost:3001 npm run mobile:ios
```

`mobile:android` and `mobile:ios` build, sync, and open the platform project. `RUMINATE_MOBILE_DEV_HTTP=true` enables Android mixed content only for local testing; leave it unset for release builds. A release build should use a reachable HTTPS API. Android Studio and the Android SDK are required to compile Android; Xcode and Apple signing are required to compile iOS. The generated native projects have Ruminate icons and splash screens from `assets/logo.svg`.

For a production-targeted mobile build, run `npm run mobile:sync:prod`. This packages `https://selah.simmonsweb.com` as the API base URL for both platforms. Build the native project after syncing; for an installable Android test APK, run `cd android && ./gradlew assembleDebug`. This command only creates a local artifact. The production backend must include the native bearer-session, device-registration, Bible-book, and CORS routes from this version before that APK can sign in. Android store distribution additionally requires release signing.

Pushes to `master` in `bsimmons123/ruminate` run `.github/workflows/publish-android.yml`, which builds a signed production-targeted APK and attaches it with a SHA-256 checksum to a GitHub Release named for the commit. The workflow needs four repository secrets: `ANDROID_KEYSTORE_BASE64` (base64 of the Android signing keystore), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`. Keep the original keystore and passwords backed up securely; future APKs must use the same key to update an installed app. A `workflow_dispatch` run can retry publishing after the backend is updated.

### Native push reminders

- Android: add your Firebase project's `google-services.json` at `android/app/google-services.json` (ignored by Git). Give the API a Firebase service account through `FIREBASE_SERVICE_ACCOUNT_JSON` or `GOOGLE_APPLICATION_CREDENTIALS`.
- iOS: enable Push Notifications for the `com.selah.scripturememory` App ID and sign the Xcode project. Set `APNS_KEY_P8`, `APNS_KEY_ID`, `APNS_TEAM_ID`, and `APNS_BUNDLE_ID` on the API. Set `APNS_SANDBOX=true` for development builds and `false` for production builds.
- In the native app, sign in and enable **Daily reminders** in Settings. The device registers its token and time zone with Ruminate. The API checks once per minute and sends one reminder at 9 a.m. local time when a verse is due. Turning reminders off or signing out removes that device's token. Push requires a real configured device and provider credentials; the iOS simulator cannot receive APNs push.

Keep Firebase and Apple keys outside source control. The browser and PWA show the reminder toggle as unavailable because this implementation uses native push.

### Test on a Pixel over USB

Install Android Studio and its SDK Platform Tools, then enable **Developer options → USB debugging** on the Pixel and accept the computer authorization prompt. From the Ruminate directory:

```bash
npm ci
cp .env.example .env  # edit POSTGRES_PASSWORD and JWT_SECRET
docker compose up --build -d
adb devices            # confirm the Pixel is listed as "device"
adb reverse tcp:3001 tcp:3001
VITE_API_BASE_URL=http://localhost:3001 RUMINATE_MOBILE_DEV_HTTP=true npm run mobile:sync
RUMINATE_MOBILE_DEV_HTTP=true npx cap run android --no-sync  # select the Pixel
```

The API stays on your computer and the app runs on the phone. Keep the USB cable connected while testing; after reconnecting, repeat `adb reverse tcp:3001 tcp:3001`. Sign up in the app, pin a verse from Reels, complete a review, and reopen the app to verify that the library and progress load from PostgreSQL.

For Android push, add `android/app/google-services.json` from your Firebase project before building the app, and set `FIREBASE_SERVICE_ACCOUNT_JSON` for the API. After signing in and enabling Daily reminders on the Pixel, send an immediate test notification from the local container:

```bash
docker compose exec app npm run push:test -- your-email@example.com
```

The daily scheduler still sends only at 9 a.m. local time when a verse is due. The one-off command tests the same Android delivery path immediately, without changing the reminder schedule.

## Run the complete stack

Copy the environment template and choose strong secrets:

```bash
cp .env.example .env
docker compose up --build
```

Open `http://localhost:3001`. Docker Compose starts PostgreSQL 17, waits for a healthy database, and then starts the application API and compiled web client. The application applies its idempotent schema on every startup, including when an existing database volume is empty or behind the current schema. Database data is retained in the `selah_postgres` named volume.

On mobile, open Settings → Install Ruminate. Android browsers can show the native install prompt; on iPhone, use Safari’s Share → Add to Home Screen. The service worker caches only the application shell and static assets—authenticated API and ESV responses are explicitly excluded.

Keep `COOKIE_SECURE=false` for local HTTP. Set it to `true` when deploying behind HTTPS. Always replace the example database password and JWT secret before exposing the application publicly.

## GitHub Container Registry

Pushes to `master` run CI and publish a multi-platform image to:

```text
ghcr.io/bsimmons123/ruminate:latest
ghcr.io/bsimmons123/ruminate:sha-<commit>
```

Deploy the published image with:

```bash
docker compose -f compose.ghcr.yml pull
docker compose -f compose.ghcr.yml up -d
```

Set `POSTGRES_PASSWORD`, `JWT_SECRET`, and optionally `ESV_API_KEY` in `.env`. Use `RUMINATE_TAG=sha-<commit>` to pin a deployment instead of following `latest`.

For frontend development, run PostgreSQL and the API first, then use `npm run dev`; Vite proxies `/api` to port 3001.

## Enable ESV

Crossway requires an API application and does not permit bundling the complete ESV text. Create a free application at [api.esv.org](https://api.esv.org/), then:

```bash
cp .env.example .env
```

Add your token to `.env` as `ESV_API_KEY`. The development proxy reads the key server-side, so it is not included in browser JavaScript. A deployed version should route `/api/esv` through an equivalent server or serverless function and retain the required ESV attribution.

## ESV compliance controls

- Every reference is validated before an ESV request is made.
- A request cannot exceed 500 verses or half of its book, whichever is less.
- Browser-persistent and server-side rate guards enforce 60 requests per minute, 1,000 per hour, and 5,000 per rolling day.
- Passage additions are rejected before stored ESV passages exceed 500 verses or half of a book.
- The app only displays one saved passage at a time during review and never displays enough text to breach the page limit.
- No email, feed, export, bulk-copy, download, or other ESV redistribution feature is provided.
- The complete required ESV notice and link are displayed globally.
- The project license prohibits commercial use.

These controls are intentionally conservative. Crossway's upstream API remains the final enforcement layer, and a production deployment with multiple server instances should use a shared durable rate-limit store.

## Authentication and data isolation

Authentication is provided by the project’s own Express API and PostgreSQL database. Passwords are hashed server-side with bcrypt and never returned to the browser. Successful authentication creates a signed, HTTP-only, same-site cookie. Every library, passage, review, and settings query includes the authenticated user ID, and the database uses a composite `(user_id, kind, item_id)` primary key so records cannot collide across accounts.

## Project layout

- `src/` — React interface, Scripture reading, and review flows.
- `server/` — Express API, PostgreSQL schema, and reminder scheduler.
- `android/` and `ios/` — Capacitor native projects.
- `.github/workflows/` — CI, container publishing, and signed Android releases.

## License

Ruminate is available under the [Ruminate Noncommercial Use License](LICENSE). Bible translations retain their publishers' respective rights and terms.

## Memory Bank

Mark a verse as memorized in My Library, or reach stage 6 with at least 90% accuracy and a Good or Easy review. Memory Bank keeps these verses available even if a later review is difficult. Start a random quiz to practice each memorized verse once in a shuffled order, or quiz an individual verse. Search by reference, text, or translation. Results and scheduling updates are saved to your account.

## Rename compatibility

Ruminate retains the existing `com.selah.scripturememory` installation ID, signing key, saved-data keys, database names, and Compose deployment identity so existing installs and deployments keep their accounts and progress. The API remains at `https://selah.simmonsweb.com` until a new domain is configured. New container images are published under `ghcr.io/bsimmons123/ruminate`.
