const raw = process.env.VITE_API_BASE_URL;
if (!raw) {
  console.error("Set VITE_API_BASE_URL to the Selah API address before syncing the native app.");
  process.exit(1);
}
let url;
try { url = new URL(raw); } catch { /* handled below */ }
if (!url || !["http:", "https:"].includes(url.protocol) || url.pathname !== "/" || url.search || url.hash) {
  console.error("VITE_API_BASE_URL must be an http(s) origin without a path, query, or hash.");
  process.exit(1);
}
if (url.protocol === "http:" && !["localhost", "127.0.0.1"].includes(url.hostname) && process.env.SELAH_MOBILE_DEV_HTTP !== "true") {
  console.error("Use HTTPS for the mobile API, or set SELAH_MOBILE_DEV_HTTP=true for local Android development.");
  process.exit(1);
}
