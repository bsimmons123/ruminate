import { createPrivateKey, sign } from "node:crypto";
import http2 from "node:http2";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

let firebaseReady = false;

function firebaseMessaging() {
  if (!firebaseReady) {
    const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!inline && !process.env.GOOGLE_APPLICATION_CREDENTIALS) return null;
    if (!getApps().length) initializeApp({ credential: inline ? cert(JSON.parse(inline)) : applicationDefault() });
    firebaseReady = true;
  }
  return getMessaging();
}

function apnsToken() {
  const { APNS_KEY_P8, APNS_KEY_ID, APNS_TEAM_ID } = process.env;
  if (!APNS_KEY_P8 || !APNS_KEY_ID || !APNS_TEAM_ID) return null;
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: APNS_KEY_ID })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) })).toString("base64url");
  const body = `${header}.${payload}`;
  const signature = sign("sha256", Buffer.from(body), { key: createPrivateKey(APNS_KEY_P8.replace(/\\n/g, "\n")), dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${body}.${signature}`;
}

async function sendApns(deviceToken) {
  const token = apnsToken();
  if (!token || !process.env.APNS_BUNDLE_ID) return false;
  const host = process.env.APNS_SANDBOX === "true" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
  const client = http2.connect(host);
  try {
    const body = JSON.stringify({ aps: { alert: { title: "Time for Ruminate", body: "A Scripture verse is ready for review." }, sound: "default" }, page: "review" });
    const response = client.request({ ":method": "POST", ":path": `/3/device/${deviceToken}`, authorization: `bearer ${token}`, "apns-topic": process.env.APNS_BUNDLE_ID, "apns-push-type": "alert", "content-type": "application/json" });
    response.setEncoding("utf8");
    response.end(body);
    return await new Promise((resolve, reject) => { response.on("response", headers => resolve(headers[":status"] === 200)); response.on("error", reject); });
  } finally { client.close(); }
}

export async function sendReminder(device) {
  if (device.platform === "ios") return sendApns(device.token);
  const messaging = firebaseMessaging();
  if (!messaging) return false;
  await messaging.send({ token: device.token, notification: { title: "Time for Ruminate", body: "A Scripture verse is ready for review." }, data: { page: "review" }, android: { priority: "high" } });
  return true;
}

export function startReminderScheduler(pool) {
  let running = false;
  async function tick() {
    if (running) return;
    running = true;
    try {
      const { rows } = await pool.query(`select d.token,d.user_id,d.platform,d.timezone,d.last_sent_local_date::text as last_sent_local_date,
        exists(select 1 from user_data s where s.user_id=d.user_id and s.kind='settings' and s.data->>'reminders'='true') as enabled,
        exists(select 1 from user_data l where l.user_id=d.user_id and l.kind='library' and l.data->>'nextReview' <= $1) as due
        from push_devices d`, [new Date().toISOString()]);
      for (const device of rows) {
        if (!device.enabled || !device.due) continue;
        const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: device.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map(part => [part.type, part.value]));
        const localDate = `${parts.year}-${parts.month}-${parts.day}`;
        if (parts.hour !== "09" || device.last_sent_local_date === localDate) continue;
        try {
          if (await sendReminder(device)) await pool.query("update push_devices set last_sent_local_date=$1 where token=$2 and user_id=$3", [localDate, device.token, device.user_id]);
        } catch (error) { console.error("Reminder delivery failed:", error instanceof Error ? error.message : error); }
      }
    } catch (error) { console.error("Reminder scheduler failed:", error instanceof Error ? error.message : error); }
    finally { running = false; }
  }
  void tick();
  return setInterval(tick, 60_000);
}
