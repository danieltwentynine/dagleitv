import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ascii } from "../../AsciiArt";
import { LOBBY_ART, NO_SIGNAL, OFFLINE_ART, ROOM_FULL } from "../../ascii";
import { LinkIcon, PlayIcon, RetryIcon, WarnIcon } from "../../icons";
import { Logo } from "../../Logo";
import { parseRoomCode, randomRoomCode } from "../../roomCode";
import { ThemeToggle } from "../../ThemeToggle";
import styles from "./room.module.css";

/** Why joining failed, when it did. Anything else is shown as a banner. */
export type JoinFailure = "room-full" | "invalid-room" | "offline";

interface EnterRoomProps {
  roomId: string;
  forceRelay: boolean;
  onForceRelayChange(value: boolean): void;
  onJoin(): void;
  onCopyLink(): void;
  joining: boolean;
  error: string | null;
  failure: JoinFailure | null;
}

/** Pre-join gate. The "Join room" click is the gesture that lets audio autoplay. */
export function EnterRoom(props: EnterRoomProps) {
  const { roomId, forceRelay, onForceRelayChange, onJoin, onCopyLink, joining, error, failure } = props;
  const router = useRouter();
  const newRoom = () => router.push(`/room/${randomRoomCode()}`);

  return (
    <main className={styles.lobby}>
      <header className={styles.lobbyBrand}>
        <Logo />
        <span className={styles.lobbyRight}>
          <span className="tag cut c-s tag-mute">not joined</span>
          <ThemeToggle />
        </span>
      </header>

      {failure === "room-full" && (
        <div className={`gate ${styles.errorGate}`} data-testid="join-failure">
          <span className="tag cut c-s tag-warn">error 409</span>
          <Ascii text={ROOM_FULL} size="l" />
          <h1 className="t-display-l">Room full</h1>
          <p>Two people are already in here. Rooms hold two. That is the rule, and it is a good one.</p>
          <div className={styles.actions}>
            <button className="btn btn-primary cut" onClick={newRoom}>
              New room
            </button>
            <button className="btn cut" onClick={() => router.push("/")}>
              Try another code
            </button>
          </div>
        </div>
      )}

      {failure === "invalid-room" && <InvalidRoom roomId={roomId} onNewRoom={newRoom} />}

      {failure === "offline" && (
        <div className={`gate ${styles.errorGate}`} data-testid="join-failure">
          <span className="tag cut c-s tag-warn">offline</span>
          <Ascii text={OFFLINE_ART} size="l" />
          <h1 className="t-display-l">Cannot reach server</h1>
          <p>The signaling server is not answering. Your connection may be down, or ours. Try again in a moment.</p>
          <div className={styles.actions}>
            <button className="btn btn-primary cut" onClick={onJoin} disabled={joining}>
              <RetryIcon /> Retry
            </button>
          </div>
        </div>
      )}

      {!failure && (
        <div className={`gate ${styles.errorGate}`}>
          <span className="t-label dim">You were invited to</span>
          <div className="code" data-testid="room-code">
            {roomId}
          </div>
          <Ascii text={LOBBY_ART} size="l" />
          <h1 className="t-display-m">Join room</h1>
          <p>Your browser keeps the sound off until you click. So, click.</p>
          <div className={styles.actions}>
            <button data-testid="join" className="btn btn-primary btn-lg cut" onClick={onJoin} disabled={joining}>
              <PlayIcon /> {joining ? "Joining…" : "Join room"}
            </button>
            <button className="btn btn-lg cut" onClick={onCopyLink}>
              <LinkIcon /> Copy invite link
            </button>
          </div>
          <span className="t-meta mute">2 seats &middot; no accounts</span>

          {error && (
            <div className="banner banner-warn cut" role="alert">
              <WarnIcon />
              <span className="msg-t">{error}</span>
            </div>
          )}

          <details open={forceRelay || undefined}>
            <summary className="t-label mute">Advanced</summary>
            <label className={`t-meta ${styles.relay}`}>
              <input
                type="checkbox"
                data-testid="force-relay"
                checked={forceRelay}
                onChange={(e) => onForceRelayChange(e.target.checked)}
              />
              Force TURN relay (debug)
            </label>
          </details>
        </div>
      )}
    </main>
  );
}

function InvalidRoom({ roomId, onNewRoom }: { roomId: string; onNewRoom(): void }) {
  const router = useRouter();
  const [code, setCode] = useState(roomId);
  const [bad, setBad] = useState(false);
  const go = () => {
    const next = parseRoomCode(code);
    if (next) router.push(`/room/${next}`);
    else setBad(true);
  };
  return (
    <div className={`gate ${styles.errorGate}`} data-testid="join-failure">
      <span className="tag cut c-s tag-warn">error 404</span>
      <Ascii text={NO_SIGNAL} size="l" />
      <h1 className="t-display-l">No such room</h1>
      <p>That code does not lead anywhere. Check it against the link you were sent.</p>
      <form
        className={styles.actions}
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        <div className={`input cut c-bl${bad ? " err" : ""}`} style={{ width: 240 }}>
          <span className="pre">/</span>
          <input
            aria-label="Room code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setBad(false);
            }}
          />
        </div>
        <button className="btn btn-primary cut" type="submit">
          Go
        </button>
        <button className="btn cut" type="button" onClick={onNewRoom}>
          New room
        </button>
      </form>
    </div>
  );
}
