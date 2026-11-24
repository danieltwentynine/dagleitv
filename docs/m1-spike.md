# M1 spike checklist (manual, on real machines)

Automated `pnpm e2e` uses a synthetic canvas+tone source, so it proves
negotiation and track flow only. The questions below need a real Windows
machine with Chrome/Edge. Run `pnpm dev:signaling` and `pnpm dev:web`, open the
room in two windows (or two machines), click **Share my screen**, then expand
**Capture diagnostics** and record the output.

Avoid an infinity mirror when testing on one machine: don't capture a screen
that shows the receiving window (use two profiles on separate monitors, or
share a tab). System-audio loopback will also capture the receiver's own
playback, so mute the receiver video and play audio from a third window.

| # | Question | How to check | Result |
|---|---|---|---|
| 1 | Does the picker offer "share system audio" for **entire screen** (Chrome and Edge)? | Picker UI | |
| 2 | Does `audioTrackCount` equal 1 after ticking it? What do the audio `settings` say (channelCount, sampleRate)? | Diagnostics | |
| 3 | Window capture: audio or none? Tab capture: audio or none? | Diagnostics | |
| 4 | Do `supportedConstraints.restrictOwnAudio` / `suppressLocalAudioPlayback` exist? | Diagnostics | |
| 5 | Does Netflix / Disney+ / Prime / YouTube show video or black, in Chrome and in Edge? With hardware acceleration off? | Receiver | |
| 6 | Is audio stereo and in sync with video on the receiver? | Listen | |
| 7 | Does the partner's browser "Stop sharing" bar end the share cleanly on both sides? | UI | |

## Automated cross-engine run (fake media)

`PAIRS=all pnpm e2e` runs the call for every engine pair (A joins first and
offers, B answers). Playwright builds only: its WebKit is not Safari, its
Firefox is patched, and media is the `?fake` canvas source. CI runs the
Chromium/Firefox pairs on Linux.

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
