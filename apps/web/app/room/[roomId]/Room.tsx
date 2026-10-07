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

const SIGNALING_URL = process.env.NEXT_PUBLIC_SIGNALING_URL ?? "http://localhost:4000";

/**
 * The session is created from a click, not an effect: that gives the user
 * gesture needed for autoplay-with-sound and avoids React Strict Mode
 * double-mount creating two sockets. The effect only cleans up on unmount.
 */
export function Room({ roomId }: { roomId: string }) {
  const sessionRef = useRef<PeerSession | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const [phase, setPhase] = useState<ConnectionPhase>("idle");
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteSharing, setRemoteSharing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [needsPlayClick, setNeedsPlayClick] = useState(false);
  const [diag, setDiag] = useState<unknown>(null);
  const [forceRelay, setForceRelay] = useState(false);
  const [turnAvailable, setTurnAvailable] = useState<boolean | null>(null);
  const [net, setNet] = useState<{ snap: ConnectionSnapshot; rate: Throughput | null } | null>(null);

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

  useEffect(() => () => sessionRef.current?.close(), []);

  const join = useCallback(async () => {
    setError(null);
    const session = new PeerSession({
      signaling: new SocketSignaling(SIGNALING_URL),
      iceTransportPolicy: forceRelay ? "relay" : "all",
      iceServers: async () => {
        const ice = await fetchIceServers(SIGNALING_URL, roomId);
        setTurnAvailable(ice.turn);
        return ice.iceServers;
      },
      events: {
        onPhase: setPhase,
        onRemoteSharing: setRemoteSharing,
        onLocalShareEnded: () => setSharing(false),
        onError: (e) => setError(e.message),
        onRemoteStream: (stream) => {
          const video = videoRef.current;
          if (!video) return;
          video.srcObject = stream;
          video.play().catch(() => setNeedsPlayClick(true));
        },
      },
    });
    sessionRef.current = session;
    try {
      const result = await session.start(roomId);
      if (!result.ok) {
        setError(result.error === "room-full" ? "Room is full (2 people max)." : "Invalid room code.");
        session.close();
        sessionRef.current = null;
        return;
      }
      setJoined(true);
    } catch (e) {
      setError(`Could not reach the signaling server: ${e instanceof Error ? e.message : e}`);
      session.close();
      sessionRef.current = null;
    }
  }, [roomId, forceRelay]);

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
      // NotAllowedError = user cancelled the picker.
      setError(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    }
  }, []);

  const stopShare = useCallback(() => {
    sessionRef.current?.stopSharing();
    setSharing(false);
  }, []);

  const fullscreen = useCallback(() => {
    void stageRef.current?.requestFullscreen();
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

  if (!joined) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Room {roomId}</h1>
        <label style={{ display: "block", margin: "12px 0" }}>
          <input
            type="checkbox"
            data-testid="force-relay"
            checked={forceRelay}
            onChange={(e) => setForceRelay(e.target.checked)}
          />{" "}
          Force TURN relay (debug)
        </label>
        <button data-testid="join" onClick={join}>Join room</button>
        {error && <p style={{ color: "#f66" }}>{error}</p>}
      </main>
    );
  }

  return (
    <main style={{ padding: 24, display: "grid", gap: 12 }}>
      <header style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <strong>Room {roomId}</strong>
        <span data-testid="phase">{phase}</span>
        <button onClick={() => navigator.clipboard.writeText(window.location.href.split("?")[0]!)}>
          Copy link
        </button>
        {sharing ? (
          <button data-testid="stop-share" onClick={stopShare}>Stop sharing</button>
        ) : (
          <button data-testid="share" onClick={share} disabled={remoteSharing}>
            Share my screen
          </button>
        )}
        <button onClick={fullscreen}>Fullscreen</button>
        <span data-testid="remote-sharing">{remoteSharing ? "partner is sharing" : ""}</span>
      </header>
      {error && <p style={{ color: "#f66" }}>{error}</p>}
      <div ref={stageRef} style={{ background: "#000", aspectRatio: "16 / 9", position: "relative" }}>
        <video
          ref={videoRef}
          data-testid="remote-video"
          autoPlay
          playsInline
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
        {needsPlayClick && (
          <button
            style={{ position: "absolute", inset: "auto", top: "45%", left: "45%" }}
            onClick={() => {
              void videoRef.current?.play();
              setNeedsPlayClick(false);
            }}
          >
            Click to play
          </button>
        )}
        {sharing && (
          <div style={{ position: "absolute", top: 8, left: 8 }}>
            You are sharing (no local preview, to avoid an infinity mirror)
          </div>
        )}
      </div>
      <details open>
        <summary>Network (M2)</summary>
        <pre data-testid="net">{netText}</pre>
      </details>
      <details>
        <summary>Capture diagnostics (M1 spike)</summary>
        <pre data-testid="diag">{JSON.stringify(diag, null, 2)}</pre>
      </details>
    </main>
  );
}
