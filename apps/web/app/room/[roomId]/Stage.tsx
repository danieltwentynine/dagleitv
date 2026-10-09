import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { ConnectionPhase, VoiceState } from "@dagleitv/rtc-core";
import { AnimatedAscii, Ascii } from "../../AsciiArt";
import {
  CONNECTING_FRAMES,
  CONNECTING_STEPS,
  CONNECTION_LOST,
  ON_AIR,
  PARTNER_LEFT,
  TV_IDLE,
  WAITING_FRAMES,
} from "../../ascii";
import {
  ChatIcon,
  CheckIcon,
  CopyIcon,
  ExitFullscreenIcon,
  FullscreenIcon,
  MicIcon,
  MicOffIcon,
  MuteIcon,
  PlayIcon,
  RetryIcon,
  ScreenShareIcon,
  StopIcon,
  VolumeIcon,
} from "../../icons";
import { Slider } from "./Slider";
import styles from "./room.module.css";

const VOLUME_KEY = "dagleitv.volume";
const IDLE_MS = 3000;
const FS_TOAST_MS = 5000;

const MIC_LABEL: Record<VoiceState, string> = {
  off: "Turn on mic",
  live: "Mute mic",
  muted: "Unmute mic",
};
const MIC_STATE_TEXT: Record<VoiceState, string> = { off: "Mic off", live: "Live", muted: "Muted" };

export interface LastChat {
  id: number;
  text: string;
  ts: number;
}

interface StageProps {
  topBar: ReactNode;
  /** Banners, toasts and popovers rendered over the stage (so they survive fullscreen). */
  children?: ReactNode;
  videoRef: RefObject<HTMLVideoElement | null>;
  roomId: string;
  phase: ConnectionPhase;
  sharing: boolean;
  /** False when the shared capture has no system audio track. */
  shareHasAudio: boolean;
  remoteSharing: boolean;
  /** The partner was here and left; the room is still open. */
  partnerLeft: boolean;
  /** Chat is hidden in fullscreen, so unread messages surface on the stage instead. */
  unreadChat: number;
  lastChat: LastChat | null;
  needsPlayClick: boolean;
  onPlayClick(): void;
  onPlaying(): void;
  onShare(): void;
  /** False on devices that can't capture a screen (phones); they watch and chat only. */
  canShare: boolean;
  onStopShare(): void;
  onCopyLink(): void;
  onReconnect(): void;
  onLeave(): void;
  micState: VoiceState;
  localSpeaking: boolean;
  onToggleMic(): void;
}

interface GateContent {
  /** Small line above the art. */
  eyebrow?: ReactNode;
  art?: ReactNode;
  title: string;
  /** Prose under the title. Omit when `extra` carries the content. */
  body?: ReactNode;
  /** Block content (not wrapped in a paragraph) under the title. */
  extra?: ReactNode;
  action?: ReactNode;
  /** Small line under the action. */
  note?: ReactNode;
}

/** The screen, its state gate, the top bar and the control strip. Fullscreen wraps all of it. */
export function Stage(props: StageProps) {
  const { videoRef, onToggleMic, lastChat } = props;
  const stageRef = useRef<HTMLElement>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [idle, setIdle] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fsToast, setFsToast] = useState<LastChat | null>(null);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(VOLUME_KEY));
      if (localStorage.getItem(VOLUME_KEY) !== null && saved >= 0 && saved <= 1) setVolume(saved);
    } catch {
      /* storage unavailable: keep the default */
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.volume = volume;
      video.muted = muted;
    }
    try {
      localStorage.setItem(VOLUME_KEY, String(volume));
    } catch {
      /* ignore */
    }
  }, [videoRef, volume, muted]);

  const wake = useCallback(() => {
    setIdle(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), IDLE_MS);
  }, []);

  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(document.fullscreenElement === stageRef.current);
      wake();
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      clearTimeout(idleTimer.current);
    };
  }, [wake]);

  // A new partner message while in fullscreen: show it as a 5 second toast.
  useEffect(() => {
    if (!isFullscreen || !lastChat) return;
    setFsToast(lastChat);
    const id = setTimeout(() => setFsToast(null), FS_TOAST_MS);
    return () => clearTimeout(id);
  }, [isFullscreen, lastChat]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stageRef.current?.requestFullscreen();
  }, []);

  const toggleMute = useCallback(() => {
    if (muted || volume === 0) {
      setMuted(false);
      if (volume === 0) setVolume(0.5);
    } else {
      setMuted(true);
    }
  }, [muted, volume]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "f" || e.key === "F") toggleFullscreen();
      else if (e.key === "m" || e.key === "M" || e.key === "v" || e.key === "V") onToggleMic();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFullscreen, onToggleMic]);

  const gate = gateFor(props);
  const live = props.remoteSharing && !gate;
  // Controls get out of the way while watching, and in fullscreen.
  const hideChrome = idle && (live || isFullscreen);
  const silent = muted || volume === 0;

  return (
    <main
      ref={stageRef}
      className={`stagecol ${styles.stage}`}
      data-live={live}
      data-hide-chrome={hideChrome}
      onMouseMove={wake}
    >
      <div className="vframe cutf">
        <video
          ref={videoRef}
          data-testid="remote-video"
          className={styles.video}
          autoPlay
          playsInline
          onDoubleClick={toggleFullscreen}
          onPlaying={props.onPlaying}
        />
      </div>

      {gate && (
        <div className="gate">
          {gate.eyebrow}
          {gate.art}
          <h1 className="t-display-m">{gate.title}</h1>
          {gate.body && <p>{gate.body}</p>}
          {gate.extra}
          {gate.action}
          {gate.note}
        </div>
      )}
      {live && props.needsPlayClick && (
        <div className={`cut c-diag f-void b-ink ${styles.panel}`} data-testid="click-to-play">
          <h1 className="t-display-m">Click to play</h1>
          <p className="dim">Your browser blocked autoplay. One click and the picture and sound start.</p>
          <button className="btn btn-primary btn-lg cut" onClick={props.onPlayClick}>
            <PlayIcon /> Play
          </button>
        </div>
      )}

      {props.topBar}

      <footer className="strip">
        {props.sharing ? (
          <button data-testid="stop-share" className="btn btn-primary cut" onClick={props.onStopShare}>
            <StopIcon /> Stop sharing
          </button>
        ) : (
          <button
            data-testid="share"
            className="btn btn-primary cut"
            onClick={props.onShare}
            disabled={props.remoteSharing || !props.canShare}
            title={!props.canShare ? "This device can't share its screen" : props.remoteSharing ? "Partner is sharing" : undefined}
          >
            <ScreenShareIcon /> Share my screen
          </button>
        )}

        <span className="rule" style={{ width: 1, height: 20 }} />

        <button
          data-testid="mic"
          className="btn btn-ghost ibtn cut"
          data-state={props.micState}
          data-speaking={props.localSpeaking}
          onClick={onToggleMic}
          aria-label={MIC_LABEL[props.micState]}
          aria-pressed={props.micState === "live"}
          title={`${MIC_LABEL[props.micState]} (M)`}
        >
          {props.micState === "live" ? <MicIcon /> : <MicOffIcon />}
        </button>
        <span className={`t-label ${styles.micLabel} ${props.micState === "live" ? "" : "mute"}`}>
          {MIC_STATE_TEXT[props.micState]}
        </span>

        <span className={styles.sliderWrap}>
          <button
            className="btn btn-ghost ibtn cut"
            onClick={toggleMute}
            aria-label={silent ? "Unmute movie" : "Mute movie"}
            title={`${silent ? "Unmute" : "Mute"} movie`}
          >
            {silent ? <MuteIcon /> : <VolumeIcon />}
          </button>
          <Slider
            label="Movie volume"
            value={muted ? 0 : volume}
            onChange={(v) => {
              setVolume(v);
              setMuted(false);
            }}
          />
          <span className={`t-meta ${styles.pct}`}>{Math.round((muted ? 0 : volume) * 100)}%</span>
        </span>

        <span className="sp" />

        {/* Quality presets are not wired yet: drawn quiet with the soon tag. */}
        <span className="seg" role="group" aria-label="Quality preset">
          <button className="btn btn-ghost cut c-s" disabled>
            Smooth
          </button>
          <button className="btn cut c-s" disabled aria-pressed="true">
            Balanced
          </button>
          <button className="btn btn-ghost cut c-s" disabled>
            Low latency
          </button>
        </span>
        <span className="tag cut c-s tag-mute">soon</span>
        <button
          className="btn btn-ghost ibtn cut"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          title={`${isFullscreen ? "Exit fullscreen" : "Fullscreen"} (F)`}
        >
          {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
        </button>
      </footer>

      {isFullscreen && props.unreadChat > 0 && (
        <span className={`tag cut c-s tag-live ${styles.fsAlert}`} data-testid="fs-chat-unread">
          <ChatIcon small /> chat <span className={`badge cut c-s ${styles.fsBadge}`}>{props.unreadChat}</span>
        </span>
      )}
      {isFullscreen && fsToast && (
        <div className={`toast cut c-tr c-bl ${styles.fsToast}`} role="status">
          <div className="t-meta mute">PARTNER</div>
          <p>{fsToast.text}</p>
        </div>
      )}

      {props.children}
    </main>
  );
}

function gateFor(p: StageProps): GateContent | null {
  const roomLabel = <span className="t-label dim">Room {p.roomId.toUpperCase()}</span>;
  if (p.phase === "disconnected" || p.phase === "failed") {
    return {
      art: <Ascii text={CONNECTION_LOST} size="l" />,
      title: p.phase === "failed" ? "Couldn't connect" : "Connection lost",
      body: "We could not get back to your partner. It is usually their Wi-Fi, occasionally ours.",
      action: (
        <div className={styles.actions}>
          <button className="btn btn-primary btn-lg cut" onClick={p.onReconnect}>
            <RetryIcon /> Retry
          </button>
          <button className="btn btn-lg cut" onClick={p.onLeave}>
            Leave room
          </button>
        </div>
      ),
    };
  }
  if (p.remoteSharing) return null;
  if (p.sharing) {
    return {
      eyebrow: (
        <span className="tag cut c-s tag-live">
          <span className="dot blink" /> live
        </span>
      ),
      art: <Ascii text={ON_AIR} size="l" />,
      title: "You are sharing",
      body: "No preview here: it would be a mirror facing a mirror. Go watch your movie window. Your partner sees what you see.",
      action: (
        <button className="btn btn-primary btn-lg cut" onClick={p.onStopShare}>
          <StopIcon /> Stop sharing
        </button>
      ),
      note: (
        <span className="t-meta mute">
          sharing entire screen &middot; system audio {p.shareHasAudio ? "on" : "off"}
        </span>
      ),
    };
  }
  switch (p.phase) {
    case "idle":
    case "waiting-for-peer":
      if (p.partnerLeft) {
        return {
          art: <Ascii text={PARTNER_LEFT} size="l" />,
          title: "Partner left",
          body: "Their seat is empty. The room stays open until you leave, so they can come back through the same link.",
          action: <CopyLinkButton onCopy={p.onCopyLink} />,
        };
      }
      return {
        eyebrow: roomLabel,
        art: <AnimatedAscii frames={WAITING_FRAMES} ms={380} size="l" />,
        title: "Waiting for your partner",
        body: "Send them the link. The room closes when you both leave.",
        action: <LinkRow roomId={p.roomId} onCopy={p.onCopyLink} />,
      };
    case "negotiating":
      return {
        eyebrow: roomLabel,
        art: <AnimatedAscii frames={CONNECTING_FRAMES} ms={300} size="l" />,
        title: "Connecting",
        extra: <AnimatedAscii frames={CONNECTING_STEPS} ms={700} still={2} className={styles.stepsLine} />,
        note: <span className="t-meta mute">peer to peer. your movie never touches a server.</span>,
      };
    case "connected":
      return {
        art: <Ascii text={TV_IDLE} size="l" />,
        title: "Nobody is sharing",
        body: p.canShare ? (
          <>
            Pick your movie window, share your <b>entire screen</b>, and tick <b>Share system audio</b> so they can hear it.
          </>
        ) : (
          "This device can only watch. When your partner shares, it shows up here."
        ),
        action: p.canShare ? (
          <button className="btn btn-primary btn-lg cut" onClick={p.onShare}>
            <ScreenShareIcon /> Share my screen
          </button>
        ) : undefined,
      };
    case "closed":
      return { title: "You left the room", body: "Reload the page to join again." };
  }
}

/** Copies the invite link and says so for two seconds. */
function CopyLinkButton({ onCopy }: { onCopy(): void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);
  return (
    <button
      className="btn btn-primary cut"
      onClick={() => {
        onCopy();
        setCopied(true);
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Copied" : "Copy link"}
    </button>
  );
}

function LinkRow({ roomId, onCopy }: { roomId: string; onCopy(): void }) {
  const [link, setLink] = useState(`/room/${roomId}`);
  useEffect(() => setLink(`${window.location.host}/room/${roomId}`), [roomId]);
  return (
    <div className={styles.linkRow}>
      <div className="input cut c-bl">
        <span className="pre">&gt;</span>
        <input readOnly aria-label="Room link" value={link} onFocus={(e) => e.currentTarget.select()} />
      </div>
      <CopyLinkButton onCopy={onCopy} />
    </div>
  );
}
