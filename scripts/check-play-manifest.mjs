import { readFileSync } from "node:fs";

// Inspect the merged release manifest, including contributions from dependencies.
const manifest = readFileSync("android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml", "utf8");
if (!manifest.includes('package="com.bible.ruminate"')) throw new Error("Expected Android package com.bible.ruminate");
if (!manifest.includes('android:name="com.bible.ruminate.MainActivity"')) throw new Error("Expected Ruminate activity in the new package");
for (const forbidden of ["REQUEST_INSTALL_PACKAGES", "ENFORCE_UPDATE_OWNERSHIP", "InstallResultReceiver"]) {
  if (manifest.includes(forbidden)) throw new Error(`Play manifest contains ${forbidden}`);
}
if (!manifest.includes('android:targetSdkVersion="36"')) throw new Error("Expected target SDK 36");
if (/android:(?:debuggable|usesCleartextTraffic)="true"/.test(manifest)) throw new Error("Unsafe release manifest setting");
const buildConfig = readFileSync("android/app/build/generated/source/buildConfig/release/com/bible/ruminate/BuildConfig.java", "utf8");
if (!buildConfig.includes('UPDATE_SOURCE = "play"')) throw new Error("Bundle was not built for Google Play");
console.log("Play release manifest and update source verified.");
