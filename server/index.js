import express from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pg from "pg";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { startReminderScheduler } from "./reminders.js";
import { bundledTranslations, getBibleBook, getBibleManifest, getBiblePassage } from "./bundled-bible.js";

const app = express();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || "postgresql://selah:selah@127.0.0.1:5432/selah" });
const jwtSecret = process.env.JWT_SECRET || "development-only-change-me";
const port = Number(process.env.PORT || 3001);
const validKinds = new Set(["library", "passage", "review", "settings"]);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ["https://localhost", "capacitor://localhost", "http://localhost"].includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Ruminate-Native");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: "256kb" })); app.use(cookieParser());

function safeUser(row) { return { id: row.id, name: row.name, email: row.email, createdAt: row.created_at }; }
function setSession(req, res, user) { const token = jwt.sign({ sub: user.id, jti: randomUUID() }, jwtSecret, { expiresIn: "30d" }); if (req.get("X-Ruminate-Native") === "true") return { ...safeUser(user), token }; res.cookie("selah_session", token, { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "true", maxAge: 30 * 86400000 }); return safeUser(user); }
function sessionHash(token) { return createHash("sha256").update(token).digest("hex"); }
async function requireUser(req, res, next) {
  const token = req.get("Authorization")?.match(/^Bearer (.+)$/i)?.[1] || req.cookies.selah_session;
  let payload;
  try { if (!token) throw new Error(); payload = jwt.verify(token, jwtSecret); }
  catch { return res.status(401).json({ error: "Please sign in to continue." }); }
  try {
    const { rows } = await pool.query("select 1 from revoked_sessions where token_hash=$1 and expires_at > now()", [sessionHash(token)]);
    if (rows.length) return res.status(401).json({ error: "This session has been signed out." });
    req.userId = payload.sub; req.sessionToken = token; req.sessionExpiresAt = new Date(payload.exp * 1000);
    next();
  } catch (error) { next(error); }
}

app.post("/api/auth/signup", async (req, res) => { try { const { name, email, password } = req.body; if (!name?.trim() || !email?.includes("@") || password?.length < 8) return res.status(400).json({ error: "Enter a name, valid email, and password of at least 8 characters." }); const hash = await bcrypt.hash(password, 12); const { rows } = await pool.query("insert into users(name,email,password_hash) values($1,$2,$3) returning *", [name.trim(), email.trim().toLowerCase(), hash]); res.status(201).json(setSession(req, res, rows[0])); } catch (error) { res.status(error.code === "23505" ? 409 : 500).json({ error: error.code === "23505" ? "An account with that email already exists." : "Account creation failed." }); } });
app.post("/api/auth/signin", async (req, res) => { const { rows } = await pool.query("select * from users where email=$1", [req.body.email?.trim().toLowerCase()]); if (!rows[0] || !await bcrypt.compare(req.body.password || "", rows[0].password_hash)) return res.status(401).json({ error: "That email and password combination wasn’t found." }); res.json(setSession(req, res, rows[0])); });
app.post("/api/auth/signout", requireUser, async (req, res, next) => {
  const client = await pool.connect().catch(next);
  if (!client) return;
  try {
    await client.query("begin");
    const deviceToken = req.body?.deviceToken;
    if (typeof deviceToken === "string" && deviceToken.length >= 16 && deviceToken.length <= 4096) {
      await client.query("delete from push_devices where token=$1 and user_id=$2", [deviceToken, req.userId]);
    }
    await client.query("insert into revoked_sessions(token_hash,expires_at) values($1,$2) on conflict(token_hash) do nothing", [sessionHash(req.sessionToken), req.sessionExpiresAt]);
    await client.query("delete from revoked_sessions where expires_at < now()");
    await client.query("commit");
    res.clearCookie("selah_session", { sameSite: "lax", secure: process.env.COOKIE_SECURE === "true" });
    res.json({ ok: true });
  } catch (error) { await client.query("rollback").catch(() => {}); next(error); }
  finally { client.release(); }
});
app.get("/api/auth/me", requireUser, async (req, res) => { const { rows } = await pool.query("select * from users where id=$1", [req.userId]); res.json(rows[0] ? safeUser(rows[0]) : null); });

/* Permanent account deletion. App Store guideline 5.1.1(v) requires any app that creates
   accounts to offer this in-app. user_data and push_devices cascade from users(id), so
   removing the user row removes the saved library, passages, reviews, settings and push
   registrations with it. The session is revoked in the same transaction so the deleted
   account's token cannot be replayed before it expires. */
app.delete("/api/account", requireUser, async (req, res, next) => {
  const client = await pool.connect().catch(next);
  if (!client) return;
  try {
    await client.query("begin");
    await client.query("insert into revoked_sessions(token_hash,expires_at) values($1,$2) on conflict(token_hash) do nothing", [sessionHash(req.sessionToken), req.sessionExpiresAt]);
    await client.query("delete from revoked_sessions where expires_at < now()");
    const { rowCount } = await client.query("delete from users where id=$1", [req.userId]);
    await client.query("commit");
    res.clearCookie("selah_session", { sameSite: "lax", secure: process.env.COOKIE_SECURE === "true" });
    if (!rowCount) return res.status(404).json({ error: "That account no longer exists." });
    res.json({ ok: true });
  } catch (error) { await client.query("rollback").catch(() => {}); next(error); }
  finally { client.release(); }
});

app.get("/api/data/:kind", requireUser, async (req, res) => { if (!validKinds.has(req.params.kind)) return res.status(400).json({ error: "Invalid data type." }); const { rows } = await pool.query("select data from user_data where user_id=$1 and kind=$2 order by updated_at desc", [req.userId, req.params.kind]); res.json(rows.map(row => row.data)); });
app.put("/api/data/:kind/:id", requireUser, async (req, res) => { if (!validKinds.has(req.params.kind)) return res.status(400).json({ error: "Invalid data type." }); await pool.query("insert into user_data(user_id,kind,item_id,data) values($1,$2,$3,$4) on conflict(user_id,kind,item_id) do update set data=excluded.data,updated_at=now()", [req.userId, req.params.kind, req.params.id, req.body]); res.json({ ok: true }); });
app.delete("/api/data/:kind/:id", requireUser, async (req, res) => { if (!validKinds.has(req.params.kind)) return res.status(400).json({ error: "Invalid data type." }); await pool.query("delete from user_data where user_id=$1 and kind=$2 and item_id=$3", [req.userId, req.params.kind, req.params.id]); res.json({ ok: true }); });
app.get("/api/collections", requireUser, async (_req, res) => { const { rows } = await pool.query("select id,title,description,curator,category,verse_ids as \"verseIds\",featured from community_collections order by featured desc, created_at desc"); res.json(rows); });
app.get("/api/community-tags", requireUser, async (_req, res) => { const { rows } = await pool.query(`select data->>'verseId' as "verseId", community_tag.tag, count(distinct user_id)::int as uses from user_data cross join lateral jsonb_array_elements_text(coalesce(data->'tags','[]'::jsonb)) as community_tag(tag) where kind='library' group by data->>'verseId',community_tag.tag having count(distinct user_id) >= 4 order by uses desc,community_tag.tag`); const grouped = {}; for (const row of rows) (grouped[row.verseId] ||= []).push({ tag: row.tag, uses: row.uses }); res.json(grouped); });

app.put("/api/devices", requireUser, async (req, res) => {
  const { token, platform, timezone } = req.body || {};
  if (typeof token !== "string" || token.length < 16 || token.length > 4096 || !["android", "ios"].includes(platform) || typeof timezone !== "string" || timezone.length > 100) return res.status(400).json({ error: "Invalid device registration." });
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }); } catch { return res.status(400).json({ error: "Invalid device time zone." }); }
  await pool.query("insert into push_devices(token,user_id,platform,timezone) values($1,$2,$3,$4) on conflict(token) do update set user_id=excluded.user_id,platform=excluded.platform,timezone=excluded.timezone,updated_at=now()", [token, req.userId, platform, timezone]);
  res.json({ ok: true });
});
app.delete("/api/devices/:token", requireUser, async (req, res) => { await pool.query("delete from push_devices where token=$1 and user_id=$2", [req.params.token, req.userId]); res.json({ ok: true }); });

app.get("/api/bible/:translation/manifest", async (req, res, next) => {
  const translation = req.params.translation.toLowerCase();
  if (!bundledTranslations.has(translation)) return res.status(404).json({ error: "That translation is not bundled." });
  try { res.json(await getBibleManifest(translation)); } catch (error) { next(error); }
});
app.get("/api/bible/:translation/passage", requireUser, async (req, res, next) => {
  const translation = req.params.translation.toLowerCase();
  if (!bundledTranslations.has(translation)) return res.status(400).json({ error: "That translation is not bundled." });
  try { res.json(await getBiblePassage(translation, String(req.query.q || ""))); }
  catch (error) { if (error.code) return next(error); res.status(400).json({ error: error instanceof Error ? error.message : "Passage could not be opened." }); }
});
app.get("/api/bible/:translation/book/:number", requireUser, async (req, res, next) => {
  const translation = req.params.translation.toLowerCase();
  if (!bundledTranslations.has(translation)) return res.status(400).json({ error: "That translation is not available for whole-book reading." });
  const number = Number(req.params.number);
  if (!Number.isInteger(number) || number < 1 || number > 66) return res.status(400).json({ error: "Choose a Bible book from 1 to 66." });
  try { res.json(await getBibleBook(translation, number)); } catch (error) { next(error); }
});

app.get("/api/esv", requireUser, async (req, res) => { try { if (!process.env.ESV_API_KEY) return res.status(503).json({ error: "ESV_API_KEY is not configured." }); const query = String(req.query.q || ""); if (!/^.+\s\d+:\d+(?:-\d+)?$/.test(query)) return res.status(400).json({ error: "Use a single-chapter reference such as John 3:16-18." }); const { rows } = await pool.query("select count(*) filter (where requested_at > now() - interval '1 minute')::int as minute, count(*) filter (where requested_at > now() - interval '1 hour')::int as hour, count(*) filter (where requested_at > now() - interval '1 day')::int as day from esv_requests"); if (rows[0].minute >= 60 || rows[0].hour >= 1000 || rows[0].day >= 5000) return res.status(429).json({ error: "ESV request limit reached. Please try again later." }); await pool.query("insert into esv_requests default values"); const upstream = await fetch(`https://api.esv.org/v3/passage/text/?q=${encodeURIComponent(query)}&include-headings=false&include-footnotes=false&include-verse-numbers=false&include-passage-references=false&include-short-copyright=false`, { headers: { Authorization: `Token ${process.env.ESV_API_KEY}` } }); const data = await upstream.json(); res.status(upstream.status).json(upstream.ok ? { reference: data.canonical, text: data.passages?.[0] || "" } : { error: data.detail || "ESV request failed" }); } catch (error) { console.error("ESV route failed:", error instanceof Error ? error.message : error); res.status(500).json({ error: "ESV passage could not be loaded." }); } });

app.use("/api", (_req, res) => res.status(404).json({ error: "API route not found. Restart Ruminate after updating the application." }));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."); app.use(express.static(path.join(root, "dist"), { setHeaders(res, file) { if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable"); } })); app.use((_req, res) => res.sendFile(path.join(root, "dist", "index.html")));
async function ensureCurrentSchema() {
  const schema = await readFile(new URL("./schema.sql", import.meta.url), "utf8");
  await pool.query(schema);
}
ensureCurrentSchema().then(() => { app.listen(port, "0.0.0.0", () => console.log(`Ruminate listening on ${port}`)); startReminderScheduler(pool); }).catch(error => { console.error("Database connection failed", error); process.exit(1); });
