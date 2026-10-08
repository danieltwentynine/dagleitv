"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ROOM_ID_PATTERN } from "@dagleitv/protocol";
import { AnimatedAscii, Ascii } from "./AsciiArt";
import { LANDING_FRAMES, LANDING_STARS } from "./ascii";
import { PlayIcon } from "./icons";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import styles from "./page.module.css";

function randomRoomCode(length = 10): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/** Accepts a bare room code or a full room link and returns the code. */
function parseRoomCode(input: string): string | null {
  const text = input.trim();
  const fromLink = text.match(/\/room\/([^/?#\s]+)/)?.[1];
  const code = fromLink ?? text;
  return ROOM_ID_PATTERN.test(code) ? code : null;
}

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [invalid, setInvalid] = useState(false);

  const joinExisting = (e: FormEvent) => {
    e.preventDefault();
    const room = parseRoomCode(code);
    if (!room) {
      setInvalid(true);
      return;
    }
    router.push(`/room/${room}`);
  };

  return (
    <div className={styles.land}>
      <header className={styles.head}>
        <Logo />
        <div className={styles.headRight}>
          <span className="t-label dim">private cinema &middot; two seats &middot; no accounts</span>
          <ThemeToggle />
        </div>
      </header>

      <main className={styles.main}>
        <div>
          <div className={styles.eyebrow}>
            <span className="tag cut c-s tag-live">
              <span className="dot" /> now showing
            </span>
            <span className="t-label dim">a screen shared between two people</span>
          </div>
          <h1 className={`t-display-xl ${styles.title}`}>
            Watch
            <br />
            together,
            <br />
            <em>1000 km</em> apart.
          </h1>
          <p className={`t-body-lg ${styles.pitch}`}>
            One of you shares a screen. Both of you press play. Voice and text chat are right there on the side.
          </p>
          <div className={styles.actions}>
            <button className="btn btn-primary btn-lg cut" onClick={() => router.push(`/room/${randomRoomCode()}`)}>
              <PlayIcon /> Create room
            </button>
            <span className={`t-label ${styles.or}`}>or</span>
            <form className={styles.join} onSubmit={joinExisting}>
              <div className={`input cut c-bl${invalid ? " err" : ""}`}>
                <span className="pre">/</span>
                <input
                  aria-label="Room code or link"
                  aria-invalid={invalid}
                  placeholder="room code or link"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    setInvalid(false);
                  }}
                />
              </div>
              <button className="btn cut" type="submit" disabled={!code.trim()}>
                Join
              </button>
            </form>
          </div>
          {invalid && (
            <p className={`${styles.err} t-body`} role="alert">
              That is not a room code or link. Check it and try again.
            </p>
          )}
        </div>

        <div className={styles.right}>
          <Ascii text={LANDING_STARS} className={styles.stars} />
          <AnimatedAscii frames={LANDING_FRAMES} ms={400} className={styles.hero} />
          <div className={styles.how}>
            <h2 className="t-label">How it works</h2>
            <ol className={styles.led}>
              <li>
                <span className={styles.n}>01</span>
                <span>Create a room and send the link.</span>
              </li>
              <li>
                <span className={styles.n}>02</span>
                <span>Share your entire screen. Tick &ldquo;Share system audio&rdquo;.</span>
              </li>
              <li>
                <span className={styles.n}>03</span>
                <span>Press play.</span>
              </li>
            </ol>
          </div>
          <div className={`${styles.note} cut c-diag f-void b-line`}>
            <span className="t-label brand">Honest note</span>
            <span>Works in Chrome or Edge on Windows. Two people only. Rooms are gone when you both leave.</span>
          </div>
        </div>
      </main>

      <footer className={styles.foot}>
        <span>daglei tv &mdash; built for two</span>
        <span>popcorn not included</span>
      </footer>
    </div>
  );
}
