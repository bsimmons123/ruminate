import pg from "pg";
import { sendReminder } from "../server/reminders.js";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: npm run push:test -- account@example.com");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || "postgresql://selah:selah@127.0.0.1:5432/selah" });
try {
  const { rows } = await pool.query(`select d.token,d.platform from push_devices d
    join users u on u.id=d.user_id where u.email=$1 order by d.updated_at desc limit 1`, [email]);
  if (!rows.length) throw new Error("No registered device found. Sign in on the Pixel and enable Daily reminders first.");
  if (!await sendReminder(rows[0])) throw new Error("Push provider credentials are missing or the provider rejected the notification.");
  console.log("Test push sent to the latest registered device for this account.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
