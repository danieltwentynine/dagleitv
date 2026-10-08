"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PeerSession,
  SocketSignaling,
  captureDisplay,
  captureFake,
  fetchIceServers,
  getConnectionSnapshot,
  signalQuality,
  type ConnectionPhase,
  type ConnectionSnapshot,
  type SignalQuality,
} from "@dagleitv/rtc-core";
import { CloseIcon } from "../../icons";
import { EnterRoom } from "./EnterRoom";
import { LeaveDialog } from "./LeaveDialog";
import { TopBar } from "./TopBar";
import { Stage } from "./Stage";
import { ChatDrawer, type ChatLine } from "./ChatDrawer";
import { useVoice } from "./useVoice";
import styles from "./room.module.css";

const SIGNALING_URL = process.env.NEXT_PUBLIC_SIGNALING_URL ?? "http://localhost:4000";

function tabTitle(phase: ConnectionPhase, joined: boolean, sharing: boolean, remoteSharing: boolean): string {
  if (!joined) return "Join room";
  if (phase === "disconnected" || phase === "failed") return "Connection lost";
  if (remoteSharing) return "▶ Watching";
  if (sharing) return "● Sharing";
  if (phase === "connected") return "Connected";
  if (phase === "negotiating") return "Connecting…";
  return "Waiting for partner";
}

/**
 * The session is created from a click, not an effect: that gives the user
 * gesture needed for autoplay-with-sound and avoids React Strict Mode
 * double-mount creating two sockets. The effect only cleans up on unmount.
 */
export function Room({ roomId }: { roomId: string }) {
  const router = useRouter();
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
  const [forceRelay, setForceRelay] = useState(false);
  const [snap, setSnap] = useState<ConnectionSnapshot | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [unread, setUnread] = useState(0);
  const chatOpenRef = useRef(false);
  const chatId = useRef(0);
  const [toast, setToast] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);

  useEffect(() => {
    setForceRelay(new URLSearchParams(window.location.search).has("relay"));
  }, []);

  // Poll the selected candidate pair once a second while connected; the RTT
  // feeds the signal indicator.
  useEffect(() => {
    if (phase !== "connected") {
      setSnap(null);
      return;
    }
    const tick = async () => {
      const pc = sessionRef.current?.peerConnection;
      const next = pc ? await getConnectionSnapshot(pc) : null;
      if (next) setSnap(next);
    };
    void tick();
    const id = setInterval(() => void tick(), 1000);
    return () => clearInterval(id);
  }, [phase]);

  const signal: SignalQuality | null =
    phase === "connected"
      ? signalQuality(true, snap)
      : phase === "disconnected" || phase === "failed"
        ? "offline"
        : null;

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
  const live = sharing || voice.micState !== "off";

  useEffect(() => {
    document.title = `${tabTitle(phase, joined, sharing, remoteSharing)} · Daglei TV`;
  }, [phase, joined, sharing, remoteSharing]);
  useEffect(() => () => void (document.title = "Daglei TV"), []);

  // Closing or reloading the tab mid-share: the browser's own "Leave site?" prompt.
  useEffect(() => {
    if (!live) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [live]);

  const leave = useCallback(() => {
    setLeaveOpen(false);
    sessionRef.current?.close();
    sessionRef.current = null;
    router.push("/");
  }, [router]);

  const requestLeave = useCallback(() => {
    if (live) setLeaveOpen(true);
    else leave();
  }, [live, leave]);

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
        return (await fetchIceServers(SIGNALING_URL, roomId)).iceServers;
      },
      events: {
        ...voiceEvents,
        onPhase: (p) => {
          if (sessionRef.current === session) setPhase(p);
        },
        onChat: (msg) => {
          setChat((c) => [...c, { id: chatId.current++, from: "partner", text: msg.text, ts: msg.ts }]);
          if (!chatOpenRef.current) setUnread((n) => n + 1);
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

  const toggleChat = useCallback(() => {
    const next = !chatOpenRef.current;
    chatOpenRef.current = next;
    setChatOpen(next);
    if (next) setUnread(0);
  }, []);

  const sendChat = useCallback((text: string) => {
    sessionRef.current?.sendChat(text);
    setChat((c) => [...c, { id: chatId.current++, from: "me", text, ts: Date.now() }]);
  }, []);

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
        signal={signal}
        unreadChat={unread}
        onToggleChat={toggleChat}
        onLeave={requestLeave}
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
      <LeaveDialog
        open={leaveOpen}
        sharing={sharing}
        micOn={voice.micState !== "off"}
        onStay={() => setLeaveOpen(false)}
        onLeave={leave}
      />
      <ChatDrawer
        open={chatOpen}
        onClose={toggleChat}
        messages={chat}
        canSend={phase === "connected"}
        onSend={sendChat}
      />
      {toast && <div className={styles.toast} role="status">{toast}</div>}
    </main>
  );
}
