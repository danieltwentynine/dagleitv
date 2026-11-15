import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ChatMessage,
  JoinResult,
  ServerToClientEvents,
  SignalMessage,
} from "@dagleitv/protocol";

export interface SignalingHandlers {
  onSignal(msg: SignalMessage): void;
  /** `resume`: the partner's socket came back and they still have the call up. */
  onPeerJoined(resume: boolean): void;
  onPeerLeft(): void;
  onChat?(msg: ChatMessage): void;
  onDisconnect?(): void;
  /** The socket came back after a drop and joined the room again. */
  /** Asked when the socket reconnects: is the call still up, so the partner should keep it? */
  canResume?(): boolean;
  /** `resumed` is what canResume answered for this rejoin. */
  onRejoined?(result: JoinResult, resumed: boolean): void;
}

/** Transport abstraction so PeerSession doesn't depend on Socket.IO directly. */
export interface SignalingChannel {
  setHandlers(handlers: SignalingHandlers): void;
  join(roomId: string): Promise<JoinResult>;
  send(msg: SignalMessage): void;
  /** Resolves false if the server dropped the message (rate limit) or never answered. */
  sendChat(text: string): Promise<boolean>;
  close(): void;
}

export class SocketSignaling implements SignalingChannel {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  private handlers: SignalingHandlers | null = null;
  /** Set once the first join succeeds; Socket.IO reconnects on its own, so rejoin then. */
  private roomId: string | null = null;
  /** Lets the server swap our dead socket for the new one on a rejoin. */
  private readonly clientId = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");

  constructor(url: string) {
    this.socket = io(url, { transports: ["websocket"], autoConnect: false });
    this.socket.on("signal", (msg) => this.handlers?.onSignal(msg));
    this.socket.on("peer-joined", (resume) => this.handlers?.onPeerJoined(resume === true));
    this.socket.on("peer-left", () => this.handlers?.onPeerLeft());
    this.socket.on("chat", (msg) => this.handlers?.onChat?.(msg));
    this.socket.on("disconnect", () => this.handlers?.onDisconnect?.());
    this.socket.on("connect", () => {
      if (!this.roomId) return;
      const resume = this.handlers?.canResume?.() ?? false;
      this.socket.emit("join", this.roomId, { clientId: this.clientId, resume }, (r) =>
        this.handlers?.onRejoined?.(r, resume),
      );
    });
  }

  setHandlers(handlers: SignalingHandlers): void {
    this.handlers = handlers;
  }

  join(roomId: string): Promise<JoinResult> {
    return new Promise((resolve, reject) => {
      const onError = (err: Error) => reject(err);
      this.socket.once("connect_error", onError);
      this.socket.once("connect", () => {
        this.socket.off("connect_error", onError);
        // Without the timeout a lost ack would leave the caller waiting forever.
        this.socket.timeout(5000).emit("join", roomId, { clientId: this.clientId, resume: false }, (err, result) => {
          if (err) return reject(err);
          if (result.ok) this.roomId = roomId;
          resolve(result);
        });
      });
      this.socket.connect();
    });
  }

  send(msg: SignalMessage): void {
    this.socket.emit("signal", msg);
  }

  async sendChat(text: string): Promise<boolean> {
    try {
      return await this.socket.timeout(5000).emitWithAck("chat", text);
    } catch {
      return false;
    }
  }

  close(): void {
    this.handlers = null;
    this.roomId = null;
    this.socket.close();
  }
}
