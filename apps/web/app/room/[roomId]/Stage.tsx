import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { ConnectionPhase, VoiceState } from "@dagleitv/rtc-core";
import { Ascii } from "../../AsciiArt";
import { TV_IDLE } from "../../ascii";
import {
  ExitFullscreenIcon,
  FullscreenIcon,
  LinkIcon,
  MicIcon,
  MicOffIcon,
  MuteIcon,
  RetryIcon,
  ScreenShareIcon,
  StopIcon,
  VolumeIcon,
} from "../../icons";
import { Slider } from "./Slider";
import styles from "./room.module.css";

const VOLUME_KEY = "dagleitv.volume";
const IDLE_MS = 3000;

const MIC_LABEL: Record<VoiceState, string> = {
  off: "Turn on mic",
  live: "Mute mic",
  muted: "Unmute mic",
};
const MIC_STATE_TEXT: Record<VoiceState, string> = { off: "Mic off", live: "Live", muted: "Muted" };

interface StageProps {
  topBar: ReactNode;
  /** Banners, toasts and popovers rendered over the stage (so they survive fullscreen). */
  children?: ReactNode;
  videoRef: RefObject<HTMLVideoElement | null>;
  phase: ConnectionPhase;
  sharing: boolean;
  remoteSharing: boolean;
  needsPlayClick: boolean;
  onPlayClick(): void;
  onPlaying(): void;
  onShare(): void;
  onStopShare(): void;
  onCopyLink(): void;
  onReconnect(): void;
  micState: VoiceState;
  localSpeaking: boolean;
  onToggleMic(): void;
}

interface GateContent {
  art?: string;
  title: string;
  body: ReactNode;
  action?: ReactNode;
}

/** The screen, its state gate, the top bar and the control strip. Fullscreen wraps all of it. */
export function Stage(props: StageProps) {
  const { videoRef, onToggleMic } = props;
  const stageRef = useRef<HTMLElement>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [idle, setIdle] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

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
          {gate.art && <Ascii text={gate.art} size="l" />}
          <h1 className="t-display-m">{gate.title}</h1>
          <p>{gate.body}</p>
          {gate.action}
        </div>
      )}
      {live && props.needsPlayClick && (
        <button className={`btn btn-primary btn-lg cut ${styles.play}`} onClick={props.onPlayClick}>
          Click to play
        </button>
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
            disabled={props.remoteSharing}
            title={props.remoteSharing ? "Partner is sharing" : undefined}
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

      {props.children}
    </main>
  );
}

function gateFor(p: StageProps): GateContent | null {
  if (p.phase === "disconnected" || p.phase === "failed") {
    return {
      title: p.phase === "failed" ? "Couldn't connect" : "Connection lost",
      body:
        p.phase === "failed"
          ? "The connection to your partner could not be set up. Try again."
          : "The connection dropped. Reconnect to pick up where you left off.",
      action: (
        <button className="btn btn-primary btn-lg cut" onClick={p.onReconnect}>
          <RetryIcon /> Reconnect
        </button>
      ),
    };
  }
  if (p.remoteSharing) return null;
  if (p.sharing) {
    return {
      title: "You're sharing your screen",
      body: "Your partner is watching it now. There is no preview here, to avoid a hall of mirrors.",
    };
  }
  switch (p.phase) {
    case "idle":
    case "waiting-for-peer":
      return {
        title: "Waiting for your partner",
        body: "Send them the link to this room. It opens straight into it.",
        action: (
          <button className="btn btn-primary btn-lg cut" onClick={p.onCopyLink}>
            <LinkIcon /> Copy invite link
          </button>
        ),
      };
    case "negotiating":
      return { title: "Connecting…", body: "Setting up a private connection with your partner." };
    case "connected":
      return {
        art: TV_IDLE,
        title: "Nobody is sharing",
        body: (
          <>
            Pick your movie window, share your <b>entire screen</b>, and tick <b>Share system audio</b> so they can hear it.
          </>
        ),
        action: (
          <button className="btn btn-primary btn-lg cut" onClick={p.onShare}>
            <ScreenShareIcon /> Share my screen
          </button>
        ),
      };
    case "closed":
      return { title: "You left the room", body: "Reload the page to join again." };
  }
}
