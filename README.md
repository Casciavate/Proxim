# PROXIM — meet with precision

A mobile-first networking app for business events. Browse and RSVP to conferences,
check in when you arrive, then see who is in the room on a live proximity radar and
navigate to them with a compass.

<sub>React + Vite frontend, Express backend for LinkedIn sign-in and AI calls.</sub>

## Screens

| Screen | What it does |
| --- | --- |
| Discover | Search and filter events by sector and region; RSVP inline. Optional AI search adds suggested events. |
| My Events | Your RSVPs, your active check-in, and a shortcut into the radar. |
| Radar | A sweep radar of nearby attendees while checked in, with sector filters and an AI "who should I meet" prompt. |
| People | The full attendee directory, filterable by sector and by what each person is seeking. |
| Profile | LinkedIn import status and sign-out. |

Tapping anyone opens their profile sheet; from there, Navigate shows a compass that
counts the distance down as you walk.

## Run it

```bash
npm install
npm run dev          # frontend only, on http://localhost:5173
```

The frontend works on its own. With no backend running it shows DEMO MODE and the
LinkedIn button builds a placeholder profile, so you can click through every screen.

For real LinkedIn sign-in and the AI features, run both:

```bash
cp .env.example .env   # then fill in the keys below
npm start              # backend on :3001 and frontend on :5173
```

The app polls `http://localhost:3001/health` on load and switches itself to SERVER
LIVE when it answers.

## Configuration

All settings live in `.env` (see `.env.example`).

**LinkedIn.** Create an app at linkedin.com/developers, add the "Sign In with LinkedIn
using OpenID Connect" product, and register `http://localhost:3001/auth/linkedin/callback`
as an authorized redirect URL. Then set `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET`.

**Anthropic.** Set `ANTHROPIC_API_KEY` to enable the two AI buttons. Requests go through
the backend, so the key never reaches the browser. The model defaults to `claude-opus-5`
and can be changed with `ANTHROPIC_MODEL`.

Both are optional and independent. Without the LinkedIn keys, sign-in returns a clear
error instead of failing silently. Without the Anthropic key, the AI buttons say so.

## Backend endpoints

```
GET  /health                     service status and which integrations are configured
GET  /auth/linkedin              returns the LinkedIn authorization URL (opened in a popup)
GET  /auth/linkedin/callback     exchanges the code, creates a session, closes the popup
GET  /auth/me                    current session user, or {authenticated: false}
POST /auth/logout                destroys the session
POST /api/ai/events              {sector, region, query} -> {events: [...]}
POST /api/ai/suggest             {event, people}         -> {suggestion: "..."}
```

## What is real and what is not

This is a working prototype, and some parts are deliberately simulated. Being specific
about which:

- **Attendees, distances and bearings are mock data** in `src/ProximV3.jsx`. There is no
  Bluetooth, ultra-wideband, or GPS positioning behind the radar or the compass. The
  countdown on the navigation screen is a timer, not a measurement.
- **Events are a fixed list**, plus anything the AI search adds during a session. Nothing
  is persisted; a reload clears AI-sourced events, RSVPs, and check-ins.
- **LinkedIn sign-in is real**, but Sign In with LinkedIn using OpenID Connect returns
  only name, photo, email and locale. Work history, skills and endorsements are not in
  that scope. They need additional LinkedIn API products, which require review by
  LinkedIn. The profile screen reflects the fields that actually arrive.
- **Sessions are held in memory** in `server.js`, so restarting the backend signs
  everyone out. Move them to Redis or a database before deploying.
- **AI output is model-generated** and can be wrong. Suggested events in particular
  should be checked against the organizer's own site before you plan a trip.

The LinkedIn authorization, token and userinfo URLs in `server.js` follow LinkedIn's
current OpenID Connect documentation, but LinkedIn revises these periodically. If
sign-in starts failing, check their docs before debugging the code.

## Layout

```
index.html            page shell, fonts, favicon
src/main.jsx          React entry point
src/ProximV3.jsx      the whole app: data, screens, radar, compass, LinkedIn hook
server.js             Express backend: OAuth, sessions, Anthropic proxy
.env.example          configuration template
```
