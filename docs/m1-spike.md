# M1 spike checklist (manual, on real machines)

Automated `pnpm e2e` uses a synthetic canvas+tone source, so it proves
negotiation and track flow only. The questions below need a real Windows
machine with Chrome/Edge. Run `pnpm dev:signaling` and `pnpm dev:web`, open the
room in two windows (or two machines) and click **Share my screen**. The app
has no diagnostics panel: the sharing screen says whether system audio is on,
and the rest comes from the browser's WebRTC page (`chrome://webrtc-internals`
or `edge://webrtc-internals`, `about:webrtc` in Firefox) or the console, e.g.
`navigator.mediaDevices.getSupportedConstraints()`.

Avoid an infinity mirror when testing on one machine: don't capture a screen
that shows the receiving window (use two profiles on separate monitors, or
share a tab). System-audio loopback will also capture the receiver's own
playback, so mute the receiver video and play audio from a third window.

| # | Question | How to check | Result |
|---|---|---|---|
| 1 | Does the picker offer "share system audio" for **entire screen** (Chrome and Edge)? | Picker UI | |
| 2 | Does the sharing screen say "system audio on" after ticking it? What do the audio track settings say (channelCount, sampleRate)? | Sharing screen, webrtc-internals | |
| 3 | Window capture: audio or none? Tab capture: audio or none? | Sharing screen | |
| 4 | Do `restrictOwnAudio` / `suppressLocalAudioPlayback` exist in `getSupportedConstraints()`? | Console | |
| 5 | Does Netflix / Disney+ / Prime / YouTube show video or black, in Chrome and in Edge? With hardware acceleration off? | Receiver | |
| 6 | Is audio stereo and in sync with video on the receiver? | Listen | |
| 7 | Does the partner's browser "Stop sharing" bar end the share cleanly on both sides? | UI | |

## Automated cross-engine run (fake media)

`PAIRS=all pnpm e2e` runs the call for every engine pair (A joins first and
offers, B answers). Playwright builds only: its WebKit is not Safari, its
Firefox is patched, and media is the `?fake` canvas source. Each pair also
reloads one peer mid-share and simulates a dropped connection (ICE restart).

CI runs Chromium <-> Chromium only. On the GitHub Ubuntu runner, Playwright's
Firefox never starts ICE gathering (no local candidates; the connection fails
at once), with or without mDNS obfuscation and the socket process turned off,
so Linux Firefox is **unverified** until it is run on a real Linux machine.

2026-11-24, macOS arm64, playwright-core 1.63 (Chromium 153, Firefox 155, WebKit build 2359):

| A (offers) \ B (answers) | chromium | firefox | webkit |
|---|---|---|---|
| chromium | pass | pass | pass |
| firefox | pass | pass | pass |
| webkit | pass | **fail** | pass |

The fail is WebKit receiving Firefox's share. WebKit's offer puts H.264 first,
Firefox's answer keeps it, and Playwright's Firefox has no OpenH264 plugin, so
it advertises H.264 but encodes nothing (`framesEncoded` 0). Chromium and
Firefox offer VP8 first, so every other pair uses VP8. Still to check on real browsers: real
Firefox sharing to real Safari, including a fresh Firefox profile that hasn't
downloaded OpenH264 yet.
