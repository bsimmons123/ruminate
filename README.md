# Selah

A mobile-first Scripture memorization app with a searchable Verse Store, curated collections, a personal library, and spaced-repetition review sessions.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:5173`.

## Included in this MVP

- Searchable, topic-filtered Verse Store
- Previewable curated and PostgreSQL-backed community collections
- Private user-created verse tags with library filtering
- Persistent personal library stored in PostgreSQL
- Interactive reviews with multiple-choice Easy mode and graded free-text Hard mode
- Again / Hard / Good / Easy review scheduling
- Library collections and mastery progress
- Responsive desktop and mobile navigation
- Seeded public-domain KJV passages
- Whole-Bible KJV passage lookup through GetBible
- Optional ESV lookup through Crossway's official API
- Persistent attempt history, accuracy trends, and per-verse improvement
- Vertical Scripture Reels feed with scroll snapping and one-tap pinning
- Book Reels carousel with selectable Genesis-to-Revelation titles and ordered verse feeds
- Installable mobile PWA with standalone display, home-screen icons, safe-area support, and offline app-shell caching
- Persistent KJV/ESV preference with room for future translation providers
- Server-backed account sign-up, sign-in, and personalized settings

## Production build

```bash
npm run build
npm run preview
```

## Run the complete stack

Copy the environment template and choose strong secrets:

```bash
cp .env.example .env
docker compose up --build
```

Open `http://localhost:3001`. Docker Compose starts PostgreSQL 17, initializes the schema, waits for a healthy database, and then starts the application API and compiled web client. Database data is retained in the `selah_postgres` named volume.

On mobile, open Settings → Install Selah. Android browsers can show the native install prompt; on iPhone, use Safari’s Share → Add to Home Screen. The service worker caches only the application shell and static assets—authenticated API and ESV responses are explicitly excluded.

Keep `COOKIE_SECURE=false` for local HTTP. Set it to `true` when deploying behind HTTPS. Always replace the example database password and JWT secret before exposing the application publicly.

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
