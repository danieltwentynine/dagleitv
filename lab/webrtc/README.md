# DagleiTV WebRTC lab

An **independent** laboratory for testing what a browser can do with WebRTC, without involving the DagleiTV app.
- It imports nothing from `apps/` or `packages/`.
- It is not in `pnpm-workspace.yaml`.
- It has **zero dependencies**: plain HTML and vanilla ES modules, with no build step and a Node built-ins server.

Every page shows a **capability report**: what the browser supports, what worked and what failed, with exact error names. A **Copy report as JSON** button includes `navigator.userAgent`, `navigator.userAgentData` (when present) and a timestamp.

## Run

```bash
cd lab/webrtc
npm start                 # http://localhost:8787  (pages + signaling on one port)
npm run start:lan         # also listen on the LAN (0.0.0.0); prints the LAN URLs
npm run check             # syntax-check every script (node --check); runs nothing in a browser
```
- **Options:** `--port <n>` (or `PORT`), `--host <addr>`, and `--https --cert <pem> --key <pem>`.
- **Requirements:** Node ≥ 20, with nothing to install.

### Secure context
`getUserMedia`, `getDisplayMedia` and the clipboard only work in a **secure context**.
- **Same machine:** `http://localhost:8787` counts as secure, so no setup is needed.
- **Other devices** (phone, second laptop) reach the lab by IP, which is **not** secure over plain HTTP. Pick one:
  1. **mkcert (LAN, recommended).** Install [mkcert](https://github.com/FiloSottile/mkcert), then:
     ```bash
     mkcert -install
     mkdir -p certs && mkcert -cert-file certs/lab.pem -key-file certs/lab-key.pem localhost 127.0.0.1 <your-LAN-IP>
     npm start -- --host 0.0.0.0 --https --cert certs/lab.pem --key certs/lab-key.pem
     ```
     Every other device must trust the mkcert root CA (`mkcert -CAROOT` shows it). On iOS, install the profile, then enable full trust in Settings → General → About → Certificate Trust Settings. On Android, install it as a CA certificate. `certs/` is git-ignored.
  2. **A tunnel** (Cloudflare Tunnel `cloudflared tunnel --url http://localhost:8787`, ngrok, Tailscale Funnel…). This gives a public HTTPS URL. Signaling goes through the tunnel; media still tries a direct path first (ICE). It exposes the lab publicly while it runs, so stop it afterwards.
  3. **Chrome flag (desktop only, testing):** `chrome://flags/#unsafely-treat-insecure-origin-as-secure` with `http://<LAN-IP>:8787`.

Viewing a stream (experiment 5, viewer role) needs no camera, so it works on plain HTTP.

## Experiments

| # | Page | What you'll learn |
|---|---|---|
| 1 | `camera.html` (Camera capture) | The permission flow and permission state. Device list before and after permission (labels appear only after it). Which constraints succeed: resolutions 480p–4K, `exact` vs `ideal`, 60 fps, `facingMode`, audio processing off. The actual `track.getSettings()` / `getCapabilities()`. Exact errors: `NotAllowedError`, `NotFoundError`, `NotReadableError`, `OverconstrainedError` (with the failing constraint), `SecurityError`. |
| 2 | `screen.html` (Screen capture) | Whether `getDisplayMedia` exists (it does not on iOS or most mobile browsers, which is reported cleanly). Which options the browser accepts: video size and fps, audio (tab or system), `displaySurface` preference, `systemAudio`, `selfBrowserSurface`, `surfaceSwitching`, `monitorTypeSurfaces`, `preferCurrentTab`. The surface the user picked. Whether audio came through. The `ended` event when the user clicks "Stop sharing". |
| 3 | `p2p.html` (P2P connection) | (a) A loopback call in one page. (b) A manual copy/paste offer/answer between two tabs or browsers, with no server, non-trickle, plus a data-channel ping. You see the offer/answer SDP, ICE candidates by type (host / srflx / prflx / relay, mDNS `.local` hosts), the ICE / connection / signaling state timeline and `icecandidateerror`. STUN is editable (default `stun:stun.l.google.com:19302`), TURN is optional, and the transport policy can be `relay`. |
| 4 | `codecs.html` (Codec inspection) | `RTCRtpSender` / `RTCRtpReceiver.getCapabilities()` for video and audio. `MediaCapabilities.encodingInfo` / `decodingInfo` (`type: 'webrtc'`) for VP8, VP9, H.264 (baseline and high), AV1, H.265 and Opus at 720p30, 1080p30 and 1080p60. Whether `setCodecPreferences` exists. The codec a loopback call actually negotiates (with your preference applied), plus the encoder and decoder implementation from `getStats()`. |
| 5 | `stream.html` (Cross-browser streaming) | Publish the camera, screen or a synthetic canvas from browser A, and view it in browser B on the same LAN through the lab's signaling (room code). The live per-peer stats show the codec, resolution, fps, kbps, packets sent and lost, RTT, available bitrate and the selected candidate pair types (e.g. `host/udp ↔ host/udp`). |

## Signaling (experiment 5)
- **Transport:** Server-Sent Events from server to browser (`GET /signal/events?room=…&role=…`) and `POST /signal/send` from browser to server.
  - Why not WebSocket: Node has no built-in WebSocket server, and SSE needs neither a package nor a hand-written frame parser.
- **What it relays:** only `offer`, `answer`, `candidate` and `bye`, between peers in the same room. Room codes are 3–32 letters, digits or dashes. At most 8 peers per room, and 64 KB per message.
- **Limits:** rooms live in memory; there is no auth and no persistence.
- **Lab use only:** don't expose it on the internet longer than a test.
- **Health check:** `GET /healthz`.

## Results template
Fill one row per browser/device. ✓ = works, ✗ = fails (put the error name), — = not applicable. Paste the copied JSON reports into `results/` if you keep them.

| Browser · version · OS / device | 1 Camera (max res @fps, facingMode) | 2 Screen (surface, audio, ended) | 3a Loopback | 3b Manual P2P (cand. types, mDNS) | 4 Codecs (send list; negotiated; HW enc/dec) | 5 Stream as publisher | 5 Stream as viewer (pair type, fps, RTT) | Notes |
|---|---|---|---|---|---|---|---|---|
| Chrome … · Windows 11 | | | | | | | | |
| Edge … · Windows 11 | | | | | | | | |
| Firefox … · Windows 11 | | | | | | | | |
| Safari … · macOS | | | | | | | | |
| Safari · iOS … (iPhone) | | | | | | | | |
| Chrome · Android … | | | | | | | | |

## Files
```
lab/webrtc/
  package.json          name daglei-webrtc-lab, private, no dependencies
  server/server.mjs     static files + SSE/POST signaling, optional --https
  scripts/check.mjs     node --check on every script
  public/
    index.html          links to the five experiments; secure-context check
    camera.html  screen.html  p2p.html  codecs.html  stream.html
    css/lab.css
    js/report.js        capability report + copy as JSON
    js/ice.js           ICE server form, candidate parsing, gathering wait
    js/stats.js         getStats summary (codec, res, fps, kbps, loss, RTT, pair)
    js/media.js         synthetic canvas stream, camera/screen sources
    js/signaling.js     EventSource + POST client
    js/camera.js  js/screen.js  js/p2p.js  js/codecs.js  js/stream.js
```
