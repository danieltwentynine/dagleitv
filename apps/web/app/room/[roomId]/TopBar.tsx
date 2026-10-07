import Link from "next/link";
import type { ConnectionPhase } from "@dagleitv/rtc-core";
import { LinkIcon, StatsIcon, TvIcon } from "../../icons";
import styles from "./room.module.css";

type Tone = "ok" | "warn" | "danger" | "neutral";

const PHASE_LABEL: Record<ConnectionPhase, { label: string; tone: Tone }> = {
  idle: { label: "Starting…", tone: "neutral" },
  "waiting-for-peer": { label: "Waiting for partner", tone: "warn" },
  negotiating: { label: "Connecting…", tone: "warn" },
  connected: { label: "Connected", tone: "ok" },
  disconnected: { label: "Connection lost", tone: "danger" },
  failed: { label: "Couldn't connect", tone: "danger" },
  closed: { label: "Left room", tone: "neutral" },
};

interface TopBarProps {
  roomId: string;
  phase: ConnectionPhase;
  remoteSharing: boolean;
  onCopyLink(): void;
  onToggleStats(): void;
}

export function TopBar({ roomId, phase, remoteSharing, onCopyLink, onToggleStats }: TopBarProps) {
  const { label, tone } = PHASE_LABEL[phase];
  return (
    <header className={styles.topBar}>
      <Link href="/" className={`brand ${styles.brandLink}`}>
        <span className="brand-mark">
          <TvIcon size={16} />
        </span>
        Daglei TV
      </Link>
      <span className={styles.roomCode}>Room {roomId}</span>
      <span className={styles.pill} data-tone={tone} data-testid="phase">
        <span className={styles.dot} />
        {label}
      </span>
      <span className={styles.partnerSharing} data-testid="remote-sharing">
        {remoteSharing ? "Partner is sharing" : ""}
      </span>
      <span className={styles.spacer} />
      <button className="btn" onClick={onCopyLink}>
        <LinkIcon size={16} />
        <span className={styles.hideNarrow}>Copy link</span>
      </button>
      <button className="btn btn-ghost btn-icon" onClick={onToggleStats} aria-label="Connection stats" title="Connection stats">
        <StatsIcon />
      </button>
    </header>
  );
}
