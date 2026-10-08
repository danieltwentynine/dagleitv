import { LinkIcon, PlayIcon, WarnIcon } from "../../icons";
import { Logo } from "../../Logo";
import { ThemeToggle } from "../../ThemeToggle";
import styles from "./room.module.css";

interface EnterRoomProps {
  roomId: string;
  forceRelay: boolean;
  onForceRelayChange(value: boolean): void;
  onJoin(): void;
  onCopyLink(): void;
  joining: boolean;
  error: string | null;
}

/** Pre-join gate. The "Join room" click is the gesture that lets audio autoplay. */
export function EnterRoom({ roomId, forceRelay, onForceRelayChange, onJoin, onCopyLink, joining, error }: EnterRoomProps) {
  return (
    <main className={styles.lobby}>
      <header className={styles.lobbyBrand}>
        <Logo />
        <ThemeToggle />
      </header>
      <div className="gate">
        <span className="tag cut c-s tag-mute">not joined</span>
        <h1 className="t-display-m">Room</h1>
        <div className="code" data-testid="room-code">
          {roomId}
        </div>
        <p>Your partner joins with the same link.</p>
        <div className={styles.actions}>
          <button data-testid="join" className="btn btn-primary btn-lg cut" onClick={onJoin} disabled={joining}>
            <PlayIcon /> {joining ? "Joining…" : "Join room"}
          </button>
          <button className="btn btn-lg cut" onClick={onCopyLink}>
            <LinkIcon /> Copy invite link
          </button>
        </div>

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
    </main>
  );
}
