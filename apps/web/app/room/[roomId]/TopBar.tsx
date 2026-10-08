import type { ConnectionPhase, SignalQuality, VoiceState } from "@dagleitv/rtc-core";
import { LeaveIcon, LinkIcon, MicIcon, MicOffIcon, TvIcon, ChatIcon } from "../../icons";
import { ThemeToggle } from "../../ThemeToggle";
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

const SIGNAL_LABEL: Record<SignalQuality, string> = { good: "Good", weak: "Weak", offline: "Offline" };

interface TopBarProps {
  roomId: string;
  phase: ConnectionPhase;
  remoteSharing: boolean;
  remoteVoiceState: VoiceState;
  remoteSpeaking: boolean;
  onCopyLink(): void;
  signal: SignalQuality | null;
  unreadChat: number;
  onToggleChat(): void;
  onLeave(): void;
}

export function TopBar(props: TopBarProps) {
  const { roomId, phase, remoteSharing, remoteVoiceState, remoteSpeaking, signal, unreadChat, onCopyLink, onToggleChat, onLeave } = props;
  const { label, tone } = PHASE_LABEL[phase];
  return (
    <header className={styles.topBar}>
      {/* Not a link: leaving the room goes through the Leave button. */}
      <span className="brand">
        <span className="brand-mark">
          <TvIcon size={16} />
        </span>
        Daglei TV
      </span>
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
      {signal && (
        <span className={styles.signal} data-quality={signal} data-testid="signal" title={`Connection: ${SIGNAL_LABEL[signal]}`}>
          <span className={styles.signalBars} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className={styles.hideNarrow}>{SIGNAL_LABEL[signal]}</span>
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
      <button
        className="btn btn-ghost btn-icon"
        style={{ position: "relative" }}
        onClick={onToggleChat}
        aria-label="Chat"
        title="Chat"
        data-testid="chat-toggle"
      >
        <ChatIcon />
        {unreadChat > 0 && <span className={styles.badge} data-testid="chat-unread">{unreadChat > 9 ? "9+" : unreadChat}</span>}
      </button>
      <ThemeToggle />
      <button className="btn btn-danger" onClick={onLeave} data-testid="leave">
        <LeaveIcon size={16} />
        <span className={styles.hideNarrow}>Leave</span>
      </button>
    </header>
  );
}
