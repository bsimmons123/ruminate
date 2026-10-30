# Google Play release

Ruminate uses the existing package ID `com.selah.scripturememory`. Play builds use
`-PupdateSource=play`: the merged manifest removes APK installation permissions and
the install receiver, the native plugin refuses APK installation, and the app does
not check GitHub for updates. Google Play manages updates. The default build still
supports sideload distribution.

## Build the upload artifact

The manual **Build Google Play bundle** GitHub Actions workflow produces a signed
`ruminate-play.aab` and checksum as a workflow artifact. It does not upload to Play
or publish a GitHub Release.

Required repository secrets:

- `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and
  `ANDROID_KEY_PASSWORD`: the existing Android signing secrets.
- `ANDROID_GOOGLE_SERVICES_JSON`: the complete Firebase `google-services.json`
  configuration for Android package `com.selah.scripturememory`. Do not put a
  Firebase Admin service-account key here. The backend also needs its existing
  Firebase Admin configuration for reminder delivery.

Run the workflow with a version name such as `1.0.0` and a unique integer version
code greater than every code already distributed through Play or sideloading.
The workflow validates the merged manifest, runs Android unit tests, signs the
bundle, and verifies its signature. Download the artifact for Play Console.

For a local unsigned build with Node 22+, Java 21 and Android SDK 36:

```sh
npm run mobile:sync:prod
cd android
./gradlew bundleRelease testReleaseUnitTest -PupdateSource=play -PappVersionCode=100 -PappVersionName=1.0.0
cd ..
node scripts/check-play-manifest.mjs
```

The sample code `100` is only for local verification; choose the next actual release
code before uploading. The local bundle is
`android/app/build/outputs/bundle/release/app-release.aab` and still needs signing.
The workflow signs it with `jarsigner`; APK signing with `apksigner` is not suitable
for an AAB.

## Configure Play App Signing

To let existing sideload installations upgrade in place, supply the existing app
signing key when enrolling in Play App Signing. Letting Google generate a different
app signing key breaks that upgrade path. Signing the uploaded AAB with the current
key alone does not control the key Google uses for delivered APKs. Keep the original
key backed up; a separate upload key can be configured later.

Official reference: https://developer.android.com/studio/publish/app-signing

## Public policy and deletion pages

Deploy the web changes before submitting these URLs:

- Privacy: `https://ruminate.bible/privacy`
- Account deletion: `https://ruminate.bible/delete-account`

The deletion page explains self-service deletion in Settings and provides an email
request path for people without app access. Requests go to
`bsimmons@simmonsweb.com` and require manual ownership verification and processing.
Do not delete an account based solely on an unverified email request.

The existing deletion API removes the user row; database foreign keys cascade to
practice data and push registrations. The current device cache is cleared by the
client. Offline copies on other devices need their local storage cleared.
Confirm actual infrastructure log/backup retention with the operator before the
privacy declaration; the application does not control those retention periods.

## Final checks before submission

- Install through a Play internal test track; test sign-up, sign-in, offline
  practice, sync, reminders, and deletion using a disposable account.
- Verify privacy and deletion URLs work publicly after deployment.
- Check reminder delivery against the production Firebase project.
- Complete Data safety based on actual account/profile data, practice data, push
  registrations and hosting logs, including provider processing. Do not declare
  that the app collects no data.
- Supply review credentials, screenshots, listing text, content rating, target
  audience and ads declarations in Play Console.

These code changes prepare a release path; Play enrollment, signing setup,
production deployment, declarations and store review remain separate steps.
