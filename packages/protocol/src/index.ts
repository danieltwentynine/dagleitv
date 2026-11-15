/** Wire protocol shared by the signaling server and clients. */

export const MAX_PEERS_PER_ROOM = 2;

export type SignalMessage =
  | { kind: "offer"; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; sdp: RTCSessionDescriptionInit }
  | { kind: "ice-candidate"; candidate: RTCIceCandidateInit | null };

export type JoinResult =
  | { ok: true; /** true if a peer is already in the room (we are the polite peer). */ peerPresent: boolean }
  | { ok: false; error: "room-full" | "invalid-room" };

/** Text chat limits, enforced by the server and mirrored in the UI. */
export const CHAT_MAX_LENGTH = 500;

export interface ChatMessage {
  text: string;
  /** Server receive time, ms since epoch. */
  ts: number;
}

export interface JoinOptions {
  /**
   * Random per-session secret, never relayed to the partner. A join carrying
   * the id of a socket already in the room replaces that socket: it is the same
   * client coming back after a drop the server has not noticed yet.
   */
  clientId: string;
  /** True on a rejoin whose call is still up: the partner should keep it, not re-offer. */
  resume: boolean;
}

export interface ClientToServerEvents {
  join: (roomId: string, opts: JoinOptions, ack: (result: JoinResult) => void) => void;
  signal: (msg: SignalMessage) => void;
  /** Ack is true if relayed, false if dropped (empty or rate-limited). */
  chat: (text: string, ack: (sent: boolean) => void) => void;
}

export interface ServerToClientEvents {
  /** `resume` is the joiner's JoinOptions.resume. */
  "peer-joined": (resume: boolean) => void;
  "peer-left": () => void;
  signal: (msg: SignalMessage) => void;
  chat: (msg: ChatMessage) => void;
}

/** Room codes: 8+ chars, URL-safe. */
export const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** HTTP endpoint on the signaling server that hands out ICE (STUN/TURN) servers. */
export const ICE_PATH = "/ice";

export interface IceServersResponse {
  iceServers: { urls: string | string[]; username?: string; credential?: string }[];
  /** True if TURN relay credentials are included (false = STUN only). */
  turn: boolean;
}

export type IceErrorCode = "invalid-room" | "no-such-room" | "rate-limited";
