import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  JoinResult,
  ServerToClientEvents,
  SignalMessage,
} from "@dagleitv/protocol";

export interface SignalingHandlers {
  onSignal(msg: SignalMessage): void;
  onPeerJoined(): void;
  onPeerLeft(): void;
  onDisconnect?(): void;
}

/** Transport abstraction so PeerSession doesn't depend on Socket.IO directly. */
export interface SignalingChannel {
  setHandlers(handlers: SignalingHandlers): void;
  join(roomId: string): Promise<JoinResult>;
  send(msg: SignalMessage): void;
  close(): void;
}

export class SocketSignaling implements SignalingChannel {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  private handlers: SignalingHandlers | null = null;

  constructor(url: string) {
    this.socket = io(url, { transports: ["websocket"], autoConnect: false });
    this.socket.on("signal", (msg) => this.handlers?.onSignal(msg));
    this.socket.on("peer-joined", () => this.handlers?.onPeerJoined());
    this.socket.on("peer-left", () => this.handlers?.onPeerLeft());
    this.socket.on("disconnect", () => this.handlers?.onDisconnect?.());
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
        this.socket.emit("join", roomId, resolve);
      });
      this.socket.connect();
    });
  }

  send(msg: SignalMessage): void {
    this.socket.emit("signal", msg);
  }

  close(): void {
    this.handlers = null;
    this.socket.close();
  }
}
