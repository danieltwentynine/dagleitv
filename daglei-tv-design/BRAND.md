Daglei TV is a private cinema for exactly two people in a long-distance relationship: one person shares their whole screen and system audio, the other watches, and both talk. It is a tool, not a product. Design every screen as a dark room with one lit surface: `void` ground, `ink` text, one loud `brand` vermilion, and a video that owns the stage. The name is always set `DAGLEI TV` (caps), displayed in `t-display-*` or the lockup, and spoken as "Daglei TV".

## Content fundamentals

- **Voice:** dry, warm, short. Two sentences at most per message. One small joke per screen at most, never inside a blocking error. Real copy: "Nobody is sharing", "Room full", "burnt. as expected.", "popcorn not included", "Their seat is empty."
- **Words:** say *partner*, never user, peer or guest. Say *room*, never session. Say *share my screen*, never broadcast or stream. Say *link*, not URL.
- **Casing:** headlines and gate titles are uppercase through the display face. Buttons, tags and status are uppercase `t-label`. Chat text, helper copy and ASCII captions are lowercase or sentence case in `t-body`. Room codes are uppercase with a hyphen, `K7Q-2M9`.
- **Errors** state what happened and the next move, each in one sentence, always with a retry or exit button: "The signaling server is not answering. Try again in a moment."
- **Never** use emoji, exclamation marks, "oops", "awesome", "simply" or any pricing or sign-up language. There are no accounts. There is nothing to buy.
- **Language:** UI copy is English.

## Visual foundations

- **Pointy, not round.** Border radius is `radius-0` everywhere. The signature shape is a 45 degree chamfer drawn with `clip-path`: `cut` (12px) on one diagonal pair (top-right and bottom-left) for buttons, panels, banners, the video frame; `cut-s` (6px) for anything under 28px tall (tags, key caps, badges). Inputs cut bottom-left only; a chat message cuts the one corner that points at its speaker. Bordered cut shapes use the element as the border and an inset `::before` as the fill, with an inner cut of `cut - 0.586 * border`.
- **Color.** `void` is the page; `panel` holds chrome (top bar, control strip, chat); `raised` holds inputs, tooltips and your own chat messages; `stage` is pure black behind video. Text is `ink`, secondary `ink-dim`, metadata `ink-mute`. `brand` is the only loud color: the mark, the one primary action per region, LIVE and sharing state. `caution` is the only state accent: every warning, reconnect and error, always with a word. Success is `ink` with a check, never green. Put `on-brand` or `on-caution` on those fills, never white.
- **Type.** Big Shoulders Display (`t-display-xl`, `t-display-l`, `t-display-m`, `t-title`) for headings, uppercase, tight. JetBrains Mono (`t-body-lg`, `t-body`, `t-label`, `t-meta`, `t-ascii`) for everything else: buttons, status, chat, timestamps, ASCII. Labels are `t-label` uppercase with `+0.1em`. Minimum text size is 12px.
- **Spacing.** 8px grid, `space-1` to `space-10`. Be generous: dead space is the layout. One element per job, few elements per screen.
- **Lines.** Hard 1px `line` for dividers, 1px `line-strong` for control edges (4.5:1 or better on `void`, `panel`, `raised`), 2px for emphasis. Flat fills only: no gradients, no shadows, no blur, no glow, no transparency tricks.
- **Focus.** A 3px solid `focus` (white) ring, drawn by thickening the cut element's own border so `clip-path` never hides it. Rectangular targets without a cut use `outline: 2px solid var(--focus); outline-offset: 2px`. Every control is reachable by keyboard and at least `hit-min` (32px) tall.
- **Motion.** None decorative. Only ASCII frame animation (300 to 420 ms per frame, `steps`) in waiting and connecting states, and a 1.1s blink on the LIVE dot. Everything stops under `prefers-reduced-motion: reduce`; ASCII shows one still frame.
- **Imagery.** None except the video. Illustration is ASCII.
- **Layout.** Desktop only, 1280 to 2560px, Windows Chrome and Edge. Room: stage fills the left, chat docks right at `chat-w` (340px), top bar `bar-h` (44px), control strip `strip-h` (56px). In a 16:9 stage at 1366x768 and above the chrome sits in the letterbox, not over the picture.

## Logo

The mark is a screen shaped like a D: a solid block with both right corners cut at 45 degrees and a play triangle cut out of it. Use `lockup-primary-on-dark` on `void`, `lockup-primary-on-paper` on light grounds, the stacked lockup for square spaces, the wordmark alone where the mark already appears, and the one-color files for single-ink print, stamps and embroidery. Vermilion plus `ink` is the only color pairing; `TV` takes the vermilion. Clear space is one chamfer on every side. Minimum sizes: mark 16px, lockup 96px wide. Never round, outline, rotate, shadow or recolor it. The favicon files are pixel-aligned redraws of the mark, not scaled copies: use them as is. In READMEs and terminals use the ASCII mark in `assets/Ascii/logo.txt`.

## ASCII art

ASCII is a core brand element: the landing hero, waiting and connecting states, empty and error screens, and the README logo. Draw by hand with plain 7-bit ASCII only (`. - | _ ' / \ # o ( ) < > :`), never box-drawing or block glyphs, because the brand font does not carry them and fallback fonts break the grid. Set in `t-ascii` (14px on 16px), or scale the whole block with `ascii-l` (22/25) and `ascii-xl` (28/32). Color: `ink-dim` by default, at most one highlight (`brand` for live, `caution` for trouble). Keep pieces under 16 lines. Animate in whole frames only and always provide a still frame. Eight base motifs live in `assets/Ascii/motifs.txt`: tv, two screens, heart across distance, popcorn, sofa, late night, no signal, empty seat.

## Iconography

Inline SVG, 20px, 2px stroke, square caps, miter joins, `currentColor`, drawn on the same 45 degree vocabulary. No icon font, no emoji, no sparkle or wand icons. Icons always sit beside a word or have an `aria-label`. Glyphs shown in this system: share, stop, fullscreen, copy, chat, stats, help, mic, mic-off, volume, leave, check, close, play, warn, send, retry, link.

## Using the tokens in code

Every token compiles to a CSS custom property of the same name (`--brand`, `--space-4`, `--cut`). Colors switch with `[data-theme="night"]` (default, the product) and `[data-theme="paper"]` (logo sheets, print, this document). Compose the cut like this:

```css
.cut{--tl:0;--tr:0;--br:0;--bl:0;--b:var(--stroke-1);--bd:var(--line-strong);--fill:var(--panel);
  --ci:calc(var(--cut) - var(--b) * .5858);position:relative;isolation:isolate;background:var(--bd);
  clip-path:polygon(calc(var(--tl)*var(--cut)) 0,calc(100% - var(--tr)*var(--cut)) 0,100% calc(var(--tr)*var(--cut)),
    100% calc(100% - var(--br)*var(--cut)),calc(100% - var(--br)*var(--cut)) 100%,calc(var(--bl)*var(--cut)) 100%,
    0 calc(100% - var(--bl)*var(--cut)),0 calc(var(--tl)*var(--cut)))}
.cut::before{content:"";position:absolute;inset:var(--b);z-index:-1;background:var(--fill);
  clip-path:polygon(/* same polygon with --ci */)}
.c-diag{--tr:1;--bl:1}
```

The room and landing mockups in this system are working static HTML and CSS built only from these tokens and classes; port them as is.
