"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PeerSession,
  SocketSignaling,
  captureDisplay,
  captureFake,
  describeCapture,
  fetchIceServers,
  getConnectionSnapshot,
  throughputBetween,
  type ConnectionPhase,
  type ConnectionSnapshot,
  type Throughput,
} from "@dagleitv/rtc-core";
import { CloseIcon } from "../../icons";
import { EnterRoom } from "./EnterRoom";
import { TopBar } from "./TopBar";
import { Stage } from "./Stage";
import { StatsDrawer } from "./StatsDrawer";
import { useVoice } from "./useVoice";
import styles from "./room.module.css";

const SIGNALING_URL = process.env.NEXT_PUBLIC_SIGNALING_URL ?? "http://localhost:4000";

/**
 * The session is created from a click, not an effect: that gives the user
 * gesture needed for autoplay-with-sound and avoids React Strict Mode
 * double-mount creating two sockets. The effect only cleans up on unmount.
 */
export function Room({ roomId }: { roomId: string }) {
  const sessionRef = useRef<PeerSession | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [phase, setPhase] = useState<ConnectionPhase>("idle");
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteSharing, setRemoteSharing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [needsPlayClick, setNeedsPlayClick] = useState(false);
  const [diag, setDiag] = useState<unknown>(null);
  const [forceRelay, setForceRelay] = useState(false);
  const [turnAvailable, setTurnAvailable] = useState<boolean | null>(null);
  const [net, setNet] = useState<{ snap: ConnectionSnapshot; rate: Throughput | null } | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setForceRelay(new URLSearchParams(window.location.search).has("relay"));
  }, []);

  // M2: poll the selected candidate pair once a second while connected.
  useEffect(() => {
    if (phase !== "connected") {
      setNet(null);
      return;
    }
    let prev: ConnectionSnapshot | null = null;
    const tick = async () => {
      const pc = sessionRef.current?.peerConnection;
      const snap = pc ? await getConnectionSnapshot(pc) : null;
      if (!snap) return;
      setNet({ snap, rate: prev ? throughputBetween(prev, snap) : null });
      prev = snap;
    };
    void tick();
    const id = setInterval(() => void tick(), 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(
    () => () => {
      sessionRef.current?.close();
      clearTimeout(toastTimer.current);
    },
    [],
  );

  const showToast = useCallback((message: string, ms = 2200) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);

  const showTip = useCallback((message: string) => showToast(message, 6000), [showToast]);
  const voice = useVoice(sessionRef, { onError: setError, onTip: showTip });
  const { reset: resetVoice, sessionEvents: voiceEvents } = voice;

  const copyLink = useCallback(async () => {
    const link = window.location.origin + window.location.pathname;
    try {
      await navigator.clipboard.writeText(link);
      showToast("Link copied. Send it to your partner.");
    } catch {
      showToast("Couldn't copy. Copy the address bar instead.");
    }
  }, [showToast]);

  /** Joins the room; also used to reconnect, replacing any previous session. */
  const join = useCallback(async () => {
    setError(null);
    setJoining(true);
    sessionRef.current?.close();
    sessionRef.current = null;
    setSharing(false);
    setRemoteSharing(false);
    setNeedsPlayClick(false);
    resetVoice();

    const session = new PeerSession({
      signaling: new SocketSignaling(SIGNALING_URL),
      iceTransportPolicy: forceRelay ? "relay" : "all",
      iceServers: async () => {
        const ice = await fetchIceServers(SIGNALING_URL, roomId);
        setTurnAvailable(ice.turn);
        return ice.iceServers;
      },
      events: {
        ...voiceEvents,
        onPhase: (p) => {
          if (sessionRef.current === session) setPhase(p);
        },
        onRemoteSharing: setRemoteSharing,
        onLocalShareEnded: () => setSharing(false),
        onError: (e) => setError(e.message),
        onRemoteStream: (stream) => {
          const video = videoRef.current;
          if (!video) return;
          video.srcObject = stream;
          // AbortError just means a later track interrupted this play(); only a
          // blocked autoplay (NotAllowedError) needs the click-to-play button.
          video.play().catch((e) => {
            if (e instanceof Error && e.name === "NotAllowedError") setNeedsPlayClick(true);
          });
        },
      },
    });
    sessionRef.current = session;
    try {
      const result = await session.start(roomId);
      if (!result.ok) {
        setError(
          result.error === "room-full"
            ? "Room is full. Only two people can be in a room."
            : "This room link isn't valid.",
        );
        session.close();
        sessionRef.current = null;
        setJoined(false);
        return;
      }
      setJoined(true);
    } catch {
      setError("Can't reach the Daglei TV server. Check your connection and try again.");
      session.close();
      sessionRef.current = null;
    } finally {
      setJoining(false);
    }
  }, [roomId, forceRelay, resetVoice, voiceEvents]);

  const share = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    try {
      const fake = new URLSearchParams(window.location.search).has("fake");
      const stream = fake ? captureFake() : await captureDisplay();
      setDiag(describeCapture(stream));
      session.startSharing(stream);
      setSharing(true);
    } catch (e) {
      // NotAllowedError = the user closed the picker without choosing.
      if (e instanceof Error && e.name === "NotAllowedError") return;
      setError(`Couldn't start sharing: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  const stopShare = useCallback(() => {
    sessionRef.current?.stopSharing();
    setSharing(false);
  }, []);

  const netText = [
    `TURN credentials: ${turnAvailable === null ? "n/a" : turnAvailable ? "yes" : "no (STUN only)"}`,
    `policy: ${forceRelay ? "relay only" : "all"}`,
    ...(net
      ? [
          `pair: ${net.snap.pair} ${net.snap.relayed ? "(RELAYED)" : "(direct)"} ${net.snap.protocol ?? ""}`,
          `rtt: ${net.snap.rttMs?.toFixed(0) ?? "?"} ms`,
          `send: ${net.rate?.sendKbps.toFixed(0) ?? "?"} kbps, recv: ${net.rate?.recvKbps.toFixed(0) ?? "?"} kbps`,
          `est. available outgoing: ${net.snap.availableOutgoingKbps?.toFixed(0) ?? "?"} kbps`,
        ]
      : ["pair: (not connected)"]),
  ].join("\n");

  // Always mounted so the partner's voice can attach as soon as it arrives.
  const voiceAudio = <audio ref={voice.audioRef} data-testid="remote-voice" autoPlay hidden />;

  if (!joined) {
    return (
      <>
        {voiceAudio}
        <EnterRoom
          roomId={roomId}
          forceRelay={forceRelay}
          onForceRelayChange={setForceRelay}
          onJoin={join}
          onCopyLink={copyLink}
          joining={joining}
          error={error}
        />
        {toast && <div className={styles.toast} role="status">{toast}</div>}
      </>
    );
  }

  return (
    <main className={styles.room}>
      {voiceAudio}
      <TopBar
        roomId={roomId}
        phase={phase}
        remoteSharing={remoteSharing}
        remoteVoiceState={voice.remoteVoiceState}
        remoteSpeaking={voice.remoteSpeaking}
        onCopyLink={copyLink}
        onToggleStats={() => setStatsOpen((o) => !o)}
      />
      {error && (
        <div className={styles.banner} role="alert">
          <p>{error}</p>
          <button className="btn btn-ghost btn-icon" aria-label="Dismiss" onClick={() => setError(null)}>
            <CloseIcon />
          </button>
        </div>
      )}
      <Stage
        videoRef={videoRef}
        phase={phase}
        sharing={sharing}
        remoteSharing={remoteSharing}
        needsPlayClick={needsPlayClick}
        onPlayClick={() => {
          void videoRef.current?.play();
          setNeedsPlayClick(false);
        }}
        onPlaying={() => setNeedsPlayClick(false)}
        onShare={share}
        onStopShare={stopShare}
        micState={voice.micState}
        localSpeaking={voice.localSpeaking}
        onToggleMic={voice.toggleMic}
        onCopyLink={copyLink}
        onReconnect={join}
      />
      <StatsDrawer open={statsOpen} onClose={() => setStatsOpen(false)} netText={netText} diag={diag} />
      {toast && <div className={styles.toast} role="status">{toast}</div>}
    </main>
  );
}
