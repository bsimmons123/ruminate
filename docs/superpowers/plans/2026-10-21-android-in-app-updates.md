# Android In-App Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Ruminate Android app notices a newer release on open, shows an Update / Later banner, and downloads, verifies and installs the APK without leaving the app, the way Friday does.

**Architecture:** The Express backend reads the latest GitHub release of `bsimmons123/ruminate` (cached about 10 minutes) and exposes `GET /api/app/latest` and `GET /api/app/download`. A custom Capacitor Java plugin (`AppUpdate`) downloads, verifies and installs through PackageInstaller. The web layer decides when to check and what to show using pure functions in `src/update.ts`. CI stamps a monotonic `versionCode` and a versioned APK name.

**Tech Stack:** Node 22 / Express 5 (ESM, `node --test`), React + TypeScript (Vite), Capacitor 8 Android (Java, JUnit), GitHub Actions.

**Spec:** Approved in chat on 2026-10-21; no separate design document. The requirements are captured in Global Constraints below. The reference implementation is Friday: `friday/app/src/main/java/com/bsimmons/friday/update/` and `personal-operations/docs/FRIDAY-API.md` (`/api/app/latest`, `/api/app/download`).

## Global Constraints

- Android native app only. The web app and iOS never call the update endpoints and never show the banner.
- Endpoints are `GET /api/app/latest` and `GET /api/app/download`, unauthenticated, so the check also works on the sign-in screen.
- `/api/app/latest` returns exactly `{"configured": bool, "version": string|null, "version_code": int|null, "size": int|null, "published_at": string, "notes": string, "sha256": string|null}`.
- Release asset name: `ruminate-v<versionName>-c<versionCode>.apk` plus `ruminate-v<versionName>-c<versionCode>.apk.sha256`. Assets with other names (old `ruminate-android.apk` releases) are ignored.
- Release tag stays `android-<first 12 chars of sha>`. `versionCode` = `GITHUB_RUN_NUMBER`; `versionName` = `1.0.<GITHUB_RUN_NUMBER>`. Local builds default to `versionCode 1`, `versionName "1.0"`.
- An update is available only when the release `version_code` is strictly greater than the installed `versionCode`.
- Check on app launch and on resume, at most once per 10 minutes (`RESUME_CHECK_INTERVAL_MS = 10 * 60 * 1000`). Server cache TTL is `10 * 60 * 1000`.
- Quiet checks never show a spinner or an error. A failed check is silent.
- "Later" is remembered per version in `localStorage` key `ruminate-update-dismissed` (integer version code). A newer release than the dismissed one shows the banner again.
- The download must match the `X-Sha256` response header and the release checksum, and the advertised size. At least one checksum is required; none means refuse. Disagreeing checksums mean refuse. Delete the file on any failure.
- Install through PackageInstaller with a fallback to `ACTION_VIEW` on the FileProvider URI. Request `USER_ACTION_NOT_REQUIRED` on API 31 or later and update ownership on API 34 or later.
- Build-time `UPDATE_SOURCE` is `sideload` (default) or `play`, set with Gradle property `-PupdateSource=play`. In `play` mode the banner button opens `market://details?id=com.selah.scripturememory` (fallback `https://play.google.com/store/apps/details?id=com.selah.scripturememory`) and nothing is downloaded.
- Code style: match the repo. `server/` is plain ESM JS, `src/` is TypeScript, and tests are `node:test` files under `tests/`. No emoji in code or UI copy. Commit messages use Conventional Commits with no Co-Authored-By trailer.
- Non-goals: iOS, silent background installs, a UI test of the real install (manual check only), and removing `REQUEST_INSTALL_PACKAGES` for a Play build (part of the later Play migration).

## Review Focus

- GitHub unreachable or rate limited: `/api/app/latest` serves the last cached release; with no cache it returns `configured: true` with null version fields and status 200, never 500. (Task 1)
- Latest release has no asset matching the new naming (an old release): treated as no release. (Task 1)
- Upstream download fails mid-stream: the proxy destroys the response so the client's size check fails instead of installing a truncated file. (Task 1)
- Release without a checksum, or with a mismatched checksum or size: the download is refused and the partial file is deleted. (Task 4)
- Dismissed version 5, release 6 arrives: the banner shows again. Dismissed 6, release 6: hidden. (Task 3)
- Device offline at launch: no error shown, no banner change. (Task 5)
- Signature mismatch (an older debug-signed install): a plain explanation, not a raw installer string. (Task 3)
- Web, iOS and a non-native webview: no endpoint call, no banner. (Task 5)

---

### Task 1: Backend release endpoints

**Files:**
- Create: `server/appRelease.js`
- Create: `tests/app-release.test.mjs`
- Modify: `server/index.js` (add routes before the `app.use("/api", ... 404)` catch-all)
- Modify: `package.json` (add script `test:update`)

**Interfaces:**
- Produces (`server/appRelease.js`):
  - `ASSET_PATTERN = /^ruminate-v(.+)-c(\d+)\.apk$/`
  - `parseRelease(release, shaText): Latest | null`. `release` is the GitHub release JSON (`assets[].name/size/browser_download_url`, `published_at`, `body`). `shaText` is the `.sha256` asset body (`"<hex>  <file>"`) or null. Returns `Latest = { version, versionCode, size, publishedAt, notes, sha256, downloadUrl }`, or null when no asset matches.
  - `toLatestResponse(latest: Latest | null, configured: boolean): object`, the snake_case wire shape in Global Constraints. `downloadUrl` is never included.
  - `createReleaseCache({ fetchJson, fetchText, now, ttlMs }): { get(): Promise<Latest | null> }`. `fetchJson()` returns the GitHub release JSON and `fetchText(url)` returns text. `get()` returns the cached value within `ttlMs`, refreshes after, and on refresh error returns the previous value (or null).

- [ ] **Step 1: Write failing tests** in `tests/app-release.test.mjs` with fixtures for a GitHub release JSON:
  - `parseRelease` on a release with `ruminate-v1.0.42-c42.apk` (size 1234) and a sha text of `"ABCDEF...  ruminate-v1.0.42-c42.apk"` returns `version "1.0.42"`, `versionCode 42`, `size 1234`, lowercase `sha256`, and the `body` as `notes`.
  - A release whose only asset is `ruminate-android.apk` returns `null`.
  - `toLatestResponse(null, true)` equals `{configured:true, version:null, version_code:null, size:null, published_at:"", notes:"", sha256:null}`.
  - Cache: two `get()` calls inside the TTL call `fetchJson` once. A `get()` after the TTL, where `fetchJson` rejects, returns the previously cached value. A first `get()` that rejects returns `null`.
- [ ] **Step 2: Run** `node --test tests/app-release.test.mjs`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `server/appRelease.js` exactly per the Interfaces block.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Wire routes in `server/index.js`.** Build the cache once at startup. `fetchJson` calls `https://api.github.com/repos/${RUMINATE_APP_REPO}/releases/latest` (default repo `bsimmons123/ruminate`, optional `GITHUB_TOKEN` as a Bearer header, `Accept: application/vnd.github+json`, `User-Agent: ruminate`). `fetchText` fetches the `.sha256` asset URL. `GET /api/app/latest` responds with `toLatestResponse(await cache.get(), Boolean(repo))`. `GET /api/app/download` returns 404 JSON `{error}` when `get()` is null. Otherwise it fetches `downloadUrl` and pipes it with `Readable.fromWeb`. It sets `Content-Type: application/vnd.android.package-archive`, `Content-Length` from the Latest size, `X-Sha256` from the checksum (omitted if none), and `Cache-Control: no-store`. On upstream non-OK status it returns 502. On a stream error it calls `res.destroy()`. Add `X-Sha256` to the CORS `Access-Control-Expose-Headers` for the native origins, since the plugin reads it natively and the web layer does not need it, but this keeps the header visible to any WebView fetch.
- [ ] **Step 6: Add `"test:update": "node --test tests/app-release.test.mjs tests/update.test.mjs"`** to `package.json` scripts. The second file is created in Task 3, so run only the first until then. Add `npm run test:update` to the `ci.yml` verify job after the bible test step.
- [ ] **Step 7: Verify** with `node --check server/index.js`, then start the API against a local Postgres or stub (`npm run dev:api`) and run `curl -s localhost:3001/api/app/latest`. Expected: JSON with the documented keys, status 200 (null fields if no matching release exists yet).
- [ ] **Step 8: Commit** `feat(server): add app release endpoints`.

---

### Task 2: Release versioning in Gradle and CI

**Files:**
- Modify: `android/app/build.gradle` (defaultConfig, buildFeatures)
- Modify: `.github/workflows/publish-android.yml`

**Interfaces:**
- Produces: Gradle properties `appVersionCode` (int, default 1), `appVersionName` (default `"1.0"`), `updateSource` (default `"sideload"`). `BuildConfig.UPDATE_SOURCE` (String), `BuildConfig.VERSION_CODE`, `BuildConfig.VERSION_NAME`. Release assets named per Global Constraints.

- [ ] **Step 1: Edit `defaultConfig`** to read `versionCode (project.findProperty("appVersionCode") ?: 1).toInteger()` and `versionName (project.findProperty("appVersionName") ?: "1.0")`. Add `buildConfigField "String", "UPDATE_SOURCE", "\"${project.findProperty('updateSource') ?: 'sideload'}\""`. Add `buildFeatures { buildConfig true }` inside `android {}`.
- [ ] **Step 2: Edit the workflow.** Pass `-PappVersionCode=$GITHUB_RUN_NUMBER -PappVersionName=1.0.$GITHUB_RUN_NUMBER` to `./gradlew assembleRelease`. Sign to `$RUNNER_TEMP/ruminate-v1.0.${GITHUB_RUN_NUMBER}-c${GITHUB_RUN_NUMBER}.apk`. Write its checksum to the same name plus `.sha256` (run `sha256sum` from `$RUNNER_TEMP` so the file contains the bare filename). Upload and create the release with the new names. Replace the fixed `--notes` text with the commit subject (`git log -1 --pretty=%s`) followed by the existing sentence about the backend.
- [ ] **Step 3: Verify locally** with `cd android && ./gradlew assembleDebug -PappVersionCode=7 -PappVersionName=1.0.7`, then `aapt dump badging app/build/outputs/apk/debug/app-debug.apk | head -1`. Expected: `versionCode='7' versionName='1.0.7'`. If the Android SDK is not installed locally, say so and rely on the first CI run.
- [ ] **Step 4: Commit** `build(android): stamp versionCode from CI run number`.

---

### Task 3: Update decision logic (web, pure)

**Files:**
- Create: `src/update.ts`
- Create: `tests/update.test.mjs`

**Interfaces:**
- Produces (`src/update.ts`):
  - `type LatestRelease = { configured: boolean; version: string | null; versionCode: number | null; size: number | null; publishedAt: string; notes: string; sha256: string | null }`
  - `parseLatest(json: unknown): LatestRelease` (tolerates missing or wrongly typed fields)
  - `decideUpdate(latest: LatestRelease, installedCode: number): LatestRelease | null` (the release if `configured`, `version` and `versionCode` are present and `versionCode > installedCode`, else null)
  - `RESUME_CHECK_INTERVAL_MS = 10 * 60 * 1000`
  - `shouldCheckForUpdate(now: number, lastCheck: number, interval = RESUME_CHECK_INTERVAL_MS): boolean`
  - `shouldShowUpdateBanner(availableCode: number, installedCode: number, dismissedCode: number): boolean`
  - `isSignatureConflict(status: number, message?: string | null): boolean` and `installFailureMessage(status: number, message?: string | null): string`. Status values mirror `PackageInstaller.STATUS_*`: BLOCKED 2, ABORTED 3, INVALID 4, CONFLICT 5, STORAGE 6, INCOMPATIBLE 7. Port the message text from Friday's `UpdateModels.kt`, replacing "Friday" with "Ruminate" and the data-loss sentence with "Uninstalling deletes Ruminate's offline data on this phone; your library and reviews stay on your account."
  - `formatBytes(bytes: number): string` (same breakpoints as Friday: MB with one decimal, KB, B).

- [ ] **Step 1: Write failing tests** in `tests/update.test.mjs` (follow `tests/install-prompt.test.mjs`, importing `../src/update.ts`):
  - `decideUpdate` returns the release for code 6 versus installed 5, and null for equal codes, a lower code, `configured: false`, and null `versionCode`.
  - `shouldCheckForUpdate(1_000_000, 1_000_000 - 599_999)` is false and `(…, 1_000_000 - 600_000)` is true.
  - `shouldShowUpdateBanner(6, 5, 0)` true, `(6, 5, 6)` false, `(7, 5, 6)` true, `(5, 5, 0)` false.
  - `parseLatest({})` returns `configured: false` with null version fields; `parseLatest({version_code: "x"})` gives null `versionCode`.
  - `installFailureMessage(5, null)` mentions uninstalling; `installFailureMessage(1, "INSTALL_FAILED_UPDATE_INCOMPATIBLE: signatures do not match")` takes the signature-conflict message; `installFailureMessage(6, null)` mentions storage; `installFailureMessage(1, null)` returns "Android did not finish the install.".
- [ ] **Step 2: Run** `node --experimental-strip-types --test tests/update.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** `src/update.ts` per the Interfaces block. It has no imports from React or Capacitor so Node can load it.
- [ ] **Step 4: Run** the test again and `npm run test:update`. Expected: PASS. Update `test:update` to use `--experimental-strip-types` for both files, as `test:install` does.
- [ ] **Step 5: Commit** `feat: add update decision logic`.

---

### Task 4: Native `AppUpdate` Capacitor plugin

**Files:**
- Create: `android/app/src/main/java/com/selah/scripturememory/UpdateVerifier.java`
- Create: `android/app/src/test/java/com/selah/scripturememory/UpdateVerifierTest.java`
- Create: `android/app/src/main/java/com/selah/scripturememory/AppUpdatePlugin.java`
- Create: `android/app/src/main/java/com/selah/scripturememory/InstallResultReceiver.java`
- Modify: `android/app/src/main/java/com/selah/scripturememory/MainActivity.java` (register the plugin before `super.onCreate`)
- Modify: `android/app/src/main/AndroidManifest.xml` (`REQUEST_INSTALL_PACKAGES` and `ENFORCE_UPDATE_OWNERSHIP` permissions, the receiver, `<queries>` is not needed)

**Interfaces:**
- Produces (`UpdateVerifier`): `static Result verify(File file, String headerSha, String releaseSha, long expectedSize)` where `Result` has `boolean ok` and `String reason`. Rules mirror Friday's `verifyDownload`: at least one checksum is required; distinct checksums disagreeing fails; `expectedSize > 0` must equal the file length; the file's SHA-256 must equal the expected checksum. Also `static String sha256Hex(File file)`.
- Produces (plugin `AppUpdate`, JS name `"AppUpdate"`):
  - `getInfo()` resolves `{ versionCode: int, versionName: string, updateSource: "sideload"|"play", canInstall: boolean }`.
  - `downloadAndInstall({ url: string, sha256?: string, size?: number, versionCode: number })` resolves `{ status: "installing" }` once the session is committed. It rejects with code `NEEDS_PERMISSION` when `canRequestPackageInstalls()` is false (checked before downloading), `VERIFY_FAILED` (message from `UpdateVerifier`), or `DOWNLOAD_FAILED`. It emits the `downloadProgress` event `{ read, total }`, throttled to at most one event per 256 KB. Downloads to `cacheDir/updates/ruminate-<versionCode>.apk`, deletes any partial file on failure, and clears `cacheDir/updates` before starting. Installs with a PackageInstaller session (`setAppPackageName`, `USER_ACTION_NOT_REQUIRED` on API 31 or later, `setRequestUpdateOwnership(true)` on API 34 or later with a no-ownership retry on `SecurityException`), falling back to `ACTION_VIEW` with the FileProvider URI.
  - `openInstallSettings()` opens `Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES` for this package.
  - `openStore()` opens the `market://` URL, falling back to the https URL (Global Constraints).
  - Event `installResult` `{ status: int, message: string|null }`, emitted from `InstallResultReceiver` using a static reference to the plugin.
  - Relative `url` values are not accepted: JS passes an absolute URL.

- [ ] **Step 1: Write failing JUnit tests** in `UpdateVerifierTest.java` using a `TemporaryFolder`: matching header and release checksum with correct size gives ok; no checksums gives not ok with a "did not provide a checksum" reason; header and release differing gives not ok; wrong size gives not ok; wrong content gives not ok; checksum comparison is case-insensitive and trims whitespace.
- [ ] **Step 2: Run** `cd android && ./gradlew testDebugUnitTest --tests '*UpdateVerifierTest'`. Expected: FAIL, class missing. If the Android SDK is unavailable locally, say so, write the code carefully, and rely on CI to compile it.
- [ ] **Step 3: Implement `UpdateVerifier`** per the Interfaces block (`MessageDigest` SHA-256 over a 64 KB buffer).
- [ ] **Step 4: Run** the test again. Expected: PASS.
- [ ] **Step 5: Implement `AppUpdatePlugin` and `InstallResultReceiver`** per Interfaces, with the download done on a background executor using `HttpURLConnection`. Read the `X-Sha256` header from the response. Add the permissions and receiver (`exported="false"`) to the manifest. Register with `registerPlugin(AppUpdatePlugin.class)` in `MainActivity.onCreate` before `super.onCreate`. The `PendingIntent` for the install result must be `FLAG_MUTABLE`.
- [ ] **Step 6: Verify the build** with `cd android && ./gradlew assembleDebug`. Expected: BUILD SUCCESSFUL. If the SDK is missing locally, state that this step was left to CI.
- [ ] **Step 7: Commit** `feat(android): add AppUpdate plugin for in-app installs`.

---

### Task 5: Banner, wiring and Play mode (web)

**Files:**
- Create: `src/nativeUpdate.ts`
- Create: `src/components/UpdateBanner.tsx`
- Modify: `src/api.ts` (add `apiLatestRelease`)
- Modify: `src/App.tsx` (mount the banner in the native render branch near line 386, and trigger checks on mount and resume)
- Modify: `src/native.css` (banner styles that follow the existing native card and button styling)

**Interfaces:**
- Consumes: everything exported from `src/update.ts` (Task 3); the `AppUpdate` plugin contract (Task 4); `isNativeApp` from `src/nativePush.ts`; `apiUrl` from `src/api.ts`.
- Produces:
  - `apiLatestRelease(): Promise<LatestRelease>` in `src/api.ts` (plain fetch with no auth header, then `parseLatest`).
  - `src/nativeUpdate.ts`: `AppUpdate` (the `registerPlugin<AppUpdatePlugin>("AppUpdate")` binding with a typed interface), and `useAppUpdate(): { state: UpdateUiState; update(): void; later(): void }` where `UpdateUiState` is `{ kind: "hidden" } | { kind: "available"; release: LatestRelease; store: boolean } | { kind: "downloading"; read: number; total: number } | { kind: "installing" } | { kind: "needs-permission"; release: LatestRelease } | { kind: "failed"; message: string; release: LatestRelease }`.
  - The hook is a no-op returning `hidden` unless `isNativeApp && Capacitor.getPlatform() === "android"`.
  - Behavior: on mount and on `App` `appStateChange` to active, run a quiet check if `shouldCheckForUpdate(Date.now(), lastCheck)`. The last check time is kept in memory and in `localStorage` key `ruminate-update-checked`. It calls `AppUpdate.getInfo()` for the installed code, then `apiLatestRelease()`, then `decideUpdate`, then `shouldShowUpdateBanner` against the dismissed code. Errors are swallowed. `later()` stores the dismissed code and hides the banner. `update()` in `play` mode calls `AppUpdate.openStore()`. In `sideload` mode it calls `downloadAndInstall({ url: apiUrl("/app/download"), sha256: release.sha256, size: release.size, versionCode })`. It maps `downloadProgress` events to `downloading`, `NEEDS_PERMISSION` to `needs-permission` (the button then calls `openInstallSettings()`, and on the next resume with `canInstall` true it resumes the download), `installResult` with status 0 to `hidden`, and any other status to `failed` with `installFailureMessage`.
  - `UpdateBanner` renders the state with Update and Later buttons while available, a progress bar and percentage while downloading, "Installing..." while installing, and the failure message with Try again. Copy: "Ruminate {version} is available", with the release notes' first line as a subtitle if present. In store mode the button reads "Open Play Store".

- [ ] **Step 1: Add `apiLatestRelease`** and the `AppUpdate` binding with its typed interface.
- [ ] **Step 2: Implement `useAppUpdate`** per the behavior above. Keep every decision in the `update.ts` functions; the hook only orchestrates.
- [ ] **Step 3: Implement `UpdateBanner`** and its styles, and mount it so it appears on every native page (including the sign-in screen) above the page content without covering the bottom navigation.
- [ ] **Step 4: Verify** with `npm run build` (expects no TypeScript errors) and `npm run test:update` (PASS). In the browser dev server (`npm run dev`) confirm no banner renders and no `/api/app/latest` request is made (web is not native).
- [ ] **Step 5: Commit** `feat: show in-app update banner on Android`.

---

### Task 6: Docs and end-to-end check

**Files:**
- Modify: `README.md` (the Android release paragraph near line 56; add a short "In-app updates" section covering the two endpoints, the asset naming, `RUMINATE_APP_REPO` / `GITHUB_TOKEN`, and the `-PupdateSource=play` switch)

- [ ] **Step 1: Write the README changes**, matching the surrounding tone.
- [ ] **Step 2: Run the full local checks**: `npm run test:bible && npm run test:update && npm run test:install && npm run build && node --check server/index.js`. Expected: all pass.
- [ ] **Step 3: Manual check on a phone** (report it as done only if it actually happened). Install an APK built with `-PappVersionCode=1`, deploy the backend, push a commit so CI publishes `ruminate-v1.0.<n>-c<n>.apk`, open the app, and confirm the banner appears, Update downloads with progress, and the app updates in place (the permission page appears once on first use). Confirm Later hides the banner until the next release.
- [ ] **Step 4: Commit** `docs: describe in-app updates`.

---

## Self-review notes

- Spec coverage: backend endpoints (T1), versioning and asset naming (T2), decision logic and the failure copy (T3), native download, verification and install with fallback (T4), banner, Later, resume checks, permission flow and Play mode (T5), docs and manual end-to-end (T6). iOS and the web are covered by the platform guard in T5.
- Types: `LatestRelease` (camelCase) in `src/update.ts` matches the snake_case wire shape through `parseLatest`. `Latest` (server) is internal. The `downloadAndInstall` arguments match what T5 passes.
- Deployment order: the backend (T1) must be live before an APK with the banner ships, or the check silently fails, which is harmless.
