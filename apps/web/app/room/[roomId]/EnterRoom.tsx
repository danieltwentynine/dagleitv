import { LinkIcon, TvIcon } from "../../icons";
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

/** Pre-join card. The "Enter room" click is the gesture that lets audio autoplay. */
export function EnterRoom({ roomId, forceRelay, onForceRelayChange, onJoin, onCopyLink, joining, error }: EnterRoomProps) {
  return (
    <main className={styles.enterMain}>
      <div className={`card ${styles.enterCard}`}>
        <span className="brand">
          <span className="brand-mark">
            <TvIcon size={16} />
          </span>
          Daglei TV
        </span>

        <div className={styles.enterHead}>
          <h1>
            Room <span className={styles.code}>{roomId}</span>
          </h1>
          <p>Your partner joins with the same link.</p>
        </div>

        <div className={styles.enterActions}>
          <button data-testid="join" className="btn btn-primary btn-lg" onClick={onJoin} disabled={joining}>
            {joining ? "Entering…" : "Enter room"}
          </button>
          <button className="btn btn-ghost" onClick={onCopyLink}>
            <LinkIcon size={16} /> Copy invite link
          </button>
        </div>

        {error && (
          <p className={styles.banner} role="alert">
            {error}
          </p>
        )}

        <details className={styles.advanced} open={forceRelay || undefined}>
          <summary>Advanced</summary>
          <label className={styles.checkbox}>
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
