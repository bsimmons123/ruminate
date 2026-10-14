import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.selah.scripturememory",
  appName: "Selah",
  webDir: "dist",
  android: { allowMixedContent: process.env.SELAH_MOBILE_DEV_HTTP === "true" },
  server: { cleartext: process.env.SELAH_MOBILE_DEV_HTTP === "true" },
  plugins: {
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] }
  }
};

export default config;
