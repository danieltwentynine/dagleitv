import Link from "next/link";
import type { ConnectionPhase, VoiceState } from "@dagleitv/rtc-core";
import { LinkIcon, MicIcon, MicOffIcon, StatsIcon, TvIcon } from "../../icons";
import styles from "./room.module.css";

type Tone = "ok" | "warn" | "danger" | "neutral";

const PARTNER_MIC_LABEL: Record<VoiceState, string> = {
  off: "Partner's mic off",
  muted: "Partner muted",
  live: "Partner's mic on",
};

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
  remoteVoiceState: VoiceState;
  remoteSpeaking: boolean;
  onCopyLink(): void;
  onToggleStats(): void;
}

export function TopBar(props: TopBarProps) {
  const { roomId, phase, remoteSharing, remoteVoiceState, remoteSpeaking, onCopyLink, onToggleStats } = props;
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
      {phase === "connected" && (
        <span
          className={styles.partnerMic}
          data-testid="partner-mic"
          data-state={remoteVoiceState}
          data-speaking={remoteSpeaking}
          title={PARTNER_MIC_LABEL[remoteVoiceState]}
        >
          {remoteVoiceState === "live" ? <MicIcon size={14} /> : <MicOffIcon size={14} />}
          <span className={styles.hideNarrow}>{PARTNER_MIC_LABEL[remoteVoiceState]}</span>
        </span>
      )}
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
