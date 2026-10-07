"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ROOM_ID_PATTERN } from "@dagleitv/protocol";
import { ArrowRightIcon, TvIcon } from "./icons";
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
    <main className={styles.main}>
      <ThemeToggle className="corner" />
      <div className={`card ${styles.card}`}>
        <div className={styles.hero}>
          <div className={styles.logo}>
            <TvIcon size={32} />
          </div>
          <h1 className={styles.title}>Daglei TV</h1>
          <p className={styles.tagline}>Watch together, privately.</p>
        </div>

        <button
          className={`btn btn-primary btn-lg ${styles.start}`}
          onClick={() => router.push(`/room/${randomRoomCode()}`)}
        >
          Start a room
        </button>

        <div className={styles.divider}>or join one</div>

        <form className={styles.joinForm} onSubmit={joinExisting}>
          <input
            className="input"
            placeholder="Paste a room link or code"
            aria-label="Room link or code"
            aria-invalid={invalid}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setInvalid(false);
            }}
          />
          <button className="btn btn-icon" type="submit" aria-label="Join room" disabled={!code.trim()}>
            <ArrowRightIcon />
          </button>
        </form>
        {invalid && <p className={styles.error}>That doesn&apos;t look like a room link or code.</p>}

        <p className={styles.footnote}>Two people per room. No accounts, nothing stored.</p>
      </div>
    </main>
  );
}
