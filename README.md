# Campsite Watch — Devils Fork State Park

Polls the SC State Parks reservation system for Devils Fork every 10 minutes and sends a push notification the moment a new campsite/date opens up in October 2026. Runs entirely on Netlify's free tier (Scheduled Functions + Blobs) — no server to babysit.

## How it works

reserve.southcarolinaparks.com doesn't have a public JSON API — it's a server-rendered booking flow. The scheduled function replicates the exact form POST the site's own "Calendar View" makes (captured from a live session), reads the returned HTML table (#parkwideTable), and pulls every td.avail cell — those are the open nights, each carrying the site name and price as data attributes. It compares that list to what it saw last run (stored in Netlify Blobs) and only notifies on genuinely new openings, so you don't get re-pinged for the same slot every 10 minutes.

## One-time setup

Step one: get a notification channel. Easiest free option is ntfy.sh — pick a hard-to-guess topic name (e.g. joe-devils-fork-x7f2) and install the ntfy app (iOS/Android), or subscribe to https://ntfy.sh/your-topic in a browser tab. Anyone who knows your topic name can post to it, so don't use something guessable.

Step two: deploy this repo to Netlify (connect it as a linked repository in your Netlify site).

Step three: set environment variables in Netlify under Site settings, Environment variables. NTFY_TOPIC is the topic name from step one. RANGE_START and RANGE_END are optional and default to all of October 2026 (2026-10-01 / 2026-10-31) — change these if your window shifts. PARK_SLUG and PARK_ID are optional and default to Devils Fork (devils-fork / 12) — set these to point the watcher at a different SC state park.

Step four: test it. Visit https://your-site.netlify.app/.netlify/functions/test-notify once to confirm the ntfy push arrives. Then visit https://your-site.netlify.app/.netlify/functions/manual-check?dryRun=1 to run a real check without sending a notification or touching the stored baseline. Then run it again without dryRun=1 once to set the real baseline, so the very next scheduled run only alerts on genuinely new openings.

From then on it runs itself every 10 minutes.

## Notes and limits

Polling interval is every 10 minutes by default (edit the schedule in netlify/functions/check-availability.mts, standard cron syntax, UTC). If the site changes its markup or form fields, the function will start failing — check Netlify's function logs. The scrape is tied to the exact hidden-field set and #parkwideTable structure as of September 2026; a redesign on their end would need this updated. CSRF and session handling: each run fetches a fresh session and CSRF token before POSTing, so there's no stored credential to expire.
