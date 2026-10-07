import type { JoinResult, SignalMessage } from "@dagleitv/protocol";
import { TRANSCEIVER_ORDER } from "./layout";
import { FALLBACK_ICE_SERVERS } from "./ice";
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
  /** Remote voice (M4) as its own stream. Same object across calls. */
  onRemoteVoice?(stream: MediaStream): void;
  onRemoteVoiceState?(state: VoiceState): void;
  /** The local mic track ended on its own (e.g. device unplugged). */
  onLocalVoiceEnded?(): void;
  onError?(error: Error): void;
}

export interface PeerSessionOptions {
  signaling: SignalingChannel;
  /**
   * ICE servers, or an async resolver. The resolver runs once after joining the
   * room (TURN credentials are only issued to people in a live room) and is
   * awaited before any peer connection is created.
   */
  iceServers?: RTCIceServer[] | (() => Promise<RTCIceServer[]>);
  /** "relay" forces all media through TURN. Debug toggle for testing M2. */
  iceTransportPolicy?: RTCIceTransportPolicy;
  events?: SessionEvents;
}

/** "muted" keeps the mic open but sends silence (track.enabled = false). */
export type VoiceState = "off" | "muted" | "live";

type ControlMessage =
  | { type: "share-state"; sharing: boolean }
  | { type: "voice-state"; state: VoiceState };

/**
 * Two-peer session over a fixed 3-transceiver layout (see layout.ts).
 *
 * Negotiation is deliberately simpler than full "perfect negotiation": the
 * peer that receives `peer-joined` is always the sole offerer, and the peer
 * that joined into an occupied room only answers. No glare is possible.
 * Starting/stopping a share is replaceTrack() on already-sendrecv
 * transceivers, so it needs no renegotiation. Both peers can share because
 * both sides' transceivers are sendrecv. Voice (M4) works the same way on the
 * third transceiver.
 */
export class PeerSession {
  private readonly signaling: SignalingChannel;
  private iceServers: RTCIceServer[];
  private readonly iceTransportPolicy: RTCIceTransportPolicy;
  /** Resolves once ICE servers are known; negotiation waits on it. */
  private iceReady: Promise<void> = Promise.resolve();
  private readonly events: SessionEvents;

  private pc: RTCPeerConnection | null = null;
  private ctl: RTCDataChannel | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private remoteScreen = new MediaStream();
  /** Shared msid holder so screen video+audio land in one sync group. */
  private screenMsid = new MediaStream();
  private localShare: MediaStream | null = null;
  private remoteVoice = new MediaStream();
  private remoteVoiceState: VoiceState = "off";
  private localVoice: MediaStreamTrack | null = null;
  private voiceMuted = false;
  private readonly resolveIce: (() => Promise<RTCIceServer[]>) | null;
  private closed = false;
  private phase: ConnectionPhase = "idle";

  constructor(options: PeerSessionOptions) {
    this.signaling = options.signaling;
    const ice = options.iceServers;
    this.iceServers = typeof ice === "function" ? [] : (ice ?? FALLBACK_ICE_SERVERS);
    this.iceTransportPolicy = options.iceTransportPolicy ?? "all";
    this.resolveIce = typeof ice === "function" ? ice : null;
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
    // Signals can arrive as soon as we join, so the gate must exist before that.
    let release!: () => void;
    this.iceReady = new Promise<void>((r) => (release = r));
    const result = await this.signaling.join(roomId);
    if (result.ok && this.resolveIce) {
      try {
        this.iceServers = await this.resolveIce();
      } catch (e) {
        this.iceServers = FALLBACK_ICE_SERVERS;
        this.events.onError?.(e instanceof Error ? e : new Error(String(e)));
      }
    }
    release();
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

  get voiceState(): VoiceState {
    return !this.localVoice ? "off" : this.voiceMuted ? "muted" : "live";
  }

  /** Starts sending this mic track, unmuted. The session owns and stops it. */
  startVoice(track: MediaStreamTrack): void {
    this.stopVoice();
    this.localVoice = track;
    this.voiceMuted = false;
    track.enabled = true;
    track.addEventListener("ended", () => {
      if (this.localVoice === track) {
        this.stopVoice();
        this.events.onLocalVoiceEnded?.();
      }
    });
    this.applyLocalVoice();
    this.sendVoiceState();
  }

  setVoiceMuted(muted: boolean): void {
    if (!this.localVoice) return;
    this.voiceMuted = muted;
    this.localVoice.enabled = !muted;
    this.sendVoiceState();
  }

  stopVoice(): void {
    const track = this.localVoice;
    if (!track) return;
    this.localVoice = null;
    this.voiceMuted = false;
    track.stop();
    this.applyLocalVoice();
    this.sendVoiceState();
  }

  close(): void {
    if (this.closed) return;
    this.stopSharing();
    this.stopVoice();
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
    await this.iceReady;
    if (this.closed) return;
    const pc = this.createPeer();
    pc.addTransceiver("video", { direction: "sendrecv", streams: [this.screenMsid] });
    pc.addTransceiver("audio", { direction: "sendrecv", streams: [this.screenMsid] });
    pc.addTransceiver("audio", { direction: "sendrecv" }); // voice (M4)
    this.ctl = this.createControlChannel(pc);
    this.applyLocalShare();
    this.applyLocalVoice();
    this.setPhase("negotiating");
    await pc.setLocalDescription();
    this.signaling.send({ kind: "offer", sdp: pc.localDescription!.toJSON() });
  }

  private async handleSignal(msg: SignalMessage): Promise<void> {
    await this.iceReady;
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
      this.applyLocalVoice();
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
    const pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      iceTransportPolicy: this.iceTransportPolicy,
    });
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
      } else if (slot === "voice") {
        this.remoteVoice.addTrack(e.track);
        this.events.onRemoteVoice?.(this.remoteVoice);
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
    this.remoteVoice = new MediaStream();
    if (hadRemote) this.events.onRemoteSharing?.(false);
    this.setRemoteVoiceState("off");
  }

  /** Negotiated data channel (id 0) carrying app-level control messages. */
  private createControlChannel(pc: RTCPeerConnection): RTCDataChannel {
    const ch = pc.createDataChannel("ctl", { negotiated: true, id: 0 });
    ch.onopen = () => {
      this.sendControl({ type: "share-state", sharing: this.isSharing });
      this.sendVoiceState();
    };
    ch.onmessage = (e) => {
      try {
        const msg = JSON.parse(String(e.data)) as ControlMessage;
        if (msg.type === "share-state") this.events.onRemoteSharing?.(msg.sharing);
        else if (msg.type === "voice-state") this.setRemoteVoiceState(msg.state);
      } catch {
        /* ignore malformed control messages */
      }
    };
    return ch;
  }

  private sendControl(msg: ControlMessage): void {
    if (this.ctl?.readyState === "open") this.ctl.send(JSON.stringify(msg));
  }

  private sendVoiceState(): void {
    this.sendControl({ type: "voice-state", state: this.voiceState });
  }

  private setRemoteVoiceState(state: VoiceState): void {
    if (state !== "off" && state !== "muted" && state !== "live") return;
    if (this.remoteVoiceState === state) return;
    this.remoteVoiceState = state;
    this.events.onRemoteVoiceState?.(state);
  }

  private applyLocalVoice(): void {
    const voice = this.pc?.getTransceivers()[2];
    if (voice) void voice.sender.replaceTrack(this.localVoice);
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
