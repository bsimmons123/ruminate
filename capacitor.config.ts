import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.selah.scripturememory",
  appName: "Ruminate",
  webDir: "dist",
  android: { allowMixedContent: (process.env.RUMINATE_MOBILE_DEV_HTTP || process.env.SELAH_MOBILE_DEV_HTTP) === "true" },
  server: { cleartext: (process.env.RUMINATE_MOBILE_DEV_HTTP || process.env.SELAH_MOBILE_DEV_HTTP) === "true" },
  plugins: {
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
    // Resize the webview so focused fields lift above the keyboard instead of
    // being covered by it.
    Keyboard: { resize: "native", resizeOnFullScreen: true }
  }
};

export default config;
