# Deploy

The web app runs on Vercel. Signaling runs on Render as one long-lived process,
because rooms live in its memory.

## 1. Signaling on Render

1. Render dashboard > **New > Blueprint**, pick this repo. Render reads
   `render.yaml` and creates the `dagleitv-signaling` web service.
2. Fill in the variables it prompts for:
   - `ALLOWED_ORIGINS`: your Vercel URL, e.g. `https://dagleitv.vercel.app`.
     Separate several with commas. If you don't know it yet, put a placeholder and
     update it after step 2.
   - `CF_TURN_KEY_ID`, `CF_TURN_API_TOKEN`: the Cloudflare TURN key, same values
     as in `apps/signaling/.env`.
3. When it is live, `https://<service>.onrender.com/health` returns `ok`.
4. In the Cloudflare dashboard, set a usage alert on the TURN key. Anyone who
   finds `/ice` can get credentials (valid up to 4 hours), so the alert is the
   real guard against a surprise bill.

The free plan sleeps after about 15 minutes idle, so the first join after a quiet
spell waits about a minute. A paid instance stays awake.

## 2. Web on Vercel

1. Import the repo and set **Root Directory** to `apps/web`. Vercel detects
   Next.js and the pnpm workspace.
2. Add the environment variable `NEXT_PUBLIC_SIGNALING_URL` = the Render URL
   (no trailing slash). It is baked in at build time, so redeploy after changing it.

## 3. Connect the two

Put the final Vercel URL into `ALLOWED_ORIGINS` on Render. If the site is reached
from a URL that is not listed (a custom domain, a preview deployment), the
browser blocks the `/ice` request and calls fall back to STUN only.

## Why signaling is not on Vercel

Vercel Functions can serve WebSockets, but connections may land on different
instances, and each socket is closed after 5 minutes on Hobby (800 s on Pro).
With in-memory rooms, the two people could miss each other, and the socket cut
would tell the other side "peer left" and end the call. Moving signaling to
Vercel needs Redis (Socket.IO Redis adapter) and reconnects that keep the call up.

## Checks after deploying

- **Client IP behind Render's proxy.** The `/ice` rate limit is per IP. After the
  first join, the Render log has one `client ip check: resolved=...` line. If
  `resolved` is not your own public IP (for example a proxy address), every
  user shares one rate-limit bucket, and `clientIp` in
  `apps/signaling/src/server.ts` must read another header (the same line shows
  `cf-connecting-ip`).

## TURN abuse (only in an extreme case)

Anyone who opens a room can get the shared TURN credentials from `/ice`, valid
for up to 4 hours. That is accepted; the Cloudflare usage alert is the guard.
If usage spikes anyway:

1. Lower `ICE_RATE_LIMIT` on Render (default 10 per minute per IP).
2. To cut the current credentials off: create a new TURN key in Cloudflare
   (Realtime > TURN), put its id and token into `CF_TURN_KEY_ID` /
   `CF_TURN_API_TOKEN` on Render (saving restarts the service, which drops the
   cached credentials), then delete the old key. Every call relayed on the old
   credentials can drop, so pick a quiet moment. Whether deleting a key ends
   credentials already issued is not documented; to end one set explicitly,
   Cloudflare's `POST .../turn/keys/<key id>/credentials/<username>/revoke`
   takes the `username` from the current `/ice` response.
