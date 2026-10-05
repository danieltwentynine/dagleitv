/** Wire protocol shared by the signaling server and clients. */

export const MAX_PEERS_PER_ROOM = 2;

export type SignalMessage =
  | { kind: "offer"; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; sdp: RTCSessionDescriptionInit }
  | { kind: "ice-candidate"; candidate: RTCIceCandidateInit | null };

export type JoinResult =
  | { ok: true; /** true if a peer is already in the room (we are the polite peer). */ peerPresent: boolean }
  | { ok: false; error: "room-full" | "invalid-room" };

export interface ClientToServerEvents {
  join: (roomId: string, ack: (result: JoinResult) => void) => void;
  signal: (msg: SignalMessage) => void;
}

export interface ServerToClientEvents {
  "peer-joined": () => void;
  "peer-left": () => void;
  signal: (msg: SignalMessage) => void;
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
