# PROXIM — meet with precision

A mobile-first networking app for business events. Browse and RSVP to real
events, check in when you arrive, opt in to share your live GPS position, and
find people checked in nearby with a real distance-and-compass radar.

<sub>React + Vite frontend, a stateless Express API on Vercel, Postgres on Supabase.</sub>

## What's real here, and what a phone browser genuinely cannot do

Everything in this app is backed by a real database and real accounts — there
is no mock data and no demo mode. But one thing in the original concept was
not physically possible on a phone's web browser, and the app is built around
that limit honestly rather than faking it:

- **No web page can do metre-level indoor positioning.** Web Bluetooth does
  not exist in Safari on iOS or iPadOS at all, and GPS alone is typically
  20–50 metres off indoors. So the radar shows **real GPS distance and a real
  compass bearing** — accurate outdoors and near entrances, honestly
  approximate indoors — with the device's current accuracy shown on screen
  whenever it's worse than about 30 metres. It never invents a number.
- **Location sharing is opt-in and off by default.** Checking in to an event
  makes you visible to others as "here," with your role, company and what
  you're looking for. Sharing your live position is a separate toggle on the
  Radar screen.
- **The compass needle only turns when the device reports a heading.** iOS
  requires a tap to grant that permission; some browsers never provide one.
  When no heading is available the app falls back to a clearly labeled
  north-up compass instead of pretending to know which way you're facing.

## Architecture

```
Browser  →  Vercel (static build + /api/* serverless functions)  →  Supabase Postgres
```

- **Frontend** (`src/`): React, built with Vite, served as static files.
- **Backend** (`server.js`): a single Express app. Locally it runs as an
  ordinary Node server (`npm run server`); on Vercel the same file is
  imported by `api/[...all].js` and run as a serverless function — every
  request can land on a different, cold instance, so there is no in-memory
  state anywhere in it.
- **Sessions**: a signed JWT in an httpOnly cookie, not a server-side session
  store — required for serverless, and it means restarting the backend never
  signs anyone out.
- **Database** (Supabase Postgres, `eu-central-1`): every table has Row Level
  Security enabled with no policies, so only the backend's service-role key
  can read or write it. Nothing is reachable directly from the browser.
- **Privacy boundary**: other attendees' raw coordinates are never sent to
  the browser. The backend computes distance and bearing server-side
  (`lib/geo.js`) and returns only those two numbers.

## Run it locally

```bash
npm install
cp .env.example .env   # fill in the keys below
npm start               # backend on :3001, frontend on :5173 (proxied to look same-origin)
```

Without any keys configured, the app still boots and is honest about it:
`/api/health` reports what's missing, every screen shows a real "not
configured" message instead of fake data, and nothing silently degrades to a
demo.

## Configuration

All settings live in `.env` locally, and as Environment Variables in the
Vercel project for production. See `.env.example` for the full list.

**Database (required for anything to work).** A Supabase project already
exists for this app in Frankfurt (`eu-central-1`) — closest region to the
Gulf and European events it lists, and the simplest story for GDPR, which
the app promises on sign-in. Get `SUPABASE_URL` and the **service role**
key from Project → Settings → API, and set `SESSION_SECRET` to a random
string (`openssl rand -hex 32`).

**LinkedIn (required for sign-in).** Create an app at
linkedin.com/developers, add the "Sign In with LinkedIn using OpenID
Connect" product, and register `https://<your-domain>/api/auth/linkedin/callback`
as an authorized redirect URL — the exact deployed domain, not localhost,
once you're live. Sign In with LinkedIn using OpenID Connect returns name,
photo, email and locale only — not role, company, or skills. The app asks
for those directly in a short onboarding step after first sign-in, because
LinkedIn's consumer API simply doesn't expose them without a separate
partner program application.

**Anthropic (optional — powers the two AI buttons).** Set
`ANTHROPIC_API_KEY` to enable AI event search and "who should I meet."
Requests go through the backend, so the key never reaches the browser.

Each of the three is independent: the app runs and is usable with only the
database configured; LinkedIn and Anthropic add features on top.

## Backend endpoints

```
GET   /api/health                        which integrations are configured
GET   /api/auth/linkedin                 LinkedIn authorization URL (opened in a popup)
GET   /api/auth/linkedin/callback        exchanges the code, sets the session cookie
GET   /api/auth/me                       current session user, or {authenticated: false}
POST  /api/auth/logout                   clears the session cookie
PATCH /api/me                            save role/company/sector/seeking/bio (onboarding)

GET   /api/events                        all events
POST  /api/events/ai                     {sector, region, query} -> generates and persists events
GET   /api/me/rsvps                      your RSVP'd event ids
POST  /api/events/:id/rsvp               toggle RSVP

GET   /api/me/checkin                    your current check-in, if any (restores state on reload)
POST  /api/events/:id/checkin            {shareLocation} -> check in / update sharing preference
POST  /api/events/:id/checkout           check out
POST  /api/events/:id/heartbeat          keep presence "active" without sending location
GET   /api/events/:id/presence           who's checked in — requires being checked in yourself
POST  /api/events/:id/location           {lat, lng, accuracyM, headingDeg} -> upserts your fix,
                                          returns everyone else's distance/bearing (never their coords)

POST  /api/ai/suggest                    {eventId} -> who to meet, from real checked-in attendees
```

## Deploying

The project is wired for Vercel: `vercel.json` builds the Vite frontend to
`dist/` and deploys `api/[...all].js` as the single serverless function
handling everything under `/api/*`. Link the GitHub repo in Vercel, set the
environment variables above, and push.

## Layout

```
index.html            page shell, fonts, favicon
src/main.jsx           React entry point
src/ProximV3.jsx        screens, radar, compass, auth
src/hooks.js            geolocation, device compass, presence/heartbeat polling
src/api.js               fetch wrapper for the backend
server.js                Express app: auth, events, check-in, radar, AI proxy
lib/supabase.js          Supabase client (service role — server-only)
lib/auth.js              JWT session signing/verification
lib/geo.js               distance + bearing math
api/[...all].js           Vercel entry point for server.js
.env.example              configuration template
```
