# Daglei TV

Private, two-person watch-together app: share your entire screen plus system audio
over plain peer-to-peer WebRTC (Windows, Chrome/Edge). No accounts, no database.

## Layout

| Path | What |
|---|---|
| `apps/web` | Next.js (App Router, TS) frontend. Deploy: Vercel. |
| `apps/signaling` | Node + Socket.IO relay for offer/answer/ICE; max 2 peers per room. Needs a long-lived WebSocket host (not Vercel). |
| `packages/protocol` | Shared wire types and constants. |
| `packages/rtc-core` | Framework-agnostic WebRTC core (no React/Next imports) so it can move to Electron unchanged. |

## Develop

```sh
pnpm install
cp apps/signaling/.env.example apps/signaling/.env   # optional, defaults work locally
cp apps/web/.env.example apps/web/.env.local
pnpm dev:signaling   # :4000, GET /health
pnpm dev:web         # :3000
pnpm typecheck
```

Requires Node 22+ and pnpm 10.

## Status

Initial scaffold only. Milestones M1 to M5 (screen share, TURN, quality tuning,
voice chat, polish) are not implemented yet.
