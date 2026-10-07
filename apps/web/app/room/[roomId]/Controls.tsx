import type { VoiceState } from "@dagleitv/rtc-core";
import {
  ExitFullscreenIcon,
  MicIcon,
  MicOffIcon,
  FullscreenIcon,
  MuteIcon,
  ScreenShareIcon,
  StopIcon,
  VolumeIcon,
} from "../../icons";
import styles from "./room.module.css";

const MIC_LABEL: Record<VoiceState, string> = {
  off: "Turn on mic",
  live: "Mute mic",
  muted: "Unmute mic",
};

interface ControlsProps {
  micState: VoiceState;
  localSpeaking: boolean;
  onToggleMic(): void;
  sharing: boolean;
  shareDisabled: boolean;
  onShare(): void;
  onStopShare(): void;
  volume: number;
  muted: boolean;
  onVolumeChange(volume: number): void;
  onToggleMute(): void;
  isFullscreen: boolean;
  onToggleFullscreen(): void;
}

export function Controls(props: ControlsProps) {
  const silent = props.muted || props.volume === 0;
  return (
    <div className={styles.controls}>
      <button
        data-testid="mic"
        className={`btn btn-icon ${styles.micButton}`}
        data-state={props.micState}
        data-speaking={props.localSpeaking}
        onClick={props.onToggleMic}
        aria-label={MIC_LABEL[props.micState]}
        aria-pressed={props.micState === "live"}
        title={`${MIC_LABEL[props.micState]} (V)`}
      >
        {props.micState === "live" ? <MicIcon /> : <MicOffIcon />}
      </button>

      {props.sharing ? (
        <button data-testid="stop-share" className="btn btn-danger" onClick={props.onStopShare}>
          <StopIcon size={16} /> Stop sharing
        </button>
      ) : (
        <button
          data-testid="share"
          className="btn btn-primary"
          onClick={props.onShare}
          disabled={props.shareDisabled}
          title={props.shareDisabled ? "Your partner is sharing" : undefined}
        >
          <ScreenShareIcon size={16} /> Share my screen
        </button>
      )}

      <span className={styles.separator} />

      <div className={styles.volume}>
        <button
          className="btn btn-ghost btn-icon"
          onClick={props.onToggleMute}
          aria-label={silent ? "Unmute movie" : "Mute movie"}
          title={`${silent ? "Unmute" : "Mute"} movie (M)`}
        >
          {silent ? <MuteIcon /> : <VolumeIcon />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={props.muted ? 0 : props.volume}
          onChange={(e) => props.onVolumeChange(Number(e.target.value))}
          aria-label="Movie volume"
        />
      </div>

      <button
        className="btn btn-ghost btn-icon"
        onClick={props.onToggleFullscreen}
        aria-label={props.isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        title={`${props.isFullscreen ? "Exit fullscreen" : "Fullscreen"} (F)`}
      >
        {props.isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
      </button>
    </div>
  );
}
