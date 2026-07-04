# SMOLBIZ

A small-business operations app: onboarding, sales & product tracking, AI sales
insights, worker attendance (GPS + photo), team chat with automatic calendar
scheduling, and B2B collaboration discovery. Plain HTML/CSS/JS — no build step —
backed by Supabase (auth, database, storage, realtime) and Groq for AI insights.

## What's simplified vs. the original spec

You asked to get this working end-to-end quickly, so a few of the harder pieces
are simplified for now — they're structured so you can upgrade them later:

- **Facial recognition** → the app takes a photo at clock-in/sale time as visual
  proof (via the browser camera) but does not run real face matching. Real face
  match would need a service like AWS Rekognition or a face-embedding model.
- **GPS geofencing** → uses the browser's `navigator.geolocation` and a straight-line
  distance check against the business's saved coordinates. Good enough for "is this
  worker near the shop," not survey-grade.
- **Google Calendar sync** → events live in your own Supabase `events` table and
  render on an in-app Calendar tab, rather than actually syncing to Google Calendar
  (that requires OAuth + a backend to hold refresh tokens).
- **Barcode scanner** → left out for now; products are selected from a dropdown or
  by SKU text field instead.
- **Chatbot NLP** → a lightweight regex-based parser (`parseMeetingIntent` in
  `js/utils.js`) looks for phrases like "meeting tomorrow at 4pm" and creates a
  calendar event. It's not a real NLP model, but it's genuinely functional for
  common phrasing. Swap it for a Groq call if you want it smarter.

Everything else (auth, onboarding, roles, dashboard KPIs, transactions, products,
worker management, permissions, real-time chat, settings) is fully wired up.

---

## 1. Create your Supabase project

1. Go to [supabase.com](https://supabase.com) → sign in → **New project**.
2. Pick an organization, name it (e.g. `smolbiz`), set a database password (save it),
   choose a region close to you, and click **Create new project**. Wait ~2 minutes.
3. In the left sidebar go to **Project Settings → API**. Copy:
   - **Project URL** → goes into `SUPABASE_URL` in `js/config.js`
   - **anon public** key → goes into `SUPABASE_ANON_KEY` in `js/config.js`

## 2. Create the database tables

1. In the Supabase dashboard, open **SQL Editor → New query**.
2. Open `schema.sql` from this project, copy the whole file, paste it in, click **Run**.
3. This creates all tables, row-level security policies, and a public storage
   bucket called `smolbiz-media` (used for logos, sale photos, and attendance photos).

## 3. Turn off email confirmation (for local testing)

By default Supabase requires users to click a confirmation email before they can
log in, which will block this app's signup flow until you wire up an email
provider. For testing:

1. **Authentication → Providers → Email**.
2. Turn **Confirm email** off.
3. Save.

(Turn it back on before letting real strangers sign up.)

## 4. Get a Groq API key (optional but recommended)

1. Go to [console.groq.com/keys](https://console.groq.com/keys) → sign in → **Create API key**.
2. Copy it into `GROQ_API_KEY` in `js/config.js`.

If you skip this, the AI Insight box on the dashboard still works — it falls back
to a locally-generated summary instead of calling Groq.

> **Security note:** this prototype calls Groq directly from the browser, so the
> key is visible in your page's network requests. That's fine to develop with, but
> before sharing this with real users, move the `fetch()` call in `js/groq.js`
> into a Supabase Edge Function so the key stays server-side.

## 5. Fill in `js/config.js`

Open `js/config.js` and paste in your three values:

```js
export const SUPABASE_URL = "https://your-project.supabase.co";
export const SUPABASE_ANON_KEY = "your-anon-key";
export const GROQ_API_KEY = "your-groq-key"; // or leave the placeholder
```

## 6. Run it locally

Because the app uses ES module imports, you need to serve it over `http://`
rather than opening `index.html` directly as a `file://` URL. From this folder:

```bash
# Python (built into macOS/Linux, or `python` on Windows)
python3 -m http.server 8080

# or Node
npx serve .
```

Then open `http://localhost:8080`.

## 7. Try the flow

1. **Sign up** as an admin (any email/password) → pick a business type → fill in
   the business profile → optionally invite a worker by email → land on the
   dashboard.
2. Add a product, log a sale, log an expense — watch the KPIs and AI insight update.
3. To test the **worker flow**: invite a worker email from Worker Management (or
   during onboarding), then sign up with that exact email in a different browser
   / incognito window — it'll detect the invite and drop them straight into the
   worker view instead of the admin onboarding wizard.
4. In **Chat & Calendar**, type something like `Meeting tomorrow at 4pm` — it'll
   post the message and automatically create a calendar event.

---

## Deploying

This is a static site (HTML/CSS/JS), so it deploys anywhere that serves static
files — Render, Netlify, Vercel, GitHub Pages, etc.

### Deploying on Render

1. Push this folder to a GitHub repo.
2. In Render: **New → Static Site**.
3. Connect the repo.
4. Build command: leave blank (nothing to build).
5. Publish directory: `.` (the repo root, where `index.html` lives).
6. Deploy. Render will give you a `https://your-app.onrender.com` URL.

Since `js/config.js` holds your Supabase/Groq keys directly in the client bundle,
there's nothing extra to configure as environment variables for this simple
version — just make sure `config.js` has your real values committed (or, better,
keep a separate untracked `config.js` per environment and .gitignore it, using a
placeholder file in git).

---

## Project structure

```
index.html              entry point
css/style.css            all styling (design tokens at the top)
js/config.js             Supabase + Groq keys (fill these in)
js/supabaseClient.js     Supabase client setup
js/state.js              shared in-memory app state
js/utils.js              helpers: formatting, toast messages, meeting-intent parser
js/auth.js               welcome/login/signup + admin onboarding wizard + worker join
js/shell.js              sidebar/nav shell shared by admin & worker views
js/admin.js              admin dashboard, sales/products, collab, worker mgmt, settings
js/worker.js             worker home (attendance + sales entry), settings
js/chat.js               real-time chat + calendar (NLP meeting detection)
js/groq.js               Groq API calls for AI insight + simple sales forecasting
js/main.js               boots the app, handles routing
schema.sql               run once in Supabase SQL editor
```

## Where to go next

- Swap the regex meeting-parser for a real Groq call for smarter chat scheduling.
- Add a Supabase Edge Function to proxy Groq calls (keeps your API key private).
- Add real Google Calendar sync via OAuth if you need events to show up in Google.
- Add barcode scanning with a library like `@zxing/browser` for the product checkout flow.
- Swap the photo-only attendance check for a real face-match API if you need stronger identity verification.
