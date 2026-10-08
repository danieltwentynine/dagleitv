# Room spec

The room is one screen with three regions: the **stage** (left, fills the remaining width), the **chat** (right, `chat-w` 340px, collapsible) and thin chrome (top bar `bar-h`, control strip `strip-h`) that lives in the 16:9 letterbox. The video keeps a 16:9 frame with `object-fit: contain` on `stage` black.

## States

| State | Stage | Status tag | Key controls |
|---|---|---|---|
| Lobby / join gate | room code, one Join room button (needed so the browser allows audio) | not joined | Join room |
| Room full / no such room / cannot reach server | ASCII + one-sentence error | `error 409` / `error 404` / `offline` | New room, retry, code input |
| Waiting for partner | ASCII two screens, sleeping partner | waiting | Copy link (shows Copied), room code |
| Connecting | ASCII loader with four steps | connecting | none |
| Connected, nobody sharing | ASCII tv, instructions | connected | Share my screen (primary) |
| Partner is sharing | video; controls auto-hide after 3s without mouse movement | partner is sharing | Share disabled with tooltip "partner is sharing" |
| I am sharing | no local preview (infinity mirror), ON AIR art | you are live | Stop sharing; banner if no system audio |
| Click to play | paused frame plus panel | partner is sharing | Play |
| Reconnecting / connection lost / partner left | frozen frame or ASCII | reconnecting / connection lost / partner left | Retry, Leave, Copy link |
| Stats overlay (`S`) | readout top-left: conn, rtt, bitrate, res, fps, loss | any | toggle |
| Fullscreen (`F`) | video only; chat hidden; controls overlay and auto-hide | none | unread indicator top-right, 5s toast |

## Controls and shortcuts

`C` toggle chat, `S` stats, `F` fullscreen, `M` mute microphone, `?` shortcut help, `Esc` leave fullscreen. Voice chat (mic, volume) and quality presets (Smooth, Balanced, Low latency) are upcoming and are drawn quiet: ghost buttons, `ink-mute` labels, a `soon` tag.

## Chat

One line at the top says messages vanish when the room closes. Partner messages align left with an outlined cut bubble; yours align right on `raised` with a brand name label; system lines sit centered between hairlines; event lines ("partner started sharing") use `ink-dim`. Enter sends, Shift+Enter adds a line. A collapsed chat shows an unread `badge` on its toggle. In fullscreen only a `chat` tag with the unread count and a transient toast remain.

## Accessibility

All text 4.5:1 or better in the night theme (see Palette), UI borders and focus 3:1 or better, focus is a 3px white ring, every control is a real button, input or role="slider" with a name, targets are at least 32px, banners use `role="alert"`, the stats readout uses `role="status"`, and all animation stops under `prefers-reduced-motion`.
