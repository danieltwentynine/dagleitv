# Daglei TV: port the design system into this app

This folder is the finished visual identity and hi-fi mockups for Daglei TV, a private two-person WebRTC screen-sharing app (landing page at `/`, room at `/room/[code]`). Port it into this Next.js project. Do not redesign.

## Read first
1. `BRAND.md` (rules, voice, tokens, the cut recipe) and `ROOM-SPEC.md` (room layout, states, shortcuts, accessibility).
2. `tokens.json` is the source of truth; `tokens.css` is the compiled CSS custom properties (night theme default); `components.css` is the shared component CSS (`.cut`, `.btn`, `.input`, `.tag`, `.banner`, `.tip`, chat `.msg`, `.room` shell).

## Hard rules
- Zero border-radius. Corners are cut with the `.cut` clip-path system (`--cut` 12px, `--cut-s` 6px). Flat fills only: no gradients, blur, shadows, glass, or emoji.
- Use only the tokens (`var(--brand)`, `var(--space-4)`...). Do not hardcode hex or px that a token covers.
- Fonts: Big Shoulders Display (headings, uppercase) and JetBrains Mono (everything else), served from `fonts/` with `next/font/local` or `@font-face`. ASCII art is plain 7-bit ASCII only.
- Focus is the 3px white ring built into `.cut:focus-visible`; keep every control keyboard reachable, 32px minimum target, honor `prefers-reduced-motion`.
- Copy is English, dry, short. Say "partner" and "room".

## Do this
1. Copy `fonts/`, `assets/` into `public/`; import `tokens.css` then `components.css` in `app/globals.css`.
2. Convert `mockups/Landing.html` to `app/page.tsx` (Create room generates a code and routes to `/room/<code>`; Join validates a code).
3. Build `app/room/[code]/page.tsx` from `mockups/Room*.html`. Each mockup is one state; implement them as one component driven by a state machine: lobby, full, invalid, offline, waiting, connecting, idle, watching (controls auto-hide after 3s of no mouse movement), sharing (no local preview), sharing-no-audio, click-to-play, reconnecting, failed, partner-left, plus overlays: stats (S), shortcut help, collapsed chat (C), fullscreen (F, stage only, chat hidden, unread indicator and toast). See `mockups/RoomFullscreen*.html`, `Room1366*.html` for the narrow layout.
4. Make the ASCII animations real: frames are in the `data-frames` attribute of the waiting/connecting/landing mockups; cycle them with a hook that shows only frame 0 under `prefers-reduced-motion`.
5. Favicons from `assets/favicon/`; set `<link rel="icon">` to the SVG with the 32px PNG as fallback.
6. Voice chat (mic, volume) and quality presets are UI-only for now: render them quiet with the `soon` tag, disabled.
7. Do not wire WebRTC unless asked. Keep the UI behind small props/hooks so signaling can be added next.

Open `mockups/*.html` in a browser to see each state (they are 1920x1080, static). Start with the landing page and the connected-idle room, show me both, then continue.
