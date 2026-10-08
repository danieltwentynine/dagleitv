import type { ConnectionPhase, SignalQuality, VoiceState } from "@dagleitv/rtc-core";
import { ChatIcon, CopyIcon, HelpIcon, LeaveIcon, MicIcon, MicOffIcon } from "../../icons";
import { Logo } from "../../Logo";
import { ThemeToggle } from "../../ThemeToggle";
import styles from "./room.module.css";

type Tone = "ok" | "mute" | "warn" | "live";

const PHASE_TAG: Record<ConnectionPhase, { label: string; tone: Tone }> = {
  idle: { label: "starting", tone: "mute" },
  "waiting-for-peer": { label: "waiting", tone: "mute" },
  negotiating: { label: "connecting", tone: "warn" },
  connected: { label: "connected", tone: "ok" },
  disconnected: { label: "connection lost", tone: "warn" },
  failed: { label: "couldn't connect", tone: "warn" },
  closed: { label: "left room", tone: "mute" },
};

const PARTNER_MIC_LABEL: Record<VoiceState, string> = {
  off: "Partner's mic off",
  muted: "Partner muted",
  live: "Partner's mic on",
};

const SIGNAL_LABEL: Record<SignalQuality, string> = { good: "good", weak: "weak", offline: "offline" };

interface TopBarProps {
  roomId: string;
  phase: ConnectionPhase;
  sharing: boolean;
  remoteSharing: boolean;
  remoteVoiceState: VoiceState;
  remoteSpeaking: boolean;
  signal: SignalQuality | null;
  chatOpen: boolean;
  unreadChat: number;
  onCopyLink(): void;
  onToggleChat(): void;
  onToggleHelp(): void;
  onLeave(): void;
}

export function TopBar(props: TopBarProps) {
  const { roomId, phase, sharing, remoteSharing, remoteVoiceState, remoteSpeaking, signal, chatOpen, unreadChat } = props;
  const status: { label: string; tone: Tone } =
    phase === "connected" && sharing
      ? { label: "you are live", tone: "live" }
      : phase === "connected" && remoteSharing
        ? { label: "partner is sharing", tone: "live" }
        : PHASE_TAG[phase];

  return (
    <header className="topbar">
      {/* Not a link: leaving the room goes through the Leave button. */}
      <div className="brandrow">
        <Logo />
      </div>
      <span className="rule" style={{ width: 1, height: 20 }} />
      <span className="t-label dim">Room</span>
      <span className={`t-body ${styles.code}`}>{roomId}</span>
      <button className="btn btn-ghost ibtn cut" onClick={props.onCopyLink} aria-label="Copy room link" title="Copy link">
        <CopyIcon />
      </button>
      <span className="sp" />
      {phase === "connected" && (
        <span
          className="tag cut c-s tag-mute"
          data-testid="partner-mic"
          data-state={remoteVoiceState}
          data-speaking={remoteSpeaking}
          title={PARTNER_MIC_LABEL[remoteVoiceState]}
        >
          {remoteVoiceState === "live" ? <MicIcon small /> : <MicOffIcon small />}
          {PARTNER_MIC_LABEL[remoteVoiceState]}
        </span>
      )}
      <span className="sr" data-testid="remote-sharing">
        {remoteSharing ? "Partner is sharing" : ""}
      </span>
      {signal && (
        <span
          className={`tag cut c-s tag-mute ${styles.signal}`}
          data-quality={signal}
          data-testid="signal"
          title={`Connection: ${SIGNAL_LABEL[signal]}`}
        >
          signal {SIGNAL_LABEL[signal]}
        </span>
      )}
      <span
        className={`tag cut c-s tag-${status.tone}`}
        data-testid="phase"
        role="status"
      >
        <span className={`dot${status.tone === "live" ? " blink" : ""}`} />
        {status.label}
      </span>
      <button className="btn btn-ghost ibtn cut" onClick={props.onToggleHelp} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
        <HelpIcon />
      </button>
      <ThemeToggle />
      <span className={styles.badgeWrap}>
        <button
          className="btn btn-ghost ibtn cut"
          onClick={props.onToggleChat}
          aria-label={chatOpen ? "Hide chat (C)" : "Show chat (C)"}
          aria-pressed={chatOpen}
          title="Chat (C)"
          data-testid="chat-toggle"
        >
          <ChatIcon />
        </button>
        {unreadChat > 0 && (
          <span className="badge cut c-s" data-testid="chat-unread">
            {unreadChat > 9 ? "9+" : unreadChat}
          </span>
        )}
      </span>
      <button className="btn btn-sm cut" onClick={props.onLeave} data-testid="leave">
        <LeaveIcon small /> Leave
      </button>
    </header>
  );
}
