# M2 network test (manual, real networks)

Goal: it connects both directly and through TURN, and you know the relayed
throughput ceiling.

## Setup

1. Cloudflare dashboard > Realtime > TURN: create a TURN key. Put its id and API
   token in `apps/signaling/.env` as `CF_TURN_KEY_ID` / `CF_TURN_API_TOKEN`.
   Without them the server serves STUN only and the web UI shows
   "TURN credentials: no (STUN only)".
2. Deploy signaling somewhere reachable by both people (set `ALLOWED_ORIGINS` to
   the web URL, and `TRUST_PROXY=1` behind a proxy). Point
   `NEXT_PUBLIC_SIGNALING_URL` at it.
3. Join the same room from two machines on **different** networks.

The **Network (M2)** panel under the video shows the selected candidate pair
(`local/remote` type, host / srflx / prflx / relay), RTT, send and receive kbps,
and the estimated available outgoing bitrate. The pair is read from `getStats()`
once a second.

## Runs

| # | Scenario | How | Pair seen | RTT | Connects? |
|---|---|---|---|---|---|
| 1 | Both on home networks, normal | Join as usual | | | |
| 2 | Forced relay | Tick "Force TURN relay (debug)" before joining (or `?relay=1`) on one side | `relay/srflx` udp (forced side), `srflx/relay` (other side) | 13-19 ms | Yes (2026-10-07, both peers on one PC, Chrome) |
| 3 | Phone hotspot / CGNAT on one side | Normal join, then again with forced relay | | | |

Forcing relay on one side is enough to force the pair through TURN.

Run 2 was done with both windows on one Windows PC, which is enough to prove
TURN works but not that NAT traversal does; runs 1 and 3 still need two
networks. On one PC, have one window share and the other only watch, and share
something that moves (a playing video): Chrome only encodes screen frames when
the content changes, so a still desktop sends about 1 kbps and looks broken.

## Relayed throughput ceiling

With relay forced, start a share and watch **send / recv kbps** and **est.
available outgoing** for a few minutes. Note the plateau. Also check whether the
provider throttles per-session bitrate (a flat ceiling far below your uplink).
For a real figure, also check Cloudflare's usage page afterwards: does it count
one direction or both?

| Scenario | Plateau kbps | Est. available kbps | Notes |
|---|---|---|---|
| Run 2, forced relay, one PC | 2,200-3,100 (1080p30 YouTube window + system audio) | ~4,900-5,100 | Not a ceiling: the estimate stayed well above the send rate, so the encoder was content-limited and no Cloudflare throttling showed. Both peers on one PC, so each packet used the uplink and downlink once. Cloudflare usage page not checked yet. |
