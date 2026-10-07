import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  captureFakeMic,
  captureMic,
  watchSpeaking,
  type PeerSession,
  type SessionEvents,
  type VoiceState,
} from "@dagleitv/rtc-core";

const MIC_TIP_KEY = "dagleitv.micTipShown";

interface VoiceOptions {
  onError(message: string): void;
  /** Shown once per browser, the first time the mic goes live. */
  onTip(message: string): void;
}

function micErrorMessage(e: unknown): string {
  const name = e instanceof Error ? e.name : "";
  if (name === "NotAllowedError") return "Microphone blocked. Allow it from the icon in the address bar, then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No microphone found.";
  if (name === "NotReadableError") return "Your microphone is busy in another app.";
  return `Couldn't turn on the mic: ${e instanceof Error ? e.message : String(e)}`;
}

/**
 * Voice chat (M4) state for one room: local mic on/muted, the partner's
 * voice (played through its own <audio>), and who is speaking.
 */
export function useVoice(sessionRef: RefObject<PeerSession | null>, { onError, onTip }: VoiceOptions) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  const requesting = useRef(false);

  const [micState, setMicState] = useState<VoiceState>("off");
  const [remoteVoiceState, setRemoteVoiceState] = useState<VoiceState>("off");
  const [remoteVoice, setRemoteVoice] = useState<MediaStream | null>(null);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [remoteSpeaking, setRemoteSpeaking] = useState(false);

  // The <audio> is always mounted, so the stream can be attached right away.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !remoteVoice) return;
    audio.srcObject = remoteVoice;
    audio.play().catch(() => {
      /* autoplay is allowed after "Enter room"; nothing else to do */
    });
  }, [remoteVoice]);

  useEffect(() => {
    const track = micTrackRef.current;
    if (micState !== "live" || !track) return;
    return watchSpeaking(new MediaStream([track]), setLocalSpeaking);
  }, [micState]);

  useEffect(() => {
    if (remoteVoiceState !== "live" || !remoteVoice) return;
    return watchSpeaking(remoteVoice, setRemoteSpeaking);
  }, [remoteVoiceState, remoteVoice]);

  /** Session callbacks to pass into PeerSession's events. */
  const sessionEvents = useMemo<Pick<SessionEvents, "onRemoteVoice" | "onRemoteVoiceState" | "onLocalVoiceEnded">>(
    () => ({
      onRemoteVoice: setRemoteVoice,
      onRemoteVoiceState: setRemoteVoiceState,
      onLocalVoiceEnded: () => {
        micTrackRef.current = null;
        setMicState("off");
        onError("Your microphone was disconnected.");
      },
    }),
    [onError],
  );

  /** Call when a new session replaces the old one (the old one stops its mic). */
  const reset = useCallback(() => {
    micTrackRef.current = null;
    setMicState("off");
    setRemoteVoiceState("off");
    setRemoteVoice(null);
  }, []);

  const toggleMic = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || requesting.current) return;
    if (micState !== "off") {
      const mute = micState === "live";
      session.setVoiceMuted(mute);
      setMicState(mute ? "muted" : "live");
      return;
    }
    requesting.current = true;
    try {
      const fake = new URLSearchParams(window.location.search).has("fake");
      const track = fake ? captureFakeMic() : await captureMic();
      if (sessionRef.current !== session) {
        track.stop();
        return;
      }
      micTrackRef.current = track;
      session.startVoice(track);
      setMicState("live");
      try {
        if (!localStorage.getItem(MIC_TIP_KEY)) {
          localStorage.setItem(MIC_TIP_KEY, "1");
          onTip("Tip: use headphones so your mic doesn't pick up the movie.");
        }
      } catch {
        /* storage unavailable: skip the tip */
      }
    } catch (e) {
      onError(micErrorMessage(e));
    } finally {
      requesting.current = false;
    }
  }, [sessionRef, micState, onError, onTip]);

  return {
    audioRef,
    micState,
    remoteVoiceState,
    localSpeaking: micState === "live" && localSpeaking,
    remoteSpeaking: remoteVoiceState === "live" && remoteSpeaking,
    sessionEvents,
    reset,
    toggleMic,
  };
}
