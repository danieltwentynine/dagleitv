import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { ConnectionPhase } from "@dagleitv/rtc-core";
import { LinkIcon, RefreshIcon, ScreenShareIcon, TvIcon } from "../../icons";
import { Controls } from "./Controls";
import styles from "./room.module.css";

const VOLUME_KEY = "dagleitv.volume";
const IDLE_MS = 3000;

interface StageProps {
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
}

interface OverlayContent {
  tone?: "danger";
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}

/** The screen, its empty-state message, and the control bar. Fullscreen wraps all three. */
export function Stage(props: StageProps) {
  const { videoRef } = props;
  const stageRef = useRef<HTMLDivElement>(null);
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
      else if (e.key === "m" || e.key === "M") toggleMute();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFullscreen, toggleMute]);

  const overlay = overlayFor(props);
  const live = props.remoteSharing && !overlay;

  return (
    <div ref={stageRef} className={styles.stage} data-idle={idle} onMouseMove={wake}>
      <div className={styles.screen} data-live={live}>
        <video
          ref={videoRef}
          data-testid="remote-video"
          className={styles.video}
          autoPlay
          playsInline
          onDoubleClick={toggleFullscreen}
          onPlaying={props.onPlaying}
        />
        {overlay && (
          <div className={styles.overlay} data-tone={overlay.tone}>
            <div className={styles.overlayIcon}>{overlay.icon}</div>
            <h2>{overlay.title}</h2>
            <p>{overlay.body}</p>
            {overlay.action}
          </div>
        )}
        {live && props.needsPlayClick && (
          <button className={`btn btn-primary btn-lg ${styles.playButton}`} onClick={props.onPlayClick}>
            Click to play
          </button>
        )}
      </div>
      <Controls
        sharing={props.sharing}
        shareDisabled={props.remoteSharing}
        onShare={props.onShare}
        onStopShare={props.onStopShare}
        volume={volume}
        muted={muted}
        onVolumeChange={(v) => {
          setVolume(v);
          setMuted(false);
        }}
        onToggleMute={toggleMute}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
      />
    </div>
  );
}

function overlayFor(p: StageProps): OverlayContent | null {
  if (p.phase === "disconnected" || p.phase === "failed") {
    return {
      tone: "danger",
      icon: <RefreshIcon size={26} />,
      title: p.phase === "failed" ? "Couldn't connect" : "Connection lost",
      body:
        p.phase === "failed"
          ? "The connection to your partner couldn't be set up. Try again."
          : "The connection dropped. Reconnect to pick up where you left off.",
      action: (
        <button className="btn btn-primary" onClick={p.onReconnect}>
          <RefreshIcon size={16} /> Reconnect
        </button>
      ),
    };
  }
  if (p.remoteSharing) return null;
  if (p.sharing) {
    return {
      icon: <ScreenShareIcon size={26} />,
      title: "You're sharing your screen",
      body: "Your partner is watching it now. There's no preview here, to avoid a hall of mirrors.",
    };
  }
  switch (p.phase) {
    case "idle":
    case "waiting-for-peer":
      return {
        icon: <LinkIcon size={26} />,
        title: "Waiting for your partner",
        body: "Send them the link to this room. It opens straight into it.",
        action: (
          <button className="btn btn-primary" onClick={p.onCopyLink}>
            <LinkIcon size={16} /> Copy invite link
          </button>
        ),
      };
    case "negotiating":
      return {
        icon: <TvIcon size={26} />,
        title: "Connecting…",
        body: "Setting up a private connection with your partner.",
      };
    case "connected":
      return {
        icon: <TvIcon size={26} />,
        title: "You're connected",
        body: "Press Share my screen to start the show, or wait for your partner to share theirs.",
      };
    case "closed":
      return { icon: <TvIcon size={26} />, title: "You left the room", body: "Reload the page to join again." };
  }
}
