import type { JoinResult, SignalMessage } from "@dagleitv/protocol";
import { TRANSCEIVER_ORDER } from "./layout";
import type { SignalingChannel } from "./signaling";

export type ConnectionPhase =
  | "idle"
  | "waiting-for-peer"
  | "negotiating"
  | "connected"
  | "disconnected"
  | "failed"
  | "closed";

export interface SessionEvents {
  onPhase?(phase: ConnectionPhase): void;
  /** Remote screen video+audio, as one stream. Same object across calls. */
  onRemoteStream?(stream: MediaStream): void;
  onRemoteSharing?(sharing: boolean): void;
  /** The local capture ended on its own (e.g. browser "Stop sharing" bar). */
  onLocalShareEnded?(): void;
  onError?(error: Error): void;
}

export interface PeerSessionOptions {
  signaling: SignalingChannel;
  iceServers?: RTCIceServer[];
  events?: SessionEvents;
}

type ControlMessage = { type: "share-state"; sharing: boolean };

/**
 * Two-peer session over a fixed 3-transceiver layout (see layout.ts).
 *
 * Negotiation is deliberately simpler than full "perfect negotiation": the
 * peer that receives `peer-joined` is always the sole offerer, and the peer
 * that joined into an occupied room only answers. No glare is possible.
 * Starting/stopping a share is replaceTrack() on already-sendrecv
 * transceivers, so it needs no renegotiation. Both peers can share because
 * both sides' transceivers are sendrecv.
 */
export class PeerSession {
  private readonly signaling: SignalingChannel;
  private readonly iceServers: RTCIceServer[];
  private readonly events: SessionEvents;

  private pc: RTCPeerConnection | null = null;
  private ctl: RTCDataChannel | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private remoteScreen = new MediaStream();
  /** Shared msid holder so screen video+audio land in one sync group. */
  private screenMsid = new MediaStream();
  private localShare: MediaStream | null = null;
  private closed = false;
  private phase: ConnectionPhase = "idle";

  constructor(options: PeerSessionOptions) {
    this.signaling = options.signaling;
    this.iceServers = options.iceServers ?? [{ urls: "stun:stun.l.google.com:19302" }];
    this.events = options.events ?? {};
  }

  async start(roomId: string): Promise<JoinResult> {
    this.signaling.setHandlers({
      onSignal: (msg) => void this.handleSignal(msg).catch((e) => this.fail(e)),
      onPeerJoined: () => void this.makeOffer().catch((e) => this.fail(e)),
      onPeerLeft: () => {
        this.teardownPeer();
        this.setPhase("waiting-for-peer");
      },
      onDisconnect: () => {
        if (!this.closed) this.setPhase("disconnected");
      },
    });
    const result = await this.signaling.join(roomId);
    if (result.ok && this.phase === "idle") {
      this.setPhase(result.peerPresent ? "negotiating" : "waiting-for-peer");
    }
    return result;
  }

  get isSharing(): boolean {
    return this.localShare !== null;
  }

  startSharing(stream: MediaStream): void {
    this.stopSharing();
    this.localShare = stream;
    stream.getVideoTracks()[0]?.addEventListener("ended", () => {
      if (this.localShare === stream) {
        this.stopSharing();
        this.events.onLocalShareEnded?.();
      }
    });
    this.applyLocalShare();
    this.sendControl({ type: "share-state", sharing: true });
  }

  stopSharing(): void {
    const stream = this.localShare;
    if (!stream) return;
    this.localShare = null;
    stream.getTracks().forEach((t) => t.stop());
    this.applyLocalShare();
    this.sendControl({ type: "share-state", sharing: false });
  }

  close(): void {
    if (this.closed) return;
    this.stopSharing();
    this.closed = true;
    this.teardownPeer();
    this.signaling.close();
    this.setPhase("closed");
  }

  /** Underlying connection, for stats collection (M3). */
  get peerConnection(): RTCPeerConnection | null {
    return this.pc;
  }

  // ---- negotiation -------------------------------------------------------

  private async makeOffer(): Promise<void> {
    const pc = this.createPeer();
    pc.addTransceiver("video", { direction: "sendrecv", streams: [this.screenMsid] });
    pc.addTransceiver("audio", { direction: "sendrecv", streams: [this.screenMsid] });
    pc.addTransceiver("audio", { direction: "sendrecv" }); // voice (M4)
    this.ctl = this.createControlChannel(pc);
    this.applyLocalShare();
    this.setPhase("negotiating");
    await pc.setLocalDescription();
    this.signaling.send({ kind: "offer", sdp: pc.localDescription!.toJSON() });
  }

  private async handleSignal(msg: SignalMessage): Promise<void> {
    if (this.closed) return;
    if (msg.kind === "offer") {
      const pc = this.createPeer();
      this.ctl = this.createControlChannel(pc);
      this.setPhase("negotiating");
      await pc.setRemoteDescription(msg.sdp);
      pc.getTransceivers().forEach((t, i) => {
        t.direction = "sendrecv";
        if (i < 2) t.sender.setStreams(this.screenMsid);
      });
      this.applyLocalShare();
      await pc.setLocalDescription();
      this.signaling.send({ kind: "answer", sdp: pc.localDescription!.toJSON() });
      await this.flushCandidates();
    } else if (msg.kind === "answer") {
      if (!this.pc) return;
      await this.pc.setRemoteDescription(msg.sdp);
      await this.flushCandidates();
    } else if (msg.kind === "ice-candidate" && msg.candidate) {
      if (this.pc?.remoteDescription) await this.pc.addIceCandidate(msg.candidate);
      else this.pendingCandidates.push(msg.candidate);
    }
  }

  private async flushCandidates(): Promise<void> {
    const pending = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const c of pending) await this.pc?.addIceCandidate(c);
  }

  // ---- peer connection ---------------------------------------------------

  private createPeer(): RTCPeerConnection {
    this.teardownPeer();
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.pc = pc;
    pc.onicecandidate = (e) => {
      if (e.candidate) this.signaling.send({ kind: "ice-candidate", candidate: e.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc) return;
      const s = pc.connectionState;
      if (s === "connected") this.setPhase("connected");
      else if (s === "disconnected") this.setPhase("disconnected");
      else if (s === "failed") this.setPhase("failed");
    };
    pc.ontrack = (e) => {
      const slot = TRANSCEIVER_ORDER[pc.getTransceivers().indexOf(e.transceiver)];
      if (slot === "screen-video" || slot === "screen-audio") {
        this.remoteScreen.addTrack(e.track);
        this.events.onRemoteStream?.(this.remoteScreen);
      }
    };
    return pc;
  }

  private teardownPeer(): void {
    const hadRemote = this.remoteScreen.getTracks().length > 0;
    this.ctl?.close();
    this.ctl = null;
    this.pc?.close();
    this.pc = null;
    this.pendingCandidates = [];
    this.remoteScreen = new MediaStream();
    if (hadRemote) this.events.onRemoteSharing?.(false);
  }

  /** Negotiated data channel (id 0) carrying app-level control messages. */
  private createControlChannel(pc: RTCPeerConnection): RTCDataChannel {
    const ch = pc.createDataChannel("ctl", { negotiated: true, id: 0 });
    ch.onopen = () => this.sendControl({ type: "share-state", sharing: this.isSharing });
    ch.onmessage = (e) => {
      try {
        const msg = JSON.parse(String(e.data)) as ControlMessage;
        if (msg.type === "share-state") this.events.onRemoteSharing?.(msg.sharing);
      } catch {
        /* ignore malformed control messages */
      }
    };
    return ch;
  }

  private sendControl(msg: ControlMessage): void {
    if (this.ctl?.readyState === "open") this.ctl.send(JSON.stringify(msg));
  }

  private applyLocalShare(): void {
    const ts = this.pc?.getTransceivers();
    if (!ts || ts.length < 3) return;
    const video = this.localShare?.getVideoTracks()[0] ?? null;
    const audio = this.localShare?.getAudioTracks()[0] ?? null;
    void ts[0]!.sender.replaceTrack(video);
    void ts[1]!.sender.replaceTrack(audio);
  }

  private setPhase(phase: ConnectionPhase): void {
    if (this.phase === phase) return;
    this.phase = phase;
    this.events.onPhase?.(phase);
  }

  private fail(error: unknown): void {
    this.events.onError?.(error instanceof Error ? error : new Error(String(error)));
    this.setPhase("failed");
  }
}
