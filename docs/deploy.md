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
